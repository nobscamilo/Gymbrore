import { z } from 'zod';

export const NutritionAdvancedClinicalProfileSchema = z
  .object({
    hba1cPct: z.coerce.number().min(4).max(18).optional(),
    fastingGlucoseMgDl: z.coerce.number().min(40).max(500).optional(),
    systolicBp: z.coerce.number().int().min(70).max(260).optional(),
    diastolicBp: z.coerce.number().int().min(40).max(160).optional(),
    egfr: z.coerce.number().min(5).max(180).optional(),
    potassiumMmolL: z.coerce.number().min(2).max(8).optional(),
    phosphorusMgDl: z.coerce.number().min(1).max(12).optional(),
    ntprobnpPgMl: z.coerce.number().min(5).max(70000).optional(),
    clinicianFluidLimitMl: z.coerce.number().int().min(800).max(4000).optional(),
  })
  .refine(
    (value) =>
      value.systolicBp === undefined ||
      value.diastolicBp === undefined ||
      value.systolicBp > value.diastolicBp,
    {
      message: "Systolic BP must be greater than diastolic BP.",
      path: ["systolicBp"],
    },
  );

const NutritionRiskSnapshotSchema = z.object({
    at: z.string().min(1),
    overallLevel: z.enum(["low", "medium", "high"]),
    overallScore: z.coerce.number().min(1).max(3),
    requiresClinicalReview: z.boolean(),
    hardStopCount: z.coerce.number().int().min(0).max(12),
    topSignalIds: z.array(z.enum(["sodium", "fluids", "carbs", "protein", "fiber", "warnings", "labs"])).max(6),
});

const NutritionSectionUsageSchema = z.object({
    views: z.coerce.number().int().min(0).max(200000),
    interactions: z.coerce.number().int().min(0).max(200000),
    avgResponseMs: z.coerce.number().min(0).max(60000),
    lastResponseMs: z.coerce.number().min(0).max(60000),
});

const NutritionUsageMetricsSchema = z.object({
    version: z.literal(1),
    lastUpdatedAt: z.string().min(1),
    sections: z.object({
        overview: NutritionSectionUsageSchema,
        settings: NutritionSectionUsageSchema,
        plan: NutritionSectionUsageSchema,
        risk: NutritionSectionUsageSchema,
    }),
    counters: z.object({
        generateAttempts: z.coerce.number().int().min(0).max(200000),
        generateSuccess: z.coerce.number().int().min(0).max(200000),
        generateBlockedHardStop: z.coerce.number().int().min(0).max(200000),
        quickSummaryToggles: z.coerce.number().int().min(0).max(200000),
        daySwitches: z.coerce.number().int().min(0).max(200000),
        accordionOpens: z.coerce.number().int().min(0).max(200000),
    }),
});

export const UserProfileSchema = z.object({
    uid: z.string(),
    email: z.string().email(),
    displayName: z.string().optional(),
    preferredLanguage: z.enum(['es', 'en']).optional(),
    legalTermsAccepted: z.boolean().optional(),
    legalPrivacyAccepted: z.boolean().optional(),
    legalHealthDisclaimerAccepted: z.boolean().optional(),
    legalAcceptedAt: z.string().optional(),
    legalVersion: z.string().min(1).optional(),

    // Physical Stats
    age: z.coerce.number().min(10).max(100).optional(),
    weight: z.coerce.number().min(30).max(300).optional(), // in kg
    height: z.coerce.number().min(100).max(250).optional(), // in cm

    // Training Info
    goal: z.enum(['hypertrophy', 'strength', 'endurance', 'weight_loss', 'maintenance']),
    equipment: z.enum(['gym', 'dumbbells', 'bodyweight']),
    experienceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    injuries: z.string().optional(),
    trainingDays: z.coerce.number().min(1).max(7).default(3),
    activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'athlete']).optional(),
    availableMinutesPerSession: z.coerce.number().min(20).max(240).optional(),
    currentPlan: z.string().optional(), // Stores stringified JSON of the plan
    currentPlanGeneratedAt: z.string().optional(),
    currentPlanAcceptedAt: z.string().optional(),
    planStartDate: z.string().optional(),
    autoWeeklyRefresh: z.boolean().optional(),
    dailyAdjustments: z.string().optional(), // JSON object keyed by YYYY-MM-DD with day adjustments
    dailySessionLogs: z.string().optional(), // JSON object keyed by YYYY-MM-DD with adherence/completion logs
    dailyTip: z.string().optional(),
    dailyTipDate: z.string().optional(), // YYYY-MM-DD

    // Nutrition / Clinical
    clinicalConditions: z
      .array(z.enum([
        "diabetes",
        "obesity",
        "hypertension",
        "ckd",
        "heart_failure",
        "frailty",
        "ibs",
        "lactose_intolerance",
        "celiac",
      ]))
      .optional(),
    nutritionAllergies: z.string().max(600).optional(),
    nutritionWeightCheckMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    nutritionWeightCheckAt: z.string().optional(),
    nutritionAthleteMode: z.boolean().optional(),
    nutritionDietaryNotes: z.string().max(600).optional(),
    nutritionAdvancedProfileEnabled: z.boolean().optional(),
    nutritionAdvancedClinicalProfile: NutritionAdvancedClinicalProfileSchema.optional(),
    nutritionPlan: z.string().optional(), // Stores stringified JSON of the nutrition plan
    nutritionPlanGeneratedAt: z.string().optional(),
    nutritionRiskHistory: z.array(NutritionRiskSnapshotSchema).max(120).optional(),
    nutritionUsageMetrics: NutritionUsageMetricsSchema.optional(),

    createdAt: z.any(), // Timestamp
    updatedAt: z.any(), // Timestamp
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type NutritionAdvancedClinicalProfile = z.infer<typeof NutritionAdvancedClinicalProfileSchema>;
export type NutritionRiskSnapshot = z.infer<typeof NutritionRiskSnapshotSchema>;
export type NutritionSectionUsage = z.infer<typeof NutritionSectionUsageSchema>;
export type NutritionUsageMetrics = z.infer<typeof NutritionUsageMetricsSchema>;
