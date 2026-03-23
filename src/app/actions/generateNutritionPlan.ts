'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from "zod";
import {
  ClinicalCondition,
  ClinicalConditionSchema,
  NutritionPlan,
  NutritionPlanSchema,
} from "@/lib/nutrition";
import { NutritionAdvancedClinicalProfileSchema, UserProfile } from "@/lib/types";
import { resolveGenAiApiKey, resolveGenAiModel } from "@/lib/genai";

const NutritionGenerationInputSchema = z.object({
  profile: z.object({
    age: z.coerce.number().min(10).max(100),
    weight: z.coerce.number().min(30).max(300),
    height: z.coerce.number().min(100).max(250).optional(),
    goal: z.enum(["hypertrophy", "strength", "endurance", "weight_loss", "maintenance"]),
    trainingDays: z.coerce.number().int().min(1).max(7),
    availableMinutesPerSession: z.coerce.number().min(20).max(240).optional(),
    preferredLanguage: z.enum(["es", "en"]).optional(),
  }),
  clinicalConditions: z.array(ClinicalConditionSchema).default([]),
  allergies: z.string().min(2).max(600),
  athleteMode: z.boolean().default(false),
  dietaryNotes: z.string().max(600).optional(),
  advancedClinicalProfile: NutritionAdvancedClinicalProfileSchema.optional(),
});

type NutritionGenerationInput = z.infer<typeof NutritionGenerationInputSchema>;

type MacroTargets = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
  fluidsMl: number;
  constraintsApplied: string[];
  warnings: string[];
};

const NutritionAiGuidanceSchema = z.object({
  summary: z.string().min(20).max(320),
  warnings: z.array(z.string().min(8).max(220)).max(4).default([]),
  perDayGuidance: z.array(z.array(z.string().min(8).max(220)).max(2)).length(7),
});

type NutritionAiGuidance = z.infer<typeof NutritionAiGuidanceSchema>;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const roundToInt = (value: number): number => Math.round(value);
const dedupeText = (items: string[]): string[] =>
  Array.from(new Set(items.map((item) => item.trim()).filter((item) => item.length > 0)));

const extractJsonObject = (text: string): unknown => {
  const stripped = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  const candidate = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
  return JSON.parse(candidate);
};

const buildWorkoutSlots = (trainingDays: number): number[] => {
  const safeTargets = Math.min(Math.max(trainingDays, 0), 7);
  if (safeTargets <= 0) {
    return [];
  }

  if (safeTargets >= 7) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  if (safeTargets === 1) {
    return [0];
  }

  const slots = new Set<number>();
  for (let i = 0; i < safeTargets; i += 1) {
    slots.add(Math.round((i * 6) / (safeTargets - 1)));
  }

  return Array.from(slots).sort((a, b) => a - b);
};

const hasCondition = (conditions: ClinicalCondition[], condition: ClinicalCondition): boolean =>
  conditions.includes(condition);

const applyClinicalHardCaps = (
  targets: MacroTargets,
  input: NutritionGenerationInput,
): MacroTargets => {
  const conditions = input.clinicalConditions;
  const advanced = input.advancedClinicalProfile;
  const constraintsApplied = [...targets.constraintsApplied];
  const warnings = [...targets.warnings];

  let kcal = targets.kcal;
  let proteinG = targets.proteinG;
  let carbsG = targets.carbsG;
  let fatG = targets.fatG;
  let sodiumMg = targets.sodiumMg;
  let fluidsMl = targets.fluidsMl;
  let fiberG = targets.fiberG;

  const rebalanceMacros = (): void => {
    fatG = roundToInt((kcal - proteinG * 4 - carbsG * 4) / 9);
    fatG = clamp(fatG, 35, 180);
    if (carbsG < 70) {
      carbsG = 70;
      fatG = roundToInt((kcal - proteinG * 4 - carbsG * 4) / 9);
      fatG = clamp(fatG, 35, 180);
    }
  };

  if (hasCondition(conditions, "diabetes") && carbsG > 220) {
    carbsG = 220;
    constraintsApplied.push("hard cap: diabetes carbs <= 220 g/day");
    rebalanceMacros();
  }

  if (hasCondition(conditions, "ckd") && proteinG > 90) {
    proteinG = 90;
    constraintsApplied.push("hard cap: ckd protein <= 90 g/day");
    rebalanceMacros();
  }

  if ((hasCondition(conditions, "diabetes") || hasCondition(conditions, "obesity")) && fiberG < 30) {
    fiberG = 30;
    constraintsApplied.push("hard floor: metabolic fiber >= 30 g/day");
  }

  const sodiumCap = hasCondition(conditions, "heart_failure")
    ? 1600
    : (hasCondition(conditions, "hypertension") || hasCondition(conditions, "ckd"))
      ? 1800
      : 2300;
  if (sodiumMg > sodiumCap) {
    sodiumMg = sodiumCap;
    constraintsApplied.push(`hard cap: sodium <= ${sodiumCap} mg/day`);
  }

  if (hasCondition(conditions, "heart_failure") && fluidsMl > 1800) {
    fluidsMl = 1800;
    constraintsApplied.push("hard cap: heart failure fluids <= 1800 ml/day");
    warnings.push("heart failure fluid target reached hard cap; verify with clinical follow-up");
  } else if (hasCondition(conditions, "ckd") && fluidsMl > 2100) {
    fluidsMl = 2100;
    constraintsApplied.push("hard cap: ckd fluids <= 2100 ml/day");
  }

  if (hasCondition(conditions, "frailty") && kcal < 1500) {
    kcal = 1500;
    constraintsApplied.push("hard floor: frailty kcal >= 1500/day");
    rebalanceMacros();
  }

  if (advanced?.clinicianFluidLimitMl !== undefined && fluidsMl > advanced.clinicianFluidLimitMl) {
    fluidsMl = advanced.clinicianFluidLimitMl;
    constraintsApplied.push(`hard cap: clinician fluid limit <= ${advanced.clinicianFluidLimitMl} ml/day`);
  }

  if (advanced?.egfr !== undefined) {
    if (advanced.egfr < 30 && proteinG > 75) {
      proteinG = 75;
      constraintsApplied.push("hard cap: advanced profile eGFR < 30, protein <= 75 g/day");
      rebalanceMacros();
    } else if (advanced.egfr < 45 && proteinG > 85) {
      proteinG = 85;
      constraintsApplied.push("hard cap: advanced profile eGFR < 45, protein <= 85 g/day");
      rebalanceMacros();
    }

    if (advanced.egfr < 30 && sodiumMg > 1700) {
      sodiumMg = 1700;
      constraintsApplied.push("hard cap: advanced profile eGFR < 30, sodium <= 1700 mg/day");
    }
  }

  if (
    (advanced?.hba1cPct !== undefined && advanced.hba1cPct >= 9) ||
    (advanced?.fastingGlucoseMgDl !== undefined && advanced.fastingGlucoseMgDl >= 220)
  ) {
    if (carbsG > 180) {
      carbsG = 180;
      constraintsApplied.push("hard cap: uncontrolled glycemia profile, carbs <= 180 g/day");
      rebalanceMacros();
    }
    warnings.push("advanced glycemic markers suggest tighter carb distribution and medical follow-up");
  }

  if (
    advanced?.systolicBp !== undefined &&
    advanced?.diastolicBp !== undefined &&
    advanced.systolicBp >= 160 &&
    advanced.diastolicBp >= 100 &&
    sodiumMg > 1600
  ) {
    sodiumMg = 1600;
    constraintsApplied.push("hard cap: severe hypertension profile, sodium <= 1600 mg/day");
    warnings.push("blood pressure in severe range requires clinician review");
  }

  if (advanced?.ntprobnpPgMl !== undefined && advanced.ntprobnpPgMl > 1800 && fluidsMl > 1600) {
    fluidsMl = 1600;
    constraintsApplied.push("hard cap: elevated NT-proBNP profile, fluids <= 1600 ml/day");
    warnings.push("elevated NT-proBNP profile requires close fluid/sodium monitoring");
  }

  if (advanced?.potassiumMmolL !== undefined && advanced.potassiumMmolL >= 5.3) {
    warnings.push("potassium is elevated in advanced profile; prioritize low-potassium choices and monitor labs");
  }

  if (advanced?.phosphorusMgDl !== undefined && advanced.phosphorusMgDl >= 4.8) {
    warnings.push("phosphorus is elevated in advanced profile; review phosphate-dense foods");
  }

  return {
    kcal: roundToInt(kcal),
    proteinG: roundToInt(proteinG),
    carbsG: roundToInt(carbsG),
    fatG: roundToInt(fatG),
    fiberG: roundToInt(fiberG),
    sodiumMg: roundToInt(sodiumMg),
    fluidsMl: roundToInt(fluidsMl),
    constraintsApplied: dedupeText(constraintsApplied),
    warnings: dedupeText(warnings),
  };
};

const calculateMacroTargets = (input: NutritionGenerationInput): MacroTargets => {
  const { profile, clinicalConditions, athleteMode } = input;
  const constraintsApplied: string[] = [];
  const warnings: string[] = [];

  const availabilityFactor = profile.availableMinutesPerSession
    ? clamp(profile.availableMinutesPerSession / 80, 0.75, 1.25)
    : 1;
  const activityFactor = 1.2 + profile.trainingDays * 0.05 * availabilityFactor;
  const maintenanceKcal = profile.weight * 22 * activityFactor;

  const goalDelta: Record<UserProfile["goal"], number> = {
    hypertrophy: 250,
    strength: 120,
    endurance: 150,
    weight_loss: -420,
    maintenance: 0,
  };

  let targetKcal = maintenanceKcal + goalDelta[profile.goal];
  if (hasCondition(clinicalConditions, "obesity")) {
    targetKcal -= 200;
    constraintsApplied.push("obesity: moderate calorie deficit");
  }
  if (hasCondition(clinicalConditions, "frailty")) {
    targetKcal += 150;
    constraintsApplied.push("frailty: avoid aggressive deficit");
  }
  targetKcal = clamp(targetKcal, 1200, 3900);

  let proteinPerKg: Record<UserProfile["goal"], number>[UserProfile["goal"]] = 1.4;
  if (profile.goal === "hypertrophy" || profile.goal === "strength" || profile.goal === "weight_loss") {
    proteinPerKg = 1.8;
  } else if (profile.goal === "endurance") {
    proteinPerKg = 1.5;
  }

  if (hasCondition(clinicalConditions, "frailty")) {
    proteinPerKg = Math.max(proteinPerKg, 1.1);
    constraintsApplied.push("frailty: prioritize protein quality/distribution");
  }

  if (hasCondition(clinicalConditions, "ckd")) {
    proteinPerKg = Math.min(proteinPerKg, 0.8);
    constraintsApplied.push("ckd: limit protein load");
  }

  if (athleteMode && !hasCondition(clinicalConditions, "ckd")) {
    proteinPerKg += 0.2;
    constraintsApplied.push("athlete mode: higher recovery protein");
  }

  if (athleteMode && hasCondition(clinicalConditions, "ckd")) {
    warnings.push("athlete mode + CKD can conflict; review with clinician before high-protein strategies");
  }

  const proteinG = roundToInt(profile.weight * proteinPerKg);
  const proteinKcal = proteinG * 4;

  let carbRatio: Record<UserProfile["goal"], number>[UserProfile["goal"]] = 0.4;
  if (profile.goal === "endurance") {
    carbRatio = 0.5;
  } else if (profile.goal === "hypertrophy") {
    carbRatio = 0.45;
  } else if (profile.goal === "strength") {
    carbRatio = 0.42;
  } else if (profile.goal === "weight_loss") {
    carbRatio = 0.38;
  }

  if (hasCondition(clinicalConditions, "diabetes")) {
    carbRatio -= 0.05;
    constraintsApplied.push("diabetes: controlled carb distribution + fiber");
  }
  if (athleteMode) {
    carbRatio += hasCondition(clinicalConditions, "diabetes") ? 0.02 : 0.05;
    constraintsApplied.push("athlete mode: performance-oriented carbs");
  }
  carbRatio = clamp(carbRatio, 0.3, 0.55);

  let carbsG = roundToInt((targetKcal * carbRatio) / 4);
  let fatG = roundToInt((targetKcal - proteinKcal - carbsG * 4) / 9);

  if (fatG < 35) {
    fatG = 35;
    carbsG = roundToInt((targetKcal - proteinKcal - fatG * 9) / 4);
  }
  if (carbsG < 70) {
    carbsG = 70;
    fatG = roundToInt((targetKcal - proteinKcal - carbsG * 4) / 9);
  }

  let sodiumMg = 2300;
  if (hasCondition(clinicalConditions, "hypertension")) {
    sodiumMg = Math.min(sodiumMg, 1800);
    constraintsApplied.push("hypertension: tighter sodium cap");
  }
  if (hasCondition(clinicalConditions, "heart_failure")) {
    sodiumMg = Math.min(sodiumMg, 1600);
    constraintsApplied.push("heart failure: stricter sodium management");
  }
  if (hasCondition(clinicalConditions, "ckd")) {
    sodiumMg = Math.min(sodiumMg, 1800);
    constraintsApplied.push("ckd: sodium and fluid vigilance");
  }

  let fluidsMl = 2400;
  if (athleteMode) {
    fluidsMl += 400;
  }
  if (hasCondition(clinicalConditions, "ckd")) {
    fluidsMl = Math.min(fluidsMl, 2000);
  }
  if (hasCondition(clinicalConditions, "heart_failure")) {
    fluidsMl = Math.min(fluidsMl, 1700);
    warnings.push("fluid targets in heart failure should be individualized with clinician follow-up");
  }
  if (hasCondition(clinicalConditions, "frailty") && !hasCondition(clinicalConditions, "heart_failure")) {
    fluidsMl = Math.max(fluidsMl, 2100);
  }

  const fiberG = hasCondition(clinicalConditions, "diabetes") || hasCondition(clinicalConditions, "obesity")
    ? 35
    : 28;

  if (hasCondition(clinicalConditions, "ckd")) {
    warnings.push("monitor potassium and phosphorus-rich foods based on lab trend and CKD stage");
  }
  if (hasCondition(clinicalConditions, "ibs")) {
    constraintsApplied.push("ibs: prioritize low-FODMAP distribution and symptom-guided trigger control");
    warnings.push("for IBS, adjust high-FODMAP foods based on tolerance and symptom diary");
  }
  if (hasCondition(clinicalConditions, "lactose_intolerance")) {
    constraintsApplied.push("lactose intolerance: use lactose-free dairy or non-dairy alternatives");
  }
  if (hasCondition(clinicalConditions, "celiac")) {
    constraintsApplied.push("celiac disease: strict gluten-free plan with cross-contamination prevention");
    warnings.push("celiac profile: avoid cross-contamination from shared utensils/surfaces");
  }
  if (input.allergies.trim().length > 0) {
    constraintsApplied.push(`declared allergies/intolerances: ${input.allergies.trim()}`);
  }
  if (input.dietaryNotes && input.dietaryNotes.trim().length > 0) {
    constraintsApplied.push("custom dietary notes applied");
  }

  const baseTargets: MacroTargets = {
    kcal: roundToInt(targetKcal),
    proteinG,
    carbsG,
    fatG,
    fiberG,
    sodiumMg,
    fluidsMl,
    constraintsApplied,
    warnings,
  };

  return applyClinicalHardCaps(baseTargets, input);
};

const dayLabel = (index: number, language: "es" | "en"): string =>
  language === "en" ? `Day ${index + 1}` : `Dia ${index + 1}`;

const mealName = (index: number, language: "es" | "en"): string => {
  const namesEn = ["Breakfast", "Lunch", "Snack", "Dinner"];
  const namesEs = ["Desayuno", "Comida", "Colacion", "Cena"];
  return language === "en" ? namesEn[index] : namesEs[index];
};

type PortionUnit = "g" | "ml" | "unit" | "tbsp";
type WeightBasis = "raw" | "cooked";

type MealPortionComponent = {
  nameEs: string;
  nameEn: string;
  amount: number;
  unit: PortionUnit;
  weightBasis?: WeightBasis;
  scalable?: boolean;
  noteEs?: string;
  noteEn?: string;
};

type MealTemplate = {
  baseKcal: number;
  components: MealPortionComponent[];
};

const mealTemplatePools: MealTemplate[][] = [
  [
    {
      baseKcal: 520,
      components: [
        { nameEs: "avena integral", nameEn: "rolled oats", amount: 60, unit: "g", weightBasis: "raw", noteEs: "peso en seco", noteEn: "dry weight" },
        { nameEs: "yogur natural", nameEn: "plain yogurt", amount: 200, unit: "g", weightBasis: "cooked" },
        { nameEs: "chia", nameEn: "chia seeds", amount: 12, unit: "g", weightBasis: "raw" },
        { nameEs: "frutos rojos", nameEn: "berries", amount: 100, unit: "g", weightBasis: "raw" },
      ],
    },
    {
      baseKcal: 500,
      components: [
        { nameEs: "huevos", nameEn: "eggs", amount: 3, unit: "unit" },
        { nameEs: "espinaca", nameEn: "spinach", amount: 80, unit: "g", weightBasis: "raw" },
        { nameEs: "pan integral", nameEn: "whole-grain bread", amount: 70, unit: "g", weightBasis: "cooked" },
        { nameEs: "manzana o pera", nameEn: "apple or pear", amount: 160, unit: "g", weightBasis: "raw" },
      ],
    },
    {
      baseKcal: 490,
      components: [
        { nameEs: "yogur griego natural", nameEn: "plain Greek yogurt", amount: 220, unit: "g", weightBasis: "cooked" },
        { nameEs: "nueces", nameEn: "walnuts", amount: 20, unit: "g", weightBasis: "raw" },
        { nameEs: "pera", nameEn: "pear", amount: 170, unit: "g", weightBasis: "raw" },
        { nameEs: "avena integral", nameEn: "rolled oats", amount: 25, unit: "g", weightBasis: "raw", noteEs: "peso en seco", noteEn: "dry weight" },
      ],
    },
  ],
  [
    {
      baseKcal: 700,
      components: [
        { nameEs: "pechuga de pollo", nameEn: "chicken breast", amount: 160, unit: "g", weightBasis: "raw" },
        { nameEs: "quinoa cocida", nameEn: "cooked quinoa", amount: 180, unit: "g", weightBasis: "cooked" },
        { nameEs: "ensalada verde", nameEn: "green salad", amount: 150, unit: "g", weightBasis: "raw" },
        { nameEs: "aceite de oliva", nameEn: "olive oil", amount: 12, unit: "ml", scalable: false },
      ],
    },
    {
      baseKcal: 690,
      components: [
        { nameEs: "lentejas cocidas", nameEn: "cooked lentils", amount: 220, unit: "g", weightBasis: "cooked" },
        { nameEs: "pescado blanco", nameEn: "white fish", amount: 140, unit: "g", weightBasis: "raw" },
        { nameEs: "ensalada de pepino", nameEn: "cucumber salad", amount: 150, unit: "g", weightBasis: "raw" },
        { nameEs: "aceite de oliva", nameEn: "olive oil", amount: 10, unit: "ml", scalable: false },
      ],
    },
    {
      baseKcal: 710,
      components: [
        { nameEs: "pavo", nameEn: "turkey", amount: 170, unit: "g", weightBasis: "raw" },
        { nameEs: "arroz integral cocido", nameEn: "cooked brown rice", amount: 4, unit: "tbsp" },
        { nameEs: "vegetales mixtos", nameEn: "mixed vegetables", amount: 180, unit: "g", weightBasis: "raw" },
        { nameEs: "aguacate", nameEn: "avocado", amount: 60, unit: "g", weightBasis: "raw", scalable: false },
      ],
    },
  ],
  [
    {
      baseKcal: 240,
      components: [
        { nameEs: "yogur natural", nameEn: "plain yogurt", amount: 180, unit: "g", weightBasis: "cooked" },
        { nameEs: "semillas mixtas", nameEn: "mixed seeds", amount: 15, unit: "g", weightBasis: "raw" },
        { nameEs: "fresas", nameEn: "strawberries", amount: 120, unit: "g", weightBasis: "raw" },
      ],
    },
    {
      baseKcal: 250,
      components: [
        { nameEs: "hummus bajo sodio", nameEn: "low-sodium hummus", amount: 70, unit: "g", weightBasis: "cooked" },
        { nameEs: "zanahoria", nameEn: "carrot", amount: 120, unit: "g", weightBasis: "raw" },
        { nameEs: "pepino", nameEn: "cucumber", amount: 120, unit: "g", weightBasis: "raw" },
      ],
    },
    {
      baseKcal: 260,
      components: [
        { nameEs: "requeson bajo en sal", nameEn: "low-salt cottage cheese", amount: 170, unit: "g", weightBasis: "cooked" },
        { nameEs: "fruta de bajo indice glucemico", nameEn: "low-glycemic fruit", amount: 150, unit: "g", weightBasis: "raw" },
        { nameEs: "almendras", nameEn: "almonds", amount: 15, unit: "g", weightBasis: "raw", scalable: false },
      ],
    },
  ],
  [
    {
      baseKcal: 620,
      components: [
        { nameEs: "salmon", nameEn: "salmon", amount: 150, unit: "g", weightBasis: "raw" },
        { nameEs: "verduras asadas", nameEn: "roasted vegetables", amount: 220, unit: "g", weightBasis: "cooked" },
        { nameEs: "papa cocida", nameEn: "boiled potato", amount: 160, unit: "g", weightBasis: "cooked" },
        { nameEs: "aceite de oliva", nameEn: "olive oil", amount: 10, unit: "ml", scalable: false },
      ],
    },
    {
      baseKcal: 610,
      components: [
        { nameEs: "tofu firme", nameEn: "firm tofu", amount: 180, unit: "g", weightBasis: "raw" },
        { nameEs: "brocoli y calabacin", nameEn: "broccoli and zucchini", amount: 220, unit: "g", weightBasis: "cooked" },
        { nameEs: "arroz integral cocido", nameEn: "cooked brown rice", amount: 130, unit: "g", weightBasis: "cooked" },
      ],
    },
    {
      baseKcal: 600,
      components: [
        { nameEs: "crema de verduras casera", nameEn: "homemade vegetable soup", amount: 320, unit: "ml" },
        { nameEs: "huevos", nameEn: "eggs", amount: 3, unit: "unit" },
        { nameEs: "ensalada verde", nameEn: "green salad", amount: 130, unit: "g", weightBasis: "raw" },
      ],
    },
  ],
];

const roundPortionAmount = (value: number, unit: PortionUnit): number => {
  if (unit === "unit" || unit === "tbsp") {
    return Math.max(1, Math.round(value));
  }

  return Math.max(5, Math.round(value / 5) * 5);
};

const formatPortionedItem = (
  component: MealPortionComponent,
  scale: number,
  language: "es" | "en",
): string => {
  const isScalable = component.scalable !== false;
  const scaled = roundPortionAmount(isScalable ? component.amount * scale : component.amount, component.unit);
  const name = language === "en" ? component.nameEn : component.nameEs;
  const note = language === "en" ? component.noteEn : component.noteEs;
  const weightBasisText = component.weightBasis
    ? (
      language === "en"
        ? component.weightBasis === "raw"
          ? "weigh raw"
          : "weigh cooked"
        : component.weightBasis === "raw"
          ? "pesar en crudo"
          : "pesar cocido"
    )
    : undefined;
  const trailingNote = [note, weightBasisText].filter(Boolean).join(" | ");

  if (component.unit === "g") {
    return `${scaled} g ${language === "en" ? "of" : "de"} ${name}${trailingNote ? ` (${trailingNote})` : ""}`;
  }

  if (component.unit === "ml") {
    return `${scaled} ml ${language === "en" ? "of" : "de"} ${name}${trailingNote ? ` (${trailingNote})` : ""}`;
  }

  if (component.unit === "tbsp") {
    return language === "en"
      ? `${scaled} tbsp ${name}${trailingNote ? ` (${trailingNote})` : ""}`
      : `${scaled} cucharadas de ${name}${trailingNote ? ` (${trailingNote})` : ""}`;
  }

  return language === "en"
    ? `${scaled} units ${name}${trailingNote ? ` (${trailingNote})` : ""}`
    : `${scaled} unidades de ${name}${trailingNote ? ` (${trailingNote})` : ""}`;
};

const buildMealItems = (
  template: MealTemplate,
  mealKcal: number,
  clinicalConditions: ClinicalCondition[],
  allergies: string,
  language: "es" | "en",
): string[] => {
  const scale = clamp(mealKcal / template.baseKcal, 0.7, 1.4);
  const normalizedAllergies = allergies
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hasCondition = (condition: ClinicalCondition): boolean => clinicalConditions.includes(condition);
  const hasAllergyToken = (tokens: string[]): boolean => tokens.some((token) => normalizedAllergies.includes(token));

  const adaptComponent = (component: MealPortionComponent): MealPortionComponent => {
    const nameEs = component.nameEs.toLowerCase();
    const nameEn = component.nameEn.toLowerCase();
    const isDairy = /yogur|requeson|queso|leche/.test(nameEs) || /yogurt|cheese|milk|dairy/.test(nameEn);
    const isGlutenSource = /pan|avena integral/.test(nameEs) || /bread|rolled oats/.test(nameEn);
    const isHighFodmap = /lentejas|hummus|pera|manzana|brocoli/.test(nameEs) || /lentils|hummus|pear|apple|broccoli/.test(nameEn);
    const isEgg = /huevo/.test(nameEs) || /egg/.test(nameEn);
    const isFish = /salmon|pescado/.test(nameEs) || /salmon|fish/.test(nameEn);
    const isNut = /nueces|almendras/.test(nameEs) || /walnuts|almonds|nuts/.test(nameEn);

    if (hasCondition("lactose_intolerance") && isDairy) {
      return {
        ...component,
        nameEs: "yogur o queso sin lactosa",
        nameEn: "lactose-free yogurt or cheese",
      };
    }

    if (hasCondition("celiac") && isGlutenSource) {
      return {
        ...component,
        nameEs: component.nameEs.includes("pan") ? "pan sin gluten" : "avena certificada sin gluten",
        nameEn: component.nameEn.includes("bread") ? "gluten-free bread" : "certified gluten-free oats",
      };
    }

    if (hasCondition("ibs") && isHighFodmap) {
      return {
        ...component,
        nameEs: "opcion baja en FODMAP equivalente",
        nameEn: "equivalent low-FODMAP option",
      };
    }

    if (hasAllergyToken(["huevo", "egg"]) && isEgg) {
      return {
        ...component,
        nameEs: "tofu firme",
        nameEn: "firm tofu",
        unit: "g",
        amount: 150,
        weightBasis: "raw",
      };
    }

    if (hasAllergyToken(["pescado", "fish", "marisco", "seafood"]) && isFish) {
      return {
        ...component,
        nameEs: "pechuga de pollo o tofu firme",
        nameEn: "chicken breast or firm tofu",
      };
    }

    if (hasAllergyToken(["frutos secos", "nueces", "nuts", "almond", "walnut"]) && isNut) {
      return {
        ...component,
        nameEs: "semillas de girasol o calabaza",
        nameEn: "sunflower or pumpkin seeds",
      };
    }

    if (hasAllergyToken(["lactosa", "lactose", "leche", "milk"]) && isDairy) {
      return {
        ...component,
        nameEs: "version sin lactosa",
        nameEn: "lactose-free version",
      };
    }

    if (hasAllergyToken(["gluten", "trigo", "wheat"]) && isGlutenSource) {
      return {
        ...component,
        nameEs: "version sin gluten",
        nameEn: "gluten-free version",
      };
    }

    return component;
  };

  return template.components
    .map((component) => adaptComponent(component))
    .map((component) => formatPortionedItem(component, scale, language));
};

const buildDayGuidance = (
  language: "es" | "en",
  isTrainingDay: boolean,
  conditions: ClinicalCondition[],
  allergies: string,
): string[] => {
  const guidance: string[] = [];
  if (language === "en") {
    guidance.push(isTrainingDay ? "Place most carbs around training window for performance and recovery." : "Use this lower-demand day to prioritize vegetables, hydration, and recovery.");
    if (conditions.includes("diabetes")) {
      guidance.push("Prefer low-glycemic carbs and spread intake across meals.");
    }
    if (conditions.includes("hypertension") || conditions.includes("heart_failure")) {
      guidance.push("Avoid processed high-sodium foods and prioritize fresh cooking.");
    }
    if (conditions.includes("ckd")) {
      guidance.push("Adjust potassium/phosphorus choices according to current lab trend.");
    }
    if (conditions.includes("ibs")) {
      guidance.push("Use low-FODMAP substitutions and test one trigger at a time.");
    }
    if (conditions.includes("lactose_intolerance")) {
      guidance.push("Use lactose-free dairy alternatives and split portions.");
    }
    if (conditions.includes("celiac")) {
      guidance.push("Strictly avoid gluten and cross-contamination at preparation.");
    }
    if (allergies.trim().length > 0) {
      guidance.push("Exclude all declared allergens in every meal and snack.");
    }
  } else {
    guidance.push(isTrainingDay ? "Concentra la mayor parte de carbohidratos alrededor del entrenamiento para rendimiento y recuperacion." : "En dia de menor carga prioriza verduras, hidratacion y recuperacion.");
    if (conditions.includes("diabetes")) {
      guidance.push("Prioriza carbohidratos de bajo indice glucemico y distribuye tomas.");
    }
    if (conditions.includes("hypertension") || conditions.includes("heart_failure")) {
      guidance.push("Evita ultraprocesados altos en sodio y cocina fresco.");
    }
    if (conditions.includes("ckd")) {
      guidance.push("Ajusta potasio/fosforo segun tendencia de laboratorio.");
    }
    if (conditions.includes("ibs")) {
      guidance.push("Usa sustituciones bajas en FODMAP y prueba un detonante por vez.");
    }
    if (conditions.includes("lactose_intolerance")) {
      guidance.push("Usa alternativas sin lactosa y divide porciones.");
    }
    if (conditions.includes("celiac")) {
      guidance.push("Evita gluten estricto y contaminacion cruzada en preparacion.");
    }
    if (allergies.trim().length > 0) {
      guidance.push("Excluye todos los alergenos declarados en cada comida y colacion.");
    }
  }

  return guidance.slice(0, 4);
};

const buildDefaultSummary = (language: "es" | "en"): string =>
  language === "en"
    ? "Personalized clinical nutrition plan integrated with your weekly training demand."
    : "Plan nutricional clinico personalizado integrado con tu demanda semanal de entrenamiento.";

const buildConditionText = (
  language: "es" | "en",
  conditions: ClinicalCondition[]
): string => {
  if (conditions.length === 0) {
    return language === "en" ? "No additional clinical conditions reported." : "Sin condiciones clinicas adicionales reportadas.";
  }

  const labels: Record<ClinicalCondition, { es: string; en: string }> = {
    diabetes: { es: "diabetes", en: "diabetes" },
    obesity: { es: "obesidad", en: "obesity" },
    hypertension: { es: "hipertension", en: "hypertension" },
    ckd: { es: "enfermedad renal cronica", en: "chronic kidney disease" },
    heart_failure: { es: "insuficiencia cardiaca", en: "heart failure" },
    frailty: { es: "fragilidad", en: "frailty" },
    ibs: { es: "sindrome de intestino irritable", en: "irritable bowel syndrome" },
    lactose_intolerance: { es: "intolerancia a la lactosa", en: "lactose intolerance" },
    celiac: { es: "celiaquia", en: "celiac disease" },
  };

  return conditions.map((condition) => labels[condition][language]).join(", ");
};

const buildAdvancedProfileText = (
  language: "es" | "en",
  profile: NutritionGenerationInput["advancedClinicalProfile"],
): string => {
  if (!profile) {
    return language === "en" ? "none" : "sin datos avanzados";
  }

  const parts: string[] = [];
  if (profile.hba1cPct !== undefined) parts.push(`HbA1c ${profile.hba1cPct}%`);
  if (profile.fastingGlucoseMgDl !== undefined) parts.push(`fasting glucose ${profile.fastingGlucoseMgDl} mg/dL`);
  if (profile.systolicBp !== undefined && profile.diastolicBp !== undefined) parts.push(`BP ${profile.systolicBp}/${profile.diastolicBp} mmHg`);
  if (profile.egfr !== undefined) parts.push(`eGFR ${profile.egfr}`);
  if (profile.potassiumMmolL !== undefined) parts.push(`K ${profile.potassiumMmolL} mmol/L`);
  if (profile.phosphorusMgDl !== undefined) parts.push(`P ${profile.phosphorusMgDl} mg/dL`);
  if (profile.ntprobnpPgMl !== undefined) parts.push(`NT-proBNP ${profile.ntprobnpPgMl} pg/mL`);
  if (profile.clinicianFluidLimitMl !== undefined) parts.push(`fluid limit ${profile.clinicianFluidLimitMl} ml/day`);

  if (parts.length === 0) {
    return language === "en" ? "none" : "sin datos avanzados";
  }

  return parts.join("; ");
};

const requestAiNutritionGuidance = async (
  input: NutritionGenerationInput,
  macroTargets: MacroTargets,
): Promise<NutritionAiGuidance | null> => {
  const apiKey = resolveGenAiApiKey();
  if (!apiKey) {
    return null;
  }

  const language = input.profile.preferredLanguage === "en" ? "en" : "es";
  const modelName = resolveGenAiModel();
  const genAi = new GoogleGenerativeAI(apiKey);
  const model = genAi.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.35,
      responseMimeType: "application/json",
    },
  });

  const prompt = `
You are a multidisciplinary clinical board assistant composed of:
- Sports medicine specialist
- Endocrinologist
- Cardiologist
- Physiotherapist
- Clinical nutrition specialist

Generate only adherence guidance that stays inside the fixed nutrition targets below.
Act conservatively and prioritize safety over performance whenever constraints conflict.

Patient summary:
- Goal: ${input.profile.goal}
- Age: ${input.profile.age}
- Weight: ${input.profile.weight} kg
- Training days: ${input.profile.trainingDays}
- Athlete mode: ${input.athleteMode ? "enabled" : "disabled"}
- Clinical conditions: ${buildConditionText(language, input.clinicalConditions)}
- Declared allergies/intolerances: ${input.allergies}
- Dietary notes: ${input.dietaryNotes?.trim() || "none"}
- Advanced clinical profile: ${buildAdvancedProfileText(language, input.advancedClinicalProfile)}
- Language: ${language === "en" ? "English" : "Spanish"}

Locked daily targets (do not alter):
- Energy: ${macroTargets.kcal} kcal
- Protein: ${macroTargets.proteinG} g
- Carbs: ${macroTargets.carbsG} g
- Fat: ${macroTargets.fatG} g
- Fiber: ${macroTargets.fiberG} g
- Sodium cap: ${macroTargets.sodiumMg} mg
- Fluids: ${macroTargets.fluidsMl} ml
- Constraints: ${macroTargets.constraintsApplied.join("; ") || "none"}

Safety rules:
1. Do not diagnose or change medications.
2. Do not contradict sodium/fluid/protein constraints.
3. Do not include foods that violate declared allergies/intolerances.
4. Keep tips practical and non-technical for patient adherence.
5. If CKD or heart failure appears, include cautious follow-up wording.
6. If data is insufficient for safe guidance in a diagnosed condition, issue a warning.
7. Output ONLY valid JSON in ${language === "en" ? "English" : "Spanish"}.

Return schema:
{
  "summary": "single sentence plan summary",
  "warnings": ["optional warning 1", "optional warning 2"],
  "perDayGuidance": [
    ["tip 1", "tip 2"],
    ["tip 1", "tip 2"],
    ["tip 1", "tip 2"],
    ["tip 1", "tip 2"],
    ["tip 1", "tip 2"],
    ["tip 1", "tip 2"],
    ["tip 1", "tip 2"]
  ]
}
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const raw = extractJsonObject(response.text());
    return NutritionAiGuidanceSchema.parse(raw);
  } catch (error) {
    console.error("Nutrition AI guidance generation failed:", error);
    return null;
  }
};

const buildNutritionPlan = (
  input: NutritionGenerationInput,
  macroTargets: MacroTargets,
  aiGuidance: NutritionAiGuidance | null,
): NutritionPlan => {
  const language = input.profile.preferredLanguage === "en" ? "en" : "es";
  const workoutSlots = buildWorkoutSlots(input.profile.trainingDays);
  const percentages = [0.25, 0.35, 0.1, 0.3];

  const days = Array.from({ length: 7 }, (_, dayIndex) => {
    const isTrainingDay = workoutSlots.includes(dayIndex);
    const dayKcal = isTrainingDay ? macroTargets.kcal : Math.max(1000, macroTargets.kcal - 120);
    const dayCarbs = isTrainingDay
      ? macroTargets.carbsG
      : roundToInt(macroTargets.carbsG * 0.9);
    const dayProtein = macroTargets.proteinG;
    const fatFromRemainder = roundToInt((dayKcal - dayProtein * 4 - dayCarbs * 4) / 9);
    const dayFat = clamp(fatFromRemainder, 25, 180);

    const meals = percentages.map((ratio, mealIndex) => {
      const kcal = roundToInt(dayKcal * ratio);
      const protein = roundToInt(dayProtein * ratio);
      const carbs = roundToInt(dayCarbs * ratio);
      const fat = roundToInt(dayFat * ratio);
      const templates = mealTemplatePools[mealIndex];
      const template = templates[(dayIndex + mealIndex) % templates.length];
      const items = buildMealItems(template, kcal, input.clinicalConditions, input.allergies, language);

      return {
        name: mealName(mealIndex, language),
        items,
        kcal,
        carbsG: carbs,
        proteinG: protein,
        fatG: fat,
      };
    });

    return {
      day: dayLabel(dayIndex, language),
      targetKcal: dayKcal,
      proteinG: dayProtein,
      carbsG: dayCarbs,
      fatG: dayFat,
      fiberG: macroTargets.fiberG,
      sodiumMg: macroTargets.sodiumMg,
      fluidsMl: macroTargets.fluidsMl,
      meals,
      guidance: [
        ...buildDayGuidance(language, isTrainingDay, input.clinicalConditions, input.allergies),
        ...(aiGuidance?.perDayGuidance[dayIndex] ?? []),
      ].slice(0, 6),
    };
  });

  return NutritionPlanSchema.parse({
    version: 1,
    generatedAt: new Date().toISOString(),
    language,
    summary: aiGuidance?.summary ?? buildDefaultSummary(language),
    constraintsApplied: macroTargets.constraintsApplied,
    warnings: dedupeText([
      ...macroTargets.warnings,
      ...(aiGuidance?.warnings ?? []),
      language === "en"
        ? "Portion references are edible weight; grains are listed cooked unless marked dry."
        : "Las porciones se expresan en peso comestible; cereales en cocido salvo que diga peso en seco.",
    ]),
    days,
  });
};

export async function generateNutritionPlan(input: unknown): Promise<NutritionPlan> {
  const validated = NutritionGenerationInputSchema.parse(input);
  const macroTargets = calculateMacroTargets(validated);
  const aiGuidance = await requestAiNutritionGuidance(validated, macroTargets);
  return buildNutritionPlan(validated, macroTargets, aiGuidance);
}
