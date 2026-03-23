import { ClinicalCondition, NutritionDay, NutritionPlan } from "@/lib/nutrition";
import { NutritionAdvancedClinicalProfile } from "@/lib/types";

export type RiskLevel = "low" | "medium" | "high";
export type RiskSignalId = "sodium" | "fluids" | "carbs" | "protein" | "fiber" | "warnings" | "labs";

export type RiskSignal = {
  id: RiskSignalId;
  level: RiskLevel;
  score: number;
  metric: string;
  message: string;
  action: string;
  hardStop: boolean;
};

export type HardStopSignal = {
  id: RiskSignalId;
  metric: string;
  message: string;
  action: string;
};

export type DayRiskAssessment = {
  level: RiskLevel;
  score: number;
  signals: RiskSignal[];
  hardStops: RiskSignal[];
};

export type PlanRiskAssessment = {
  overallLevel: RiskLevel;
  overallScore: number;
  dayAssessments: DayRiskAssessment[];
  topSignals: RiskSignal[];
  hardStops: HardStopSignal[];
  requiresClinicalReview: boolean;
  recommendedActions: string[];
};

export type ClinicalInputHardStop = {
  condition: ClinicalCondition;
  metric: string;
  reason: string;
  action: string;
};

const scoreByLevel: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const label = (language: "es" | "en", en: string, es: string): string =>
  language === "en" ? en : es;

const signal = (
  id: RiskSignal["id"],
  level: RiskLevel,
  metric: string,
  message: string,
  action: string,
  hardStop = false,
): RiskSignal => ({
  id,
  level,
  score: scoreByLevel[level],
  metric,
  message,
  action,
  hardStop,
});

const resolveSodiumLimit = (conditions: ClinicalCondition[]): number => {
  if (conditions.includes("heart_failure")) {
    return 1600;
  }
  if (conditions.includes("hypertension") || conditions.includes("ckd")) {
    return 1800;
  }
  return 2300;
};

const assessDaySignals = (
  day: NutritionDay,
  conditions: ClinicalCondition[],
  athleteMode: boolean,
  planWarningsCount: number,
  language: "es" | "en",
): RiskSignal[] => {
  const signals: RiskSignal[] = [];
  const sodiumLimit = resolveSodiumLimit(conditions);

  if (day.sodiumMg > sodiumLimit) {
    const isHardStop = day.sodiumMg > Math.round(sodiumLimit * 1.15);
    signals.push(signal(
      "sodium",
      "high",
      `${day.sodiumMg} mg`,
      label(
        language,
        isHardStop
          ? "Critical sodium excess for current profile."
          : "Sodium target exceeds recommended limit for profile.",
        isHardStop
          ? "Exceso critico de sodio para el perfil actual."
          : "Objetivo de sodio por encima del limite recomendado para el perfil.",
      ),
      label(
        language,
        `Lower sodium below ${sodiumLimit} mg immediately and avoid processed foods today.`,
        `Baja el sodio por debajo de ${sodiumLimit} mg hoy y evita ultraprocesados.`,
      ),
      isHardStop,
    ));
  } else if (day.sodiumMg > Math.round(sodiumLimit * 0.9)) {
    signals.push(signal(
      "sodium",
      "medium",
      `${day.sodiumMg} mg`,
      label(language, "Sodium target is close to upper limit.", "Objetivo de sodio cerca del limite superior."),
      label(language, "Use no-added-salt meals for the rest of the day.", "Usa comidas sin sal anadida el resto del dia."),
    ));
  }

  if (conditions.includes("heart_failure")) {
    if (day.fluidsMl > 1800) {
      const isHardStop = day.fluidsMl > 1900;
      signals.push(signal(
        "fluids",
        "high",
        `${day.fluidsMl} ml`,
        label(
          language,
          isHardStop
            ? "Critical fluid target for heart failure profile."
            : "Fluid target is high for heart failure profile.",
          isHardStop
            ? "Objetivo critico de liquidos para perfil con insuficiencia cardiaca."
            : "Objetivo de liquidos alto para perfil con insuficiencia cardiaca.",
        ),
        label(language, "Restrict fluids now and confirm target with your clinician.", "Restringe liquidos ahora y confirma objetivo con tu clinico."),
        isHardStop,
      ));
    } else if (day.fluidsMl > 1700) {
      signals.push(signal(
        "fluids",
        "medium",
        `${day.fluidsMl} ml`,
        label(language, "Fluid target is near upper clinical threshold.", "Objetivo de liquidos cerca del umbral clinico superior."),
        label(language, "Track fluid intake by bottle and stop free refills.", "Controla liquidos por botella y evita recargas libres."),
      ));
    }
  } else if (conditions.includes("ckd")) {
    if (day.fluidsMl > 2100) {
      const isHardStop = day.fluidsMl > 2300;
      signals.push(signal(
        "fluids",
        "high",
        `${day.fluidsMl} ml`,
        label(
          language,
          isHardStop
            ? "Critical fluid target for CKD profile."
            : "Fluid target can be excessive for CKD profile.",
          isHardStop
            ? "Objetivo critico de liquidos para perfil de ERC."
            : "Objetivo de liquidos puede ser excesivo para perfil de ERC.",
        ),
        label(language, "Reduce fluids and recheck nephrology recommendation.", "Reduce liquidos y revisa recomendacion de nefrologia."),
        isHardStop,
      ));
    } else if (day.fluidsMl > 1900) {
      signals.push(signal(
        "fluids",
        "medium",
        `${day.fluidsMl} ml`,
        label(language, "Fluid target is near upper CKD range.", "Objetivo de liquidos cerca del rango superior para ERC."),
        label(language, "Use measured portions for soups/infusions today.", "Usa porciones medidas para sopas/infusiones hoy."),
      ));
    }
  } else if (athleteMode && day.fluidsMl < 2200) {
    signals.push(signal(
      "fluids",
      "medium",
      `${day.fluidsMl} ml`,
      label(language, "Hydration target may be low for athlete mode.", "Objetivo de hidratacion puede ser bajo para modo deportista."),
      label(language, "Increase hydration around training blocks.", "Aumenta hidratacion alrededor del entrenamiento."),
    ));
  }

  if (conditions.includes("diabetes")) {
    if (day.carbsG > 220) {
      const isHardStop = day.carbsG > 260;
      signals.push(signal(
        "carbs",
        "high",
        `${day.carbsG} g`,
        label(
          language,
          isHardStop
            ? "Critical carbohydrate load for diabetes profile."
            : "Carbohydrate load is high for diabetes profile.",
          isHardStop
            ? "Carga critica de carbohidratos para perfil con diabetes."
            : "Carga de carbohidratos alta para perfil con diabetes.",
        ),
        label(language, "Shift to lower-glycemic carbs and split portions across meals.", "Pasa a carbohidratos de bajo IG y divide porciones entre comidas."),
        isHardStop,
      ));
    } else if (day.carbsG > 180) {
      signals.push(signal(
        "carbs",
        "medium",
        `${day.carbsG} g`,
        label(language, "Carbohydrate load is moderate-high for diabetes profile.", "Carga de carbohidratos moderada-alta para perfil con diabetes."),
        label(language, "Replace one starch serving with vegetables.", "Reemplaza una porcion de almidon por verduras."),
      ));
    }
  }

  if (conditions.includes("ckd")) {
    if (day.proteinG > 90) {
      const isHardStop = day.proteinG > 100;
      signals.push(signal(
        "protein",
        "high",
        `${day.proteinG} g`,
        label(
          language,
          isHardStop
            ? "Critical protein target for CKD profile."
            : "Protein target is high for CKD profile.",
          isHardStop
            ? "Objetivo critico de proteina para perfil de ERC."
            : "Objetivo de proteina alto para perfil de ERC.",
        ),
        label(language, "Reduce concentrated protein portions and check nephrology target.", "Reduce porciones altas de proteina y confirma objetivo con nefrologia."),
        isHardStop,
      ));
    } else if (day.proteinG > 75) {
      signals.push(signal(
        "protein",
        "medium",
        `${day.proteinG} g`,
        label(language, "Protein target is near upper CKD range.", "Objetivo de proteina cerca del rango superior para ERC."),
        label(language, "Use moderate portions of protein in each meal.", "Usa porciones moderadas de proteina en cada comida."),
      ));
    }
  }

  if ((conditions.includes("diabetes") || conditions.includes("obesity")) && day.fiberG < 30) {
    const isHardStop = day.fiberG < 22;
    signals.push(signal(
      "fiber",
      day.fiberG < 26 ? "high" : "medium",
      `${day.fiberG} g`,
      label(
        language,
        isHardStop
          ? "Critically low fiber for glycemic/metabolic control."
          : "Fiber target may be low for glycemic/metabolic control.",
        isHardStop
          ? "Fibra criticamente baja para control glucemico/metabolico."
          : "Objetivo de fibra puede ser bajo para control glucemico/metabolico.",
      ),
      label(language, "Add legumes/vegetables/whole grains in two meals today.", "Agrega legumbres/verduras/integrales en dos comidas hoy."),
      isHardStop,
    ));
  }

  if (planWarningsCount > 0) {
    const isHardStop = planWarningsCount >= 3;
    signals.push(signal(
      "warnings",
      planWarningsCount > 1 ? "high" : "medium",
      `${planWarningsCount}`,
      label(
        language,
        isHardStop
          ? "Multiple clinical warnings require priority review."
          : "Clinical warnings exist in current plan.",
        isHardStop
          ? "Multiples alertas clinicas requieren revision prioritaria."
          : "Existen alertas clinicas en el plan actual.",
      ),
      label(language, "Hold this plan and request clinician review before full adherence.", "Pausa este plan y solicita revision clinica antes de adherencia completa."),
      isHardStop,
    ));
  }

  return signals;
};

const assessAdvancedProfileSignals = (
  advancedProfile: NutritionAdvancedClinicalProfile | undefined,
  plan: NutritionPlan,
  language: "es" | "en",
): RiskSignal[] => {
  if (!advancedProfile) {
    return [];
  }

  const signals: RiskSignal[] = [];

  if (advancedProfile.hba1cPct !== undefined) {
    if (advancedProfile.hba1cPct >= 9) {
      signals.push(signal(
        "labs",
        "high",
        `HbA1c ${advancedProfile.hba1cPct}%`,
        label(language, "Advanced profile indicates uncontrolled glycemia.", "Perfil avanzado indica glucemia no controlada."),
        label(language, "Use strict carb distribution and request diabetes follow-up.", "Usa distribucion estricta de carbohidratos y solicita seguimiento de diabetes."),
        true,
      ));
    } else if (advancedProfile.hba1cPct >= 8) {
      signals.push(signal(
        "labs",
        "medium",
        `HbA1c ${advancedProfile.hba1cPct}%`,
        label(language, "Advanced profile shows elevated HbA1c.", "Perfil avanzado muestra HbA1c elevada."),
        label(language, "Reinforce low-glycemic meals and frequent glucose tracking.", "Refuerza comidas de bajo IG y seguimiento frecuente de glucosa."),
      ));
    }
  }

  if (advancedProfile.fastingGlucoseMgDl !== undefined) {
    if (advancedProfile.fastingGlucoseMgDl >= 220) {
      signals.push(signal(
        "labs",
        "high",
        `${advancedProfile.fastingGlucoseMgDl} mg/dL`,
        label(language, "Advanced profile fasting glucose is critically high.", "Glucosa en ayunas del perfil avanzado criticamente alta."),
        label(language, "Avoid high-glycemic loads today and confirm medication plan with clinician.", "Evita cargas glucemicas altas hoy y confirma plan farmacologico con clinico."),
        true,
      ));
    } else if (advancedProfile.fastingGlucoseMgDl >= 180) {
      signals.push(signal(
        "labs",
        "medium",
        `${advancedProfile.fastingGlucoseMgDl} mg/dL`,
        label(language, "Advanced profile fasting glucose is elevated.", "Glucosa en ayunas del perfil avanzado elevada."),
        label(language, "Reduce refined carbs and distribute intake in smaller portions.", "Reduce carbohidratos refinados y distribuye en porciones pequenas."),
      ));
    }
  }

  if (advancedProfile.systolicBp !== undefined && advancedProfile.diastolicBp !== undefined) {
    if (advancedProfile.systolicBp >= 180 || advancedProfile.diastolicBp >= 110) {
      signals.push(signal(
        "labs",
        "high",
        `${advancedProfile.systolicBp}/${advancedProfile.diastolicBp} mmHg`,
        label(language, "Advanced blood pressure profile is in critical range.", "Perfil de presion arterial avanzada en rango critico."),
        label(language, "Do not escalate training intensity and prioritize urgent clinical review.", "No escales intensidad de entrenamiento y prioriza revision clinica urgente."),
        true,
      ));
    } else if (advancedProfile.systolicBp >= 160 || advancedProfile.diastolicBp >= 100) {
      signals.push(signal(
        "labs",
        "high",
        `${advancedProfile.systolicBp}/${advancedProfile.diastolicBp} mmHg`,
        label(language, "Advanced blood pressure profile is severely elevated.", "Perfil de presion arterial avanzada severamente elevado."),
        label(language, "Tighten sodium control and coordinate blood pressure follow-up.", "Ajusta control de sodio y coordina seguimiento de presion arterial."),
      ));
    }
  }

  if (advancedProfile.egfr !== undefined) {
    if (advancedProfile.egfr < 30) {
      signals.push(signal(
        "labs",
        "high",
        `eGFR ${advancedProfile.egfr}`,
        label(language, "Advanced profile eGFR indicates severe renal impairment.", "eGFR del perfil avanzado indica deterioro renal severo."),
        label(language, "Use strict renal targets and confirm plan with nephrology.", "Usa objetivos renales estrictos y confirma plan con nefrologia."),
        true,
      ));
    } else if (advancedProfile.egfr < 45) {
      signals.push(signal(
        "labs",
        "medium",
        `eGFR ${advancedProfile.egfr}`,
        label(language, "Advanced profile eGFR indicates moderate renal impairment.", "eGFR del perfil avanzado indica deterioro renal moderado."),
        label(language, "Maintain moderated protein/sodium and monitor labs closely.", "Mantiene proteina/sodio moderados y monitorea laboratorios."),
      ));
    }
  }

  if (advancedProfile.potassiumMmolL !== undefined) {
    if (advancedProfile.potassiumMmolL >= 5.5) {
      signals.push(signal(
        "labs",
        "high",
        `K ${advancedProfile.potassiumMmolL} mmol/L`,
        label(language, "Advanced profile potassium is critically elevated.", "Potasio del perfil avanzado criticamente elevado."),
        label(language, "Reduce high-potassium foods and seek immediate clinical review.", "Reduce alimentos altos en potasio y busca revision clinica inmediata."),
        true,
      ));
    } else if (advancedProfile.potassiumMmolL >= 5.1) {
      signals.push(signal(
        "labs",
        "medium",
        `K ${advancedProfile.potassiumMmolL} mmol/L`,
        label(language, "Advanced profile potassium is elevated.", "Potasio del perfil avanzado elevado."),
        label(language, "Prioritize low-potassium choices and follow-up labs.", "Prioriza opciones bajas en potasio y control de laboratorio."),
      ));
    }
  }

  if (advancedProfile.ntprobnpPgMl !== undefined && advancedProfile.ntprobnpPgMl > 1800) {
    signals.push(signal(
      "labs",
      "high",
      `NT-proBNP ${advancedProfile.ntprobnpPgMl} pg/mL`,
      label(language, "Advanced profile NT-proBNP suggests higher congestion risk.", "NT-proBNP del perfil avanzado sugiere mayor riesgo de congestion."),
      label(language, "Apply tighter fluid/sodium limits and confirm with cardiology.", "Aplica limites mas estrictos de liquidos/sodio y confirma con cardiologia."),
      true,
    ));
  }

  if (advancedProfile.clinicianFluidLimitMl !== undefined) {
    const fluidLimit = advancedProfile.clinicianFluidLimitMl;
    const dayAboveLimit = plan.days.find((day) => day.fluidsMl > fluidLimit);
    if (dayAboveLimit) {
      const isHardStop = dayAboveLimit.fluidsMl > Math.round(fluidLimit * 1.1);
      signals.push(signal(
        "labs",
        "high",
        `${dayAboveLimit.fluidsMl} ml`,
        label(
          language,
          "Plan exceeds clinician-defined fluid limit.",
          "El plan supera el limite de liquidos definido por el clinico.",
        ),
        label(
          language,
          `Lower fluids below ${fluidLimit} ml/day immediately.`,
          `Baja liquidos por debajo de ${fluidLimit} ml/dia de inmediato.`,
        ),
        isHardStop,
      ));
    }
  }

  return signals;
};

const resolveOverallLevel = (signals: RiskSignal[]): RiskLevel => {
  if (signals.some((entry) => entry.hardStop)) {
    return "high";
  }

  if (signals.some((entry) => entry.level === "high")) {
    return "high";
  }

  const mediumCount = signals.filter((entry) => entry.level === "medium").length;
  if (mediumCount >= 2) {
    return "medium";
  }

  return "low";
};

export const riskLevelLabel = (level: RiskLevel, language: "es" | "en"): string => {
  if (level === "high") {
    return language === "en" ? "High risk" : "Riesgo alto";
  }
  if (level === "medium") {
    return language === "en" ? "Moderate risk" : "Riesgo moderado";
  }
  return language === "en" ? "Low risk" : "Riesgo bajo";
};

export const assessNutritionRisk = (
  plan: NutritionPlan,
  conditions: ClinicalCondition[],
  athleteMode: boolean,
  language: "es" | "en",
  advancedProfile?: NutritionAdvancedClinicalProfile,
): PlanRiskAssessment => {
  const dayAssessments = plan.days.map((day) => {
    const signals = assessDaySignals(day, conditions, athleteMode, plan.warnings.length, language);
    const level = resolveOverallLevel(signals);
    const score = signals.length > 0
      ? Math.round((signals.reduce((acc, current) => acc + current.score, 0) / signals.length) * 10) / 10
      : 1;
    const hardStops = signals.filter((entry) => entry.hardStop);

    return {
      level,
      score,
      signals,
      hardStops,
    };
  });

  const profileSignals = assessAdvancedProfileSignals(advancedProfile, plan, language);
  const allSignals = [...dayAssessments.flatMap((entry) => entry.signals), ...profileSignals];
  const sortedSignals = [...allSignals].sort((a, b) => {
    if (a.hardStop !== b.hardStop) {
      return a.hardStop ? -1 : 1;
    }
    return b.score - a.score;
  });
  const topSignals: RiskSignal[] = [];

  for (const candidate of sortedSignals) {
    if (topSignals.find((entry) => entry.id === candidate.id && entry.message === candidate.message)) {
      continue;
    }
    topSignals.push(candidate);
    if (topSignals.length >= 4) {
      break;
    }
  }

  const overallLevel = resolveOverallLevel(allSignals);
  const overallScore = allSignals.length > 0
    ? Math.round((allSignals.reduce((acc, entry) => acc + entry.score, 0) / allSignals.length) * 10) / 10
    : 1;
  const hardStops: HardStopSignal[] = [];

  for (const candidate of allSignals.filter((entry) => entry.hardStop)) {
    if (hardStops.find((entry) => entry.id === candidate.id && entry.message === candidate.message)) {
      continue;
    }
    hardStops.push({
      id: candidate.id,
      metric: candidate.metric,
      message: candidate.message,
      action: candidate.action,
    });
    if (hardStops.length >= 5) {
      break;
    }
  }

  const recommendedActions = dedupeActions(
    hardStops.length > 0
      ? hardStops.map((entry) => entry.action)
      : sortedSignals.map((entry) => entry.action),
  ).slice(0, 4);

  return {
    overallLevel,
    overallScore,
    dayAssessments,
    topSignals,
    hardStops,
    requiresClinicalReview: hardStops.length > 0,
    recommendedActions,
  };
};

export const assessClinicalInputHardStops = (
  conditions: ClinicalCondition[],
  advancedProfile: NutritionAdvancedClinicalProfile | undefined,
  language: "es" | "en",
  options?: { frailtyWeightLossGoal?: boolean },
): ClinicalInputHardStop[] => {
  if (!advancedProfile && !options?.frailtyWeightLossGoal) {
    return [];
  }

  const hardStops: ClinicalInputHardStop[] = [];
  const hasCondition = (condition: ClinicalCondition): boolean => conditions.includes(condition);

  const pushHardStop = (entry: ClinicalInputHardStop): void => {
    const duplicate = hardStops.find((current) => current.condition === entry.condition && current.reason === entry.reason);
    if (!duplicate) {
      hardStops.push(entry);
    }
  };

  if (
    hasCondition("diabetes") &&
    advancedProfile?.fastingGlucoseMgDl !== undefined &&
    advancedProfile.fastingGlucoseMgDl >= 300
  ) {
    pushHardStop({
      condition: "diabetes",
      metric: `${advancedProfile.fastingGlucoseMgDl} mg/dL`,
      reason: label(
        language,
        "Fasting glucose is in a dangerous range for autonomous plan generation.",
        "La glucosa en ayunas esta en un rango peligroso para generar el plan sin supervision.",
      ),
      action: label(
        language,
        "Pause generation and request urgent diabetes review before continuing.",
        "Pausa la generacion y solicita revision urgente de diabetes antes de continuar.",
      ),
    });
  }

  if (
    hasCondition("diabetes") &&
    advancedProfile?.hba1cPct !== undefined &&
    advancedProfile.hba1cPct >= 10
  ) {
    pushHardStop({
      condition: "diabetes",
      metric: `HbA1c ${advancedProfile.hba1cPct}%`,
      reason: label(
        language,
        "HbA1c suggests severe glycemic decompensation.",
        "La HbA1c sugiere descompensacion glucemica severa.",
      ),
      action: label(
        language,
        "Use clinician-directed nutrition only until metabolic control improves.",
        "Usa nutricion dirigida por clinico hasta mejorar control metabolico.",
      ),
    });
  }

  if (
    (hasCondition("hypertension") || hasCondition("heart_failure")) &&
    advancedProfile?.systolicBp !== undefined &&
    advancedProfile?.diastolicBp !== undefined &&
    (advancedProfile.systolicBp >= 180 || advancedProfile.diastolicBp >= 120)
  ) {
    pushHardStop({
      condition: hasCondition("heart_failure") ? "heart_failure" : "hypertension",
      metric: `${advancedProfile.systolicBp}/${advancedProfile.diastolicBp} mmHg`,
      reason: label(
        language,
        "Blood pressure is in hypertensive crisis range.",
        "La presion arterial esta en rango de crisis hipertensiva.",
      ),
      action: label(
        language,
        "Block plan generation and prioritize urgent blood-pressure stabilization.",
        "Bloquea la generacion del plan y prioriza estabilizacion urgente de la presion arterial.",
      ),
    });
  }

  if (
    hasCondition("ckd") &&
    advancedProfile?.egfr !== undefined &&
    advancedProfile.egfr < 20
  ) {
    pushHardStop({
      condition: "ckd",
      metric: `eGFR ${advancedProfile.egfr}`,
      reason: label(
        language,
        "Renal function is severely reduced.",
        "La funcion renal esta severamente reducida.",
      ),
      action: label(
        language,
        "Use nephrology-defined renal diet targets before any automatic plan.",
        "Usa objetivos de dieta renal definidos por nefrologia antes de cualquier plan automatico.",
      ),
    });
  }

  if (
    hasCondition("ckd") &&
    advancedProfile?.potassiumMmolL !== undefined &&
    advancedProfile.potassiumMmolL >= 5.8
  ) {
    pushHardStop({
      condition: "ckd",
      metric: `K ${advancedProfile.potassiumMmolL} mmol/L`,
      reason: label(
        language,
        "Potassium is in severe hyperkalemia range.",
        "El potasio esta en rango de hiperkalemia severa.",
      ),
      action: label(
        language,
        "Do not generate plan until potassium risk is medically addressed.",
        "No generes plan hasta abordar medicamente el riesgo de potasio.",
      ),
    });
  }

  if (
    hasCondition("heart_failure") &&
    advancedProfile?.ntprobnpPgMl !== undefined &&
    advancedProfile.ntprobnpPgMl >= 2500
  ) {
    pushHardStop({
      condition: "heart_failure",
      metric: `NT-proBNP ${advancedProfile.ntprobnpPgMl} pg/mL`,
      reason: label(
        language,
        "NT-proBNP suggests decompensation risk.",
        "El NT-proBNP sugiere riesgo de descompensacion.",
      ),
      action: label(
        language,
        "Use cardiology-led fluid/sodium targets before automated diet generation.",
        "Usa objetivos de liquidos/sodio guiados por cardiologia antes de generar dieta automatica.",
      ),
    });
  }

  if (hasCondition("frailty") && options?.frailtyWeightLossGoal) {
    pushHardStop({
      condition: "frailty",
      metric: label(language, "Weight-loss goal + frailty", "Objetivo de perdida de peso + fragilidad"),
      reason: label(
        language,
        "Frailty with active weight-loss goal has high malnutrition risk.",
        "Fragilidad con objetivo de perdida de peso tiene alto riesgo de desnutricion.",
      ),
      action: label(
        language,
        "Switch to maintenance/recovery strategy and confirm with clinician.",
        "Cambia a estrategia de mantenimiento/recuperacion y confirma con el clinico.",
      ),
    });
  }

  return hardStops.slice(0, 6);
};

const dedupeActions = (actions: string[]): string[] => {
  return Array.from(new Set(actions.map((action) => action.trim()).filter((action) => action.length > 0)));
};
