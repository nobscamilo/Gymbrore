import { z } from "zod";

export const ClinicalConditionSchema = z.enum([
  "diabetes",
  "obesity",
  "hypertension",
  "ckd",
  "heart_failure",
  "frailty",
  "ibs",
  "lactose_intolerance",
  "celiac",
]);

export const NutritionMealSchema = z.object({
  name: z.string().min(1),
  items: z.array(z.string().min(1)).min(1).max(8),
  kcal: z.coerce.number().min(50).max(1400),
  carbsG: z.coerce.number().min(0).max(220),
  proteinG: z.coerce.number().min(0).max(120),
  fatG: z.coerce.number().min(0).max(80),
});

export const NutritionDaySchema = z.object({
  day: z.string().min(1),
  targetKcal: z.coerce.number().min(900).max(5000),
  proteinG: z.coerce.number().min(20).max(320),
  carbsG: z.coerce.number().min(20).max(600),
  fatG: z.coerce.number().min(10).max(220),
  fiberG: z.coerce.number().min(10).max(70),
  sodiumMg: z.coerce.number().min(800).max(4000),
  fluidsMl: z.coerce.number().min(800).max(5000),
  meals: z.array(NutritionMealSchema).min(3).max(6),
  guidance: z.array(z.string().min(1)).max(8).default([]),
});

export const NutritionPlanSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().min(1),
  language: z.enum(["es", "en"]),
  summary: z.string().min(1),
  constraintsApplied: z.array(z.string().min(1)).default([]),
  warnings: z.array(z.string().min(1)).default([]),
  days: z.array(NutritionDaySchema).min(1).max(7),
});

export type ClinicalCondition = z.infer<typeof ClinicalConditionSchema>;
export type NutritionMeal = z.infer<typeof NutritionMealSchema>;
export type NutritionDay = z.infer<typeof NutritionDaySchema>;
export type NutritionPlan = z.infer<typeof NutritionPlanSchema>;

export const parseNutritionPlan = (rawPlan: string): NutritionPlan | null => {
  try {
    const parsed = JSON.parse(rawPlan);
    return NutritionPlanSchema.parse(parsed);
  } catch {
    return null;
  }
};

export const stringifyNutritionPlan = (plan: NutritionPlan): string => {
  return JSON.stringify(plan);
};

export const clinicalConditionLabel = (
  condition: ClinicalCondition,
  language: "es" | "en"
): string => {
  const labels: Record<ClinicalCondition, { es: string; en: string }> = {
    diabetes: { es: "Diabetes", en: "Diabetes" },
    obesity: { es: "Obesidad", en: "Obesity" },
    hypertension: { es: "Hipertension arterial", en: "Hypertension" },
    ckd: { es: "Enfermedad renal cronica", en: "Chronic kidney disease" },
    heart_failure: { es: "Insuficiencia cardiaca", en: "Heart failure" },
    frailty: { es: "Anciano fragil", en: "Frailty" },
    ibs: { es: "Sindrome de intestino irritable", en: "Irritable bowel syndrome" },
    lactose_intolerance: { es: "Intolerancia a la lactosa", en: "Lactose intolerance" },
    celiac: { es: "Celiaquia", en: "Celiac disease" },
  };

  return labels[condition][language];
};
