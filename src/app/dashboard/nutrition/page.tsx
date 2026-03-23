"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getUserProfile, updateUserProfile } from "@/lib/firebase/firestore";
import {
  NutritionAdvancedClinicalProfile,
  NutritionRiskSnapshot,
  NutritionSectionUsage,
  NutritionUsageMetrics,
} from "@/lib/types";
import {
  ClinicalCondition,
  clinicalConditionLabel,
  parseNutritionPlan,
  stringifyNutritionPlan,
  NutritionPlan,
} from "@/lib/nutrition";
import {
  assessClinicalInputHardStops,
  assessNutritionRisk,
  ClinicalInputHardStop,
  riskLevelLabel,
  PlanRiskAssessment,
  RiskLevel,
  RiskSignal,
  RiskSignalId,
} from "@/lib/nutritionRisk";
import { generateNutritionPlan } from "@/app/actions/generateNutritionPlan";
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, Droplets, HeartPulse, ShieldCheck, Flame, ChevronDown } from "lucide-react";

const conditionOrder: ClinicalCondition[] = [
  "diabetes",
  "obesity",
  "hypertension",
  "ckd",
  "heart_failure",
  "frailty",
  "ibs",
  "lactose_intolerance",
  "celiac",
];

const riskLevelClasses: Record<RiskLevel, string> = {
  low: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  medium: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  high: "border-rose-400/40 bg-rose-500/10 text-rose-200",
};

const riskBarClasses: Record<RiskLevel, string> = {
  low: "bg-emerald-500/80",
  medium: "bg-amber-500/80",
  high: "bg-rose-500/80",
};

const MAX_RISK_HISTORY_ITEMS = 24;
type DayAccordionKey = "risk" | "meals" | "guidance";
type AdvancedFieldKey = keyof NutritionAdvancedClinicalProfile;
type NutritionSectionKey = "overview" | "settings" | "plan" | "risk";
type UsageCounterKey =
  | "generateAttempts"
  | "generateSuccess"
  | "generateBlockedHardStop"
  | "quickSummaryToggles"
  | "daySwitches"
  | "accordionOpens";
type PlanViewMode = "quick" | "detail";
type LabRequirementRule = {
  allOf?: AdvancedFieldKey[];
  anyOf?: AdvancedFieldKey[];
};

const sectionKeys: NutritionSectionKey[] = ["overview", "settings", "plan", "risk"];
const getDefaultDayPanels = (viewMode: PlanViewMode): Record<DayAccordionKey, boolean> => ({
  risk: false,
  meals: viewMode === "detail",
  guidance: false,
});
const minimumLabRequirements: Partial<Record<ClinicalCondition, LabRequirementRule>> = {
  diabetes: { anyOf: ["hba1cPct", "fastingGlucoseMgDl"] },
  hypertension: { allOf: ["systolicBp", "diastolicBp"] },
  ckd: { allOf: ["egfr", "potassiumMmolL"] },
  heart_failure: { allOf: ["ntprobnpPgMl", "clinicianFluidLimitMl"] },
};

const createEmptySectionUsage = (): NutritionSectionUsage => ({
  views: 0,
  interactions: 0,
  avgResponseMs: 0,
  lastResponseMs: 0,
});

const createDefaultUsageMetrics = (): NutritionUsageMetrics => ({
  version: 1,
  lastUpdatedAt: new Date().toISOString(),
  sections: {
    overview: createEmptySectionUsage(),
    settings: createEmptySectionUsage(),
    plan: createEmptySectionUsage(),
    risk: createEmptySectionUsage(),
  },
  counters: {
    generateAttempts: 0,
    generateSuccess: 0,
    generateBlockedHardStop: 0,
    quickSummaryToggles: 0,
    daySwitches: 0,
    accordionOpens: 0,
  },
});

const mergeUsageMetrics = (incoming: NutritionUsageMetrics | undefined): NutritionUsageMetrics => {
  const base = createDefaultUsageMetrics();
  if (!incoming) {
    return base;
  }

  return {
    version: 1,
    lastUpdatedAt: incoming.lastUpdatedAt || base.lastUpdatedAt,
    sections: {
      overview: { ...base.sections.overview, ...incoming.sections?.overview },
      settings: { ...base.sections.settings, ...incoming.sections?.settings },
      plan: { ...base.sections.plan, ...incoming.sections?.plan },
      risk: { ...base.sections.risk, ...incoming.sections?.risk },
    },
    counters: {
      ...base.counters,
      ...incoming.counters,
    },
  };
};

const updateSectionUsage = (
  usage: NutritionSectionUsage,
  responseMs: number,
  withInteraction: boolean,
): NutritionSectionUsage => {
  const sanitizedMs = Number.isFinite(responseMs) ? Math.max(1, Math.round(responseMs)) : 0;
  if (!sanitizedMs) {
    return usage;
  }

  const interactionCount = withInteraction ? usage.interactions + 1 : usage.interactions;
  const sampleCount = Math.max(interactionCount, usage.views, 1);
  const nextAvg = usage.avgResponseMs > 0
    ? Math.round(((usage.avgResponseMs * (sampleCount - 1)) + sanitizedMs) / sampleCount)
    : sanitizedMs;

  return {
    ...usage,
    interactions: interactionCount,
    avgResponseMs: nextAvg,
    lastResponseMs: sanitizedMs,
  };
};

const serializeInputHardStops = (
  hardStops: ClinicalInputHardStop[],
  language: "es" | "en",
): string[] => {
  return hardStops.map((entry) => {
    const condition = clinicalConditionLabel(entry.condition, language);
    return `[${condition}] ${entry.metric} | ${entry.reason} ${entry.action}`;
  });
};

const advancedLabLabel = (field: AdvancedFieldKey, text: NutritionText): string => {
  const labels: Record<AdvancedFieldKey, string> = {
    hba1cPct: text.hba1c,
    fastingGlucoseMgDl: text.fastingGlucose,
    systolicBp: text.systolicBp,
    diastolicBp: text.diastolicBp,
    egfr: text.egfr,
    potassiumMmolL: text.potassium,
    phosphorusMgDl: text.phosphorus,
    ntprobnpPgMl: text.ntprobnp,
    clinicianFluidLimitMl: text.fluidLimit,
  };

  return labels[field];
};

const buildMissingMinimumLabMessages = (
  conditions: ClinicalCondition[],
  advancedProfileEnabled: boolean,
  advancedProfile: NutritionAdvancedClinicalProfile,
  text: NutritionText,
  language: "es" | "en",
): string[] => {
  const messages: string[] = [];

  for (const condition of conditions) {
    const rule = minimumLabRequirements[condition];
    if (!rule) {
      continue;
    }

    if (!advancedProfileEnabled) {
      messages.push(
        `[${clinicalConditionLabel(condition, language)}] ${text.minLabsEnableAdvanced}`,
      );
      continue;
    }

    if (rule.allOf && rule.allOf.length > 0) {
      const missing = rule.allOf.filter((field) => advancedProfile[field] === undefined);
      if (missing.length > 0) {
        messages.push(
          `[${clinicalConditionLabel(condition, language)}] ${text.minLabsMissing}: ${missing.map((field) => advancedLabLabel(field, text)).join(", ")}`,
        );
      }
      continue;
    }

    if (rule.anyOf && rule.anyOf.length > 0) {
      const hasOne = rule.anyOf.some((field) => advancedProfile[field] !== undefined);
      if (!hasOne) {
        messages.push(
          `[${clinicalConditionLabel(condition, language)}] ${text.minLabsNeedOne}: ${rule.anyOf.map((field) => advancedLabLabel(field, text)).join(" / ")}`,
        );
      }
    }
  }

  return messages;
};

const parseTimestamp = (iso: string): number => {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
};

const getMonthKey = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
};

const normalizeRiskHistory = (history: NutritionRiskSnapshot[] | undefined): NutritionRiskSnapshot[] => {
  if (!history || history.length === 0) {
    return [];
  }

  return [...history]
    .filter((entry) => typeof entry.at === "string" && entry.at.length > 0)
    .sort((a, b) => parseTimestamp(b.at) - parseTimestamp(a.at))
    .slice(0, MAX_RISK_HISTORY_ITEMS);
};

const buildRiskSnapshot = (assessment: PlanRiskAssessment, at: string): NutritionRiskSnapshot => {
  const topSignalIds = Array.from(new Set(assessment.topSignals.map((entry) => entry.id))).slice(0, 6) as RiskSignalId[];

  return {
    at,
    overallLevel: assessment.overallLevel,
    overallScore: assessment.overallScore,
    requiresClinicalReview: assessment.requiresClinicalReview,
    hardStopCount: assessment.hardStops.length,
    topSignalIds,
  };
};

const hasAdvancedProfileData = (profile: NutritionAdvancedClinicalProfile): boolean => {
  return Object.values(profile).some((value) => value !== undefined);
};

const conditionDescription = (
  condition: ClinicalCondition,
  language: "es" | "en"
): string => {
  const labels: Record<ClinicalCondition, { es: string; en: string }> = {
    diabetes: {
      es: "Prioriza indice glucemico bajo, fibra y distribucion de carbohidratos.",
      en: "Prioritize low-glycemic choices, fiber, and carb distribution.",
    },
    obesity: {
      es: "Aplica deficit calorico moderado y alta adherencia semanal.",
      en: "Apply moderate calorie deficit with strong weekly adherence.",
    },
    hypertension: {
      es: "Reduce sodio dietario y fomenta alimentos frescos poco procesados.",
      en: "Lower dietary sodium and prioritize minimally processed foods.",
    },
    ckd: {
      es: "Control de proteina y vigilancia de sodio/potasio segun laboratorio.",
      en: "Protein moderation with sodium/potassium caution based on labs.",
    },
    heart_failure: {
      es: "Mayor control de sodio y liquidos segun evolucion clinica.",
      en: "Stricter sodium and fluid management per clinical follow-up.",
    },
    frailty: {
      es: "Evita restricciones agresivas y prioriza densidad nutricional/proteica.",
      en: "Avoid aggressive restriction; prioritize nutrient/protein density.",
    },
    ibs: {
      es: "Prioriza enfoque bajo en FODMAP y control de detonantes digestivos.",
      en: "Prioritize low-FODMAP strategy and digestive trigger control.",
    },
    lactose_intolerance: {
      es: "Excluye lactosa y usa alternativas sin lactosa o vegetales fortificadas.",
      en: "Exclude lactose and use lactose-free or fortified non-dairy alternatives.",
    },
    celiac: {
      es: "Dieta estricta sin gluten con control de contaminacion cruzada.",
      en: "Strict gluten-free diet with cross-contamination prevention.",
    },
  };

  return labels[condition][language];
};

type NutritionText = Record<string, string>;

type NutritionPlanSectionProps = {
  plan: NutritionPlan;
  generatedAtLabel: string | null;
  riskAssessment: PlanRiskAssessment | null;
  riskTrend: NutritionRiskSnapshot[];
  selectedLanguage: "es" | "en";
  text: NutritionText;
  onPlanInteraction: (counter: UsageCounterKey, responseMs: number) => void;
};

const NutritionPlanSection = memo(function NutritionPlanSection({
  plan,
  generatedAtLabel,
  riskAssessment,
  riskTrend,
  selectedLanguage,
  text,
  onPlanInteraction,
}: NutritionPlanSectionProps) {
  const formatRiskTrendDate = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso.slice(0, 10);
    }

    return date.toLocaleDateString(selectedLanguage === "en" ? "en-US" : "es-ES", {
      month: "2-digit",
      day: "2-digit",
    });
  };

  const riskSignalName = (id: RiskSignal["id"]): string => {
    const labels: Record<RiskSignal["id"], string> = {
      sodium: text.signalSodium,
      fluids: text.signalFluids,
      carbs: text.signalCarbs,
      protein: text.signalProtein,
      fiber: text.signalFiber,
      warnings: text.signalWarnings,
      labs: text.signalLabs,
    };

    return labels[id];
  };

  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState<PlanViewMode>("quick");

  useEffect(() => {
    setSelectedDayIndex((current) => {
      const lastIndex = Math.max(plan.days.length - 1, 0);
      return Math.min(current, lastIndex);
    });
  }, [plan.days.length]);

  const selectedDay = plan.days[selectedDayIndex] ?? plan.days[0];
  const selectedDayRisk = riskAssessment?.dayAssessments[selectedDayIndex];
  const [openDayPanels, setOpenDayPanels] = useState<Record<DayAccordionKey, boolean>>(
    getDefaultDayPanels("quick"),
  );

  useEffect(() => {
    setOpenDayPanels(getDefaultDayPanels(viewMode));
  }, [selectedDayIndex, viewMode]);

  const measureInteraction = (counter: UsageCounterKey, handler: () => void): void => {
    const startedAt = performance.now();
    handler();
    requestAnimationFrame(() => {
      onPlanInteraction(counter, performance.now() - startedAt);
    });
  };

  const toggleDayPanel = (panel: DayAccordionKey): void => {
    const isOpening = !openDayPanels[panel];
    const applyToggle = () => {
      setOpenDayPanels((prev) => ({
        ...prev,
        [panel]: !prev[panel],
      }));
    };

    if (isOpening) {
      measureInteraction("accordionOpens", applyToggle);
      return;
    }

    applyToggle();
  };

  const selectedDayMealsPreview = selectedDay.meals.slice(0, 3);

  return (
    <section className="space-y-4 nutrition-lazy-block">
      <div className="lite-panel rounded-2xl p-4 md:p-5 space-y-3">
        <p className="text-sm font-medium text-primary">{plan.summary}</p>
        {generatedAtLabel && (
          <p className="text-xs text-muted-foreground">
            {text.generatedAt}: {generatedAtLabel}
          </p>
        )}

        {plan.constraintsApplied.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{text.constraints}</p>
            <div className="flex flex-wrap gap-2">
              {plan.constraintsApplied.map((item) => (
                <span key={item} className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {plan.warnings.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{text.warnings}</p>
            <div className="space-y-2">
              {plan.warnings.map((item) => (
                <p key={item} className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  {item}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {riskAssessment && (
        <div className="lite-panel rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{text.riskOverviewTitle}</p>
              <p className="text-[11px] text-muted-foreground mt-1 md:hidden">{text.riskScore}: {riskAssessment.overallScore.toFixed(1)} / 3.0</p>
              <p className="hidden md:block text-xs text-muted-foreground mt-1">{text.riskOverviewHint}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskLevelClasses[riskAssessment.overallLevel]}`}>
                {riskLevelLabel(riskAssessment.overallLevel, selectedLanguage)}
              </span>
              <span className="hidden md:inline-flex rounded-full border border-border/70 bg-background/35 px-3 py-1 text-xs font-semibold text-foreground/90">
                {text.riskScore}: {riskAssessment.overallScore.toFixed(1)} / 3.0
              </span>
            </div>
          </div>

          {riskAssessment.requiresClinicalReview && (
            <div className="rounded-xl border border-rose-400/45 bg-rose-500/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-sm text-rose-100">{text.reviewRequiredTitle}</p>
                <span className="rounded-full border border-rose-300/40 bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-100">
                  {text.hardStops}: {riskAssessment.hardStops.length}
                </span>
              </div>
              <p className="text-xs text-rose-100/90">{text.reviewRequiredHint}</p>
              <div className="space-y-1">
                {riskAssessment.hardStops.slice(0, 2).map((entry, index) => (
                  <p key={`${entry.id}-${entry.metric}-${index}`} className="text-xs text-rose-100/90">
                    <strong>{riskSignalName(entry.id)} {entry.metric}:</strong> {entry.action}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/75 bg-background/35 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{text.actionsTitle}</p>
              {riskAssessment.recommendedActions.length > 0 ? (
                <ul className="space-y-1">
                  {riskAssessment.recommendedActions.map((action) => (
                    <li key={action} className="text-xs text-foreground/90">
                      - {action}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">{text.noRiskSignals}</p>
              )}
            </div>

            <div className="rounded-xl border border-border/75 bg-background/35 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{text.trendTitle}</p>
              {riskTrend.length > 0 ? (
                <div className="flex items-end gap-1 h-20">
                  {riskTrend.map((entry) => (
                    <div key={entry.at} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1">
                      <span
                        className={`w-full max-w-[20px] rounded-t ${riskBarClasses[entry.overallLevel]}`}
                        style={{ height: `${Math.max(18, Math.round(entry.overallScore * 18))}px` }}
                      />
                      <span className="text-[10px] text-muted-foreground">{formatRiskTrendDate(entry.at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{text.noRiskSignals}</p>
              )}
            </div>
          </div>

          <details className="md:hidden rounded-xl border border-border/75 bg-background/35 p-3">
            <summary className="text-xs font-semibold cursor-pointer">{text.viewRiskDetails}</summary>
            <div className="space-y-2 mt-2">
              {riskAssessment.topSignals.map((entry, index) => (
                <div key={`${entry.id}-${entry.metric}-${index}`} className="rounded-lg border border-border/70 bg-background/45 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{riskSignalName(entry.id)}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${riskLevelClasses[entry.level]}`}>
                      {riskLevelLabel(entry.level, selectedLanguage)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{entry.metric} | {entry.action}</p>
                </div>
              ))}
            </div>
          </details>

          <div className="hidden md:block">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{text.topSignals}</p>
            {riskAssessment.topSignals.length > 0 ? (
              <div className="space-y-2">
                {riskAssessment.topSignals.map((entry, index) => (
                  <div key={`${entry.id}-${entry.metric}-${index}`} className="rounded-xl border border-border/75 bg-background/35 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-sm">{riskSignalName(entry.id)}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${riskLevelClasses[entry.level]}`}>
                        {riskLevelLabel(entry.level, selectedLanguage)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{entry.metric} | {entry.action}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{text.noRiskSignals}</p>
            )}
          </div>
        </div>
      )}

      <div className="lite-panel rounded-2xl p-3 md:p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{text.dayTarget}</p>
          <div className="inline-flex items-center rounded-lg border border-border/75 bg-background/35 p-1">
            <button
              type="button"
              onClick={() => {
                if (viewMode !== "quick") {
                  measureInteraction("quickSummaryToggles", () => setViewMode("quick"));
                }
              }}
              className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors ${
                viewMode === "quick"
                  ? "bg-primary/16 text-primary"
                  : "text-foreground/75 hover:text-foreground"
              }`}
            >
              {text.quickSummary}
            </button>
            <button
              type="button"
              onClick={() => {
                if (viewMode !== "detail") {
                  measureInteraction("quickSummaryToggles", () => setViewMode("detail"));
                }
              }}
              className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors ${
                viewMode === "detail"
                  ? "bg-primary/16 text-primary"
                  : "text-foreground/75 hover:text-foreground"
              }`}
            >
              {text.detailedView}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{text.portionWeighingRule}</p>

        <div className="md:hidden">
          <select
            value={selectedDayIndex}
            onChange={(event) => {
              const nextIndex = Number(event.target.value);
              if (nextIndex !== selectedDayIndex) {
                measureInteraction("daySwitches", () => setSelectedDayIndex(nextIndex));
              }
            }}
            className="w-full h-10 rounded-lg bg-input/95 border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
          >
            {plan.days.map((day, index) => (
              <option key={day.day} value={index}>{day.day}</option>
            ))}
          </select>
        </div>

        <div className="hidden md:flex flex-wrap gap-2">
          {plan.days.map((day, index) => {
            const active = index === selectedDayIndex;
            return (
              <button
                key={day.day}
                type="button"
                onClick={() => {
                  if (!active) {
                    measureInteraction("daySwitches", () => setSelectedDayIndex(index));
                  }
                }}
                className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary/45 bg-primary/16 text-primary"
                    : "border-border/80 bg-background/35 text-foreground/80 hover:border-primary/30"
                }`}
              >
                {day.day}
              </button>
            );
          })}
        </div>

        {viewMode === "quick" ? (
          <article key={`${selectedDay.day}-quick`} className="rounded-2xl border border-border/75 bg-background/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold title-gradient">{selectedDay.day}</h3>
                <p className="text-xs text-muted-foreground">{text.quickSummaryHint}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary font-semibold">
                  {selectedDay.targetKcal} {text.kcal}
                </span>
                {selectedDayRisk && (
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskLevelClasses[selectedDayRisk.level]}`}>
                    {text.dayRisk}: {riskLevelLabel(selectedDayRisk.level, selectedLanguage)}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <p className="metric-pill"><span className="text-muted-foreground">{text.protein}: </span><strong>{selectedDay.proteinG} {text.grams}</strong></p>
              <p className="metric-pill"><span className="text-muted-foreground">{text.carbs}: </span><strong>{selectedDay.carbsG} {text.grams}</strong></p>
              <p className="metric-pill"><span className="text-muted-foreground">{text.sodium}: </span><strong>{selectedDay.sodiumMg} {text.mg}</strong></p>
              <p className="metric-pill"><span className="text-muted-foreground">{text.fluids}: </span><strong>{selectedDay.fluidsMl} {text.ml}</strong></p>
            </div>

            <div className="rounded-xl border border-border/75 bg-background/35 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{text.meals}</p>
              <ul className="space-y-1 text-xs">
                {selectedDayMealsPreview.map((meal) => (
                  <li key={`${selectedDay.day}-quick-${meal.name}`} className="flex items-center justify-between gap-2">
                    <span>{meal.name}</span>
                    <span className="text-muted-foreground">{meal.kcal} {text.kcal}</span>
                  </li>
                ))}
              </ul>
            </div>

            {selectedDay.guidance.length > 0 && (
              <div className="rounded-xl border border-border/75 bg-background/35 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{text.guidance}</p>
                <ul className="list-disc pl-4 text-xs text-foreground/90">
                  {selectedDay.guidance.slice(0, 2).map((item) => (
                    <li key={`${selectedDay.day}-quick-guidance-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ) : (
          <article key={`${selectedDay.day}-detail`} className="rounded-2xl border border-border/75 bg-background/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold title-gradient">{selectedDay.day}</h3>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary font-semibold">
                  {selectedDay.targetKcal} {text.kcal}
                </span>
                {selectedDayRisk && (
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskLevelClasses[selectedDayRisk.level]}`}>
                    {text.dayRisk}: {riskLevelLabel(selectedDayRisk.level, selectedLanguage)}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <p className="metric-pill"><span className="text-muted-foreground">{text.protein}: </span><strong>{selectedDay.proteinG} {text.grams}</strong></p>
              <p className="metric-pill"><span className="text-muted-foreground">{text.carbs}: </span><strong>{selectedDay.carbsG} {text.grams}</strong></p>
              <p className="metric-pill"><span className="text-muted-foreground">{text.fat}: </span><strong>{selectedDay.fatG} {text.grams}</strong></p>
              <p className="metric-pill"><span className="text-muted-foreground">{text.fiber}: </span><strong>{selectedDay.fiberG} {text.grams}</strong></p>
              <p className="metric-pill"><span className="text-muted-foreground">{text.sodium}: </span><strong>{selectedDay.sodiumMg} {text.mg}</strong></p>
              <p className="metric-pill"><span className="text-muted-foreground">{text.fluids}: </span><strong>{selectedDay.fluidsMl} {text.ml}</strong></p>
            </div>

            {selectedDayRisk && selectedDayRisk.signals.length > 0 && (
              <div className="rounded-xl border border-border/75 bg-background/30 p-2">
                <button
                  type="button"
                  onClick={() => toggleDayPanel("risk")}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{text.riskSignals}</p>
                  <ChevronDown
                    size={14}
                    className={`text-muted-foreground transition-transform ${openDayPanels.risk ? "rotate-180" : ""}`}
                  />
                </button>
                {openDayPanels.risk && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedDayRisk.signals.slice(0, 4).map((entry, index) => (
                      <span
                        key={`${selectedDay.day}-${entry.id}-${entry.metric}-${index}`}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskLevelClasses[entry.level]}`}
                      >
                        {riskSignalName(entry.id)} | {entry.metric}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedDayRisk && selectedDayRisk.hardStops.length > 0 && (
              <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2">
                <p className="text-[11px] font-semibold text-rose-100">
                  {text.hardStops}: {selectedDayRisk.hardStops.length}
                </p>
                <p className="text-[11px] text-rose-100/90 mt-1">
                  {selectedDayRisk.hardStops[0].action}
                </p>
              </div>
            )}

            <div className="rounded-xl border border-border/75 bg-background/30 p-2">
              <button
                type="button"
                onClick={() => toggleDayPanel("meals")}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{text.meals}</p>
                <ChevronDown
                  size={14}
                  className={`text-muted-foreground transition-transform ${openDayPanels.meals ? "rotate-180" : ""}`}
                />
              </button>
              {openDayPanels.meals && (
                <div className="space-y-2 mt-2">
                  {selectedDay.meals.map((meal) => (
                    <div key={`${selectedDay.day}-${meal.name}`} className="rounded-xl border border-border/75 bg-background/35 p-3">
                      <p className="font-semibold text-sm">{meal.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {meal.kcal} {text.kcal} | {text.protein} {meal.proteinG}{text.grams} | {text.carbs} {meal.carbsG}{text.grams} | {text.fat} {meal.fatG}{text.grams}
                      </p>
                      <ul className="mt-1 list-disc pl-4 text-xs">
                        {meal.items.map((item) => (
                          <li key={`${meal.name}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedDay.guidance.length > 0 && (
              <div className="rounded-xl border border-border/75 bg-background/30 p-2">
                <button
                  type="button"
                  onClick={() => toggleDayPanel("guidance")}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{text.guidance}</p>
                  <ChevronDown
                    size={14}
                    className={`text-muted-foreground transition-transform ${openDayPanels.guidance ? "rotate-180" : ""}`}
                  />
                </button>
                {openDayPanels.guidance && (
                  <ul className="list-disc pl-4 text-xs text-foreground/90 mt-2">
                    {selectedDay.guidance.map((item) => (
                      <li key={`${selectedDay.day}-guidance-${item}`}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </article>
        )}
      </div>
    </section>
  );
});

type AdvancedNumberInputProps = {
  fieldKey: AdvancedFieldKey;
  label: string;
  step: string;
  committedValue: number | undefined;
  onCommit: (field: AdvancedFieldKey, value: string) => void;
};

const AdvancedNumberInput = memo(function AdvancedNumberInput({
  fieldKey,
  label,
  step,
  committedValue,
  onCommit,
}: AdvancedNumberInputProps) {
  const [localValue, setLocalValue] = useState(committedValue !== undefined ? String(committedValue) : "");

  useEffect(() => {
    setLocalValue(committedValue !== undefined ? String(committedValue) : "");
  }, [committedValue]);

  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step}
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => onCommit(fieldKey, localValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="w-full h-10 rounded-lg bg-input/95 border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
      />
    </label>
  );
});

export default function NutritionPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const selectedLanguage = language === "en" ? "en" : "es";

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [conditions, setConditions] = useState<ClinicalCondition[]>([]);
  const [athleteMode, setAthleteMode] = useState(false);
  const [foodAllergies, setFoodAllergies] = useState("");
  const dietaryNotesRef = useRef("");
  const [notesInputVersion, setNotesInputVersion] = useState(0);
  const [monthlyWeightInput, setMonthlyWeightInput] = useState("");
  const [lastWeightCheckMonth, setLastWeightCheckMonth] = useState<string | null>(null);
  const [savingMandatoryProfile, setSavingMandatoryProfile] = useState(false);
  const [advancedProfileEnabled, setAdvancedProfileEnabled] = useState(false);
  const [advancedProfile, setAdvancedProfile] = useState<NutritionAdvancedClinicalProfile>({});
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [riskHistory, setRiskHistory] = useState<NutritionRiskSnapshot[]>([]);
  const [clinicalHardStops, setClinicalHardStops] = useState<string[]>([]);
  const [usageMetrics, setUsageMetrics] = useState<NutritionUsageMetrics>(() => createDefaultUsageMetrics());

  const pageStartMsRef = useRef<number>(performance.now());
  const viewedSectionsRef = useRef<Set<NutritionSectionKey>>(new Set());
  const persistedUsageSignatureRef = useRef<string>("");

  const text = useMemo(() => (
    selectedLanguage === "en"
      ? {
      title: "Clinical Nutrition",
      subtitle: "Build an integrated nutrition plan from your training load and clinical profile.",
      medicalDisclaimer: "Clinical support only. This tool does not replace diagnosis or emergency care.",
      profileMissing: "Profile not found. Complete onboarding first.",
      loadError: "Could not load nutrition profile.",
      signInRequired: "You must be signed in.",
      profileIncomplete: "Age, weight, goal, and training days are required before generating nutrition.",
      generate: "Generate Nutrition Plan",
      generating: "Generating...",
      generatedOk: "Nutrition plan generated and saved.",
      saveError: "Could not save nutrition plan.",
      conditionsTitle: "Clinical conditions",
      athleteMode: "Athlete mode",
      athleteModeHint: "Use performance-oriented carb timing while preserving clinical safety constraints.",
      allergiesTitle: "Allergies and intolerances (required)",
      allergiesPlaceholder: "Example: no allergies / egg allergy / peanut allergy / shellfish / lactose / gluten",
      allergiesHint: "Mandatory for all users. Write \"none\" if no known allergies.",
      notesTitle: "Dietary notes",
      notesPlaceholder: "Example: low budget, lactose intolerance, avoids red meat, cultural preferences...",
      monthlyWeightTitle: "Monthly weight check-in (required)",
      monthlyWeightHint: "You must register your current weight each month to generate a new nutrition plan.",
      saveMandatoryData: "Save required data",
      savingMandatoryData: "Saving required data...",
      mandatoryDataSaved: "Required nutrition data saved.",
      generatedAt: "Generated at",
      constraints: "Applied constraints",
      warnings: "Safety warnings",
      dayTarget: "Daily target",
      meals: "Meals",
      guidance: "Guidance",
      protein: "Protein",
      carbs: "Carbs",
      fat: "Fat",
      fiber: "Fiber",
      sodium: "Sodium",
      fluids: "Fluids",
      kcal: "kcal",
      grams: "g",
      mg: "mg",
      ml: "ml",
      riskOverviewTitle: "Clinical risk overview",
      riskOverviewHint: "Automated safety check for sodium, fluids, carbs, protein, fiber, and warnings.",
      overallRisk: "Overall risk",
      riskScore: "Risk score",
      topSignals: "Top signals",
      noRiskSignals: "No major risk signals detected.",
      dayRisk: "Day risk",
      riskSignals: "Risk signals",
      signalSodium: "Sodium",
      signalFluids: "Fluids",
      signalCarbs: "Carbs",
      signalProtein: "Protein",
      signalFiber: "Fiber",
      signalWarnings: "Warnings",
      signalLabs: "Labs",
      reviewRequiredTitle: "Clinical review required",
      reviewRequiredHint: "This plan has hard-stop signals. Use only after clinician confirmation.",
      actionsTitle: "Actions for today",
      trendTitle: "Risk trend",
      viewRiskDetails: "View risk details",
      hardStops: "Hard stops",
      quickSummary: "Quick summary",
      detailedView: "Detailed view",
      quickSummaryHint: "Key macros and priority actions for today.",
      hardStopGateTitle: "Generation blocked by clinical hard-stop",
      hardStopPlanTitle: "Plan blocked before save due clinical hard-stop",
      missingRequiredDataGateTitle: "Complete allergies and monthly weight check-in before continuing.",
      allergiesRequired: "Allergies/intolerances are required before using nutrition plans.",
      weightMonthlyRequired: "Monthly weight check-in is required before generating this month's plan.",
      invalidWeight: "Weight must be between 30 and 300 kg.",
      portionWeighingRule: "Each item indicates whether it should be weighed raw or cooked.",
      minLabsGateTitle: "Minimum labs are required before generation",
      minLabsEnableAdvanced: "Activate advanced profile and provide minimum labs for this diagnosis.",
      minLabsMissing: "Missing minimum labs",
      minLabsNeedOne: "Provide at least one of",
      advancedProfileTitle: "Advanced clinical profile",
      advancedProfileHint: "Required in high-risk diagnoses (diabetes, HTN, CKD, heart failure) to unlock generation.",
      hba1c: "HbA1c (%)",
      fastingGlucose: "Fasting glucose (mg/dL)",
      systolicBp: "Systolic BP (mmHg)",
      diastolicBp: "Diastolic BP (mmHg)",
      egfr: "eGFR",
      potassium: "Potassium (mmol/L)",
      phosphorus: "Phosphorus (mg/dL)",
      ntprobnp: "NT-proBNP (pg/mL)",
      fluidLimit: "Clinician fluid limit (ml/day)",
      advancedProfileToggle: "Advanced profile",
      telemetryTitle: "Nutrition telemetry",
      telemetryHint: "Tracks section response times to catch regressions early.",
      telemetryViews: "Views",
      telemetryInteractions: "Interactions",
      telemetryAvgMs: "Avg ms",
      telemetryLastMs: "Last ms",
      telemetryUpdated: "Updated",
      sectionOverview: "Overview",
      sectionSettings: "Settings",
      sectionPlan: "Plan",
      sectionRisk: "Risk",
    }
      : {
      title: "Nutricion Clinica",
      subtitle: "Construye un plan nutricional integrado con tu carga de entrenamiento y perfil clinico.",
      medicalDisclaimer: "Soporte clinico asistido. Esta herramienta no reemplaza diagnostico ni urgencias.",
      profileMissing: "Perfil no encontrado. Completa onboarding primero.",
      loadError: "No se pudo cargar el perfil nutricional.",
      signInRequired: "Debes iniciar sesion.",
      profileIncomplete: "Necesitas edad, peso, objetivo y dias de entrenamiento antes de generar nutricion.",
      generate: "Generar Plan Nutricional",
      generating: "Generando...",
      generatedOk: "Plan nutricional generado y guardado.",
      saveError: "No se pudo guardar el plan nutricional.",
      conditionsTitle: "Condiciones clinicas",
      athleteMode: "Modo deportista",
      athleteModeHint: "Aplica timing de carbohidratos orientado a rendimiento sin romper restricciones clinicas.",
      allergiesTitle: "Alergias e intolerancias (obligatorio)",
      allergiesPlaceholder: "Ejemplo: sin alergias / alergia al huevo / cacahuete / marisco / lactosa / gluten",
      allergiesHint: "Obligatorio para todos los usuarios. Escribe \"ninguna\" si no tienes alergias conocidas.",
      notesTitle: "Notas dietarias",
      notesPlaceholder: "Ejemplo: bajo presupuesto, intolerancia lactosa, evita carne roja, preferencia cultural...",
      monthlyWeightTitle: "Registro mensual de peso (obligatorio)",
      monthlyWeightHint: "Debes registrar el peso actual cada mes para generar un nuevo plan nutricional.",
      saveMandatoryData: "Guardar datos obligatorios",
      savingMandatoryData: "Guardando datos obligatorios...",
      mandatoryDataSaved: "Datos obligatorios de nutricion guardados.",
      generatedAt: "Generado en",
      constraints: "Restricciones aplicadas",
      warnings: "Alertas de seguridad",
      dayTarget: "Objetivo diario",
      meals: "Comidas",
      guidance: "Indicaciones",
      protein: "Proteina",
      carbs: "Carbohidratos",
      fat: "Grasa",
      fiber: "Fibra",
      sodium: "Sodio",
      fluids: "Liquidos",
      kcal: "kcal",
      grams: "g",
      mg: "mg",
      ml: "ml",
      riskOverviewTitle: "Resumen de riesgo clinico",
      riskOverviewHint: "Chequeo automatico de seguridad para sodio, liquidos, carbohidratos, proteina, fibra y alertas.",
      overallRisk: "Riesgo global",
      riskScore: "Puntaje de riesgo",
      topSignals: "Senales principales",
      noRiskSignals: "No se detectaron senales de riesgo relevantes.",
      dayRisk: "Riesgo del dia",
      riskSignals: "Senales de riesgo",
      signalSodium: "Sodio",
      signalFluids: "Liquidos",
      signalCarbs: "Carbohidratos",
      signalProtein: "Proteina",
      signalFiber: "Fibra",
      signalWarnings: "Alertas",
      signalLabs: "Laboratorio",
      reviewRequiredTitle: "Requiere revision clinica",
      reviewRequiredHint: "Este plan tiene senales hard-stop. Usalo solo tras confirmacion clinica.",
      actionsTitle: "Acciones para hoy",
      trendTitle: "Tendencia de riesgo",
      viewRiskDetails: "Ver detalle de riesgo",
      hardStops: "Hard stops",
      quickSummary: "Resumen rapido",
      detailedView: "Vista detallada",
      quickSummaryHint: "Macros clave y acciones prioritarias para hoy.",
      hardStopGateTitle: "Generacion bloqueada por hard-stop clinico",
      hardStopPlanTitle: "Plan bloqueado antes de guardar por hard-stop clinico",
      missingRequiredDataGateTitle: "Completa alergias y registro mensual de peso antes de continuar.",
      allergiesRequired: "Las alergias/intolerancias son obligatorias antes de usar planes nutricionales.",
      weightMonthlyRequired: "El registro mensual de peso es obligatorio para generar el plan de este mes.",
      invalidWeight: "El peso debe estar entre 30 y 300 kg.",
      portionWeighingRule: "Cada alimento indica si se debe pesar en crudo o cocido.",
      minLabsGateTitle: "Se requieren laboratorios minimos antes de generar",
      minLabsEnableAdvanced: "Activa el perfil avanzado y completa los labs minimos para este diagnostico.",
      minLabsMissing: "Faltan laboratorios minimos",
      minLabsNeedOne: "Completa al menos uno de",
      advancedProfileTitle: "Perfil clinico avanzado",
      advancedProfileHint: "Requerido en diagnosticos de alto riesgo (diabetes, HTA, ERC, insuficiencia cardiaca) para habilitar generacion.",
      hba1c: "HbA1c (%)",
      fastingGlucose: "Glucosa ayunas (mg/dL)",
      systolicBp: "PA sistolica (mmHg)",
      diastolicBp: "PA diastolica (mmHg)",
      egfr: "eGFR",
      potassium: "Potasio (mmol/L)",
      phosphorus: "Fosforo (mg/dL)",
      ntprobnp: "NT-proBNP (pg/mL)",
      fluidLimit: "Limite clinico de liquidos (ml/dia)",
      advancedProfileToggle: "Perfil avanzado",
      telemetryTitle: "Telemetria nutricional",
      telemetryHint: "Registra tiempos de respuesta por seccion para detectar regresiones.",
      telemetryViews: "Vistas",
      telemetryInteractions: "Interacciones",
      telemetryAvgMs: "Prom ms",
      telemetryLastMs: "Ult ms",
      telemetryUpdated: "Actualizado",
      sectionOverview: "Resumen",
      sectionSettings: "Configuracion",
      sectionPlan: "Plan",
      sectionRisk: "Riesgo",
      }
  ), [selectedLanguage]);

  const currentMonthKey = getMonthKey();
  const hasAllergiesDeclared = foodAllergies.trim().length > 0;
  const hasMonthlyWeightCheck = lastWeightCheckMonth === currentMonthKey;
  const canGenerateNutrition = hasAllergiesDeclared && hasMonthlyWeightCheck;

  const registerSectionView = useCallback((section: NutritionSectionKey): void => {
    setUsageMetrics((prev) => {
      if (viewedSectionsRef.current.has(section)) {
        return prev;
      }

      viewedSectionsRef.current.add(section);
      const currentSection = prev.sections[section];
      const nextSection = updateSectionUsage(
        {
          ...currentSection,
          views: currentSection.views + 1,
        },
        performance.now() - pageStartMsRef.current,
        false,
      );

      return {
        ...prev,
        lastUpdatedAt: new Date().toISOString(),
        sections: {
          ...prev.sections,
          [section]: nextSection,
        },
      };
    });
  }, []);

  const registerSectionInteraction = useCallback((
    section: NutritionSectionKey,
    responseMs: number,
    counter?: UsageCounterKey,
  ): void => {
    setUsageMetrics((prev) => {
      const nextCounters = counter
        ? {
          ...prev.counters,
          [counter]: prev.counters[counter] + 1,
        }
        : prev.counters;

      return {
        ...prev,
        lastUpdatedAt: new Date().toISOString(),
        sections: {
          ...prev.sections,
          [section]: updateSectionUsage(prev.sections[section], responseMs, true),
        },
        counters: nextCounters,
      };
    });
  }, []);

  const incrementUsageCounter = useCallback((counter: UsageCounterKey): void => {
    setUsageMetrics((prev) => ({
      ...prev,
      lastUpdatedAt: new Date().toISOString(),
      counters: {
        ...prev.counters,
        [counter]: prev.counters[counter] + 1,
      },
    }));
  }, []);

  const handlePlanInteraction = useCallback((counter: UsageCounterKey, responseMs: number): void => {
    registerSectionInteraction("plan", responseMs, counter);
  }, [registerSectionInteraction]);

  const measureSettingsInteraction = useCallback((handler: () => void): void => {
    const startedAt = performance.now();
    handler();
    requestAnimationFrame(() => {
      registerSectionInteraction("settings", performance.now() - startedAt);
    });
  }, [registerSectionInteraction]);

  const generatedAtLabel = useMemo(() => {
    if (!generatedAt) {
      return null;
    }

    const date = new Date(generatedAt);
    if (Number.isNaN(date.getTime())) {
      return generatedAt;
    }

    return date.toLocaleString();
  }, [generatedAt]);

  const overviewMetrics = useMemo(() => {
    if (!plan || plan.days.length === 0) {
      return null;
    }

    const baseDay = plan.days[0];
    return [
      { id: "kcal", label: text.kcal, value: `${baseDay.targetKcal}`, suffix: text.kcal, icon: Flame },
      { id: "protein", label: text.protein, value: `${baseDay.proteinG}`, suffix: text.grams, icon: ShieldCheck },
      { id: "sodium", label: text.sodium, value: `${baseDay.sodiumMg}`, suffix: text.mg, icon: HeartPulse },
      { id: "fluids", label: text.fluids, value: `${baseDay.fluidsMl}`, suffix: text.ml, icon: Droplets },
    ];
  }, [plan, text.fluids, text.grams, text.kcal, text.mg, text.ml, text.protein, text.sodium]);

  const usageSectionRows = useMemo(() => (
    sectionKeys.map((key) => {
      const labelBySection: Record<NutritionSectionKey, string> = {
        overview: text.sectionOverview,
        settings: text.sectionSettings,
        plan: text.sectionPlan,
        risk: text.sectionRisk,
      };

      return {
        key,
        label: labelBySection[key],
        stats: usageMetrics.sections[key],
      };
    })
  ), [
    text.sectionOverview,
    text.sectionPlan,
    text.sectionRisk,
    text.sectionSettings,
    usageMetrics.sections,
  ]);

  const telemetryUpdatedLabel = useMemo(() => {
    const date = new Date(usageMetrics.lastUpdatedAt);
    if (Number.isNaN(date.getTime())) {
      return usageMetrics.lastUpdatedAt;
    }
    return date.toLocaleString(selectedLanguage === "en" ? "en-US" : "es-ES");
  }, [selectedLanguage, usageMetrics.lastUpdatedAt]);

  const deferredConditions = useDeferredValue(conditions);
  const deferredAthleteMode = useDeferredValue(athleteMode);
  const deferredAdvancedProfileEnabled = useDeferredValue(advancedProfileEnabled);
  const deferredAdvancedProfile = useDeferredValue(advancedProfile);

  const riskAssessment = useMemo(() => {
    if (!plan) {
      return null;
    }

    return assessNutritionRisk(
      plan,
      deferredConditions,
      deferredAthleteMode,
      selectedLanguage,
      deferredAdvancedProfileEnabled ? deferredAdvancedProfile : undefined,
    );
  }, [
    deferredAdvancedProfile,
    deferredAdvancedProfileEnabled,
    deferredAthleteMode,
    deferredConditions,
    plan,
    selectedLanguage,
  ]);

  const riskTrend = useMemo(() => {
    const merged = new Map<string, NutritionRiskSnapshot>();
    for (const snapshot of riskHistory) {
      merged.set(snapshot.at, snapshot);
    }

    if (riskAssessment) {
      const currentAt = generatedAt ?? plan?.generatedAt ?? new Date().toISOString();
      if (!merged.has(currentAt)) {
        merged.set(currentAt, buildRiskSnapshot(riskAssessment, currentAt));
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => parseTimestamp(a.at) - parseTimestamp(b.at))
      .slice(-8);
  }, [generatedAt, plan?.generatedAt, riskAssessment, riskHistory]);

  useEffect(() => {
    if (!loading) {
      registerSectionView("overview");
      registerSectionView("settings");
    }
  }, [loading, registerSectionView]);

  useEffect(() => {
    if (plan) {
      registerSectionView("plan");
    }
  }, [plan, registerSectionView]);

  useEffect(() => {
    if (riskAssessment) {
      registerSectionView("risk");
    }
  }, [registerSectionView, riskAssessment]);

  useEffect(() => {
    if (!user || loading) {
      return;
    }

    const signature = JSON.stringify(usageMetrics);
    if (signature === persistedUsageSignatureRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      void updateUserProfile(user.uid, { nutritionUsageMetrics: usageMetrics })
        .then(() => {
          persistedUsageSignatureRef.current = signature;
        })
        .catch((metricsError) => {
          console.error("Nutrition telemetry update failed:", metricsError);
        });
    }, 12000);

    return () => {
      clearTimeout(timer);
    };
  }, [loading, usageMetrics, user]);

  const advancedFieldConfig = useMemo(
    () =>
      [
        { key: "hba1cPct", label: text.hba1c, step: "0.1" },
        { key: "fastingGlucoseMgDl", label: text.fastingGlucose, step: "1" },
        { key: "systolicBp", label: text.systolicBp, step: "1" },
        { key: "diastolicBp", label: text.diastolicBp, step: "1" },
        { key: "egfr", label: text.egfr, step: "1" },
        { key: "potassiumMmolL", label: text.potassium, step: "0.1" },
        { key: "phosphorusMgDl", label: text.phosphorus, step: "0.1" },
        { key: "ntprobnpPgMl", label: text.ntprobnp, step: "1" },
        { key: "clinicianFluidLimitMl", label: text.fluidLimit, step: "50" },
      ] as Array<{ key: AdvancedFieldKey; label: string; step: string }>,
    [
    text.diastolicBp,
    text.egfr,
    text.fastingGlucose,
    text.fluidLimit,
    text.hba1c,
    text.ntprobnp,
    text.phosphorus,
    text.potassium,
    text.systolicBp,
    ]
  );

  const updateAdvancedField = useCallback((
    field: AdvancedFieldKey,
    value: string,
  ): void => {
    measureSettingsInteraction(() => {
      setAdvancedProfile((prev) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          const next: NutritionAdvancedClinicalProfile = { ...prev };
          delete next[field];
          return next;
        }

        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) {
          return prev;
        }

        return {
          ...prev,
          [field]: parsed,
        };
      });
    });
  }, [measureSettingsInteraction]);


  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!user) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);
        if (!profile) {
          setError(text.profileMissing);
          return;
        }

        if (!isMounted) {
          return;
        }

        setConditions(profile.clinicalConditions ?? []);
        setAthleteMode(profile.nutritionAthleteMode ?? false);
        setFoodAllergies(profile.nutritionAllergies ?? "");
        dietaryNotesRef.current = profile.nutritionDietaryNotes ?? "";
        setNotesInputVersion((current) => current + 1);
        setMonthlyWeightInput(profile.weight ? String(profile.weight) : "");
        setLastWeightCheckMonth(profile.nutritionWeightCheckMonth ?? null);
        setAdvancedProfileEnabled(profile.nutritionAdvancedProfileEnabled ?? false);
        setAdvancedProfile(profile.nutritionAdvancedClinicalProfile ?? {});
        setGeneratedAt(profile.nutritionPlanGeneratedAt ?? null);
        setRiskHistory(normalizeRiskHistory(profile.nutritionRiskHistory));
        const loadedUsageMetrics = mergeUsageMetrics(profile.nutritionUsageMetrics);
        setUsageMetrics(loadedUsageMetrics);
        persistedUsageSignatureRef.current = JSON.stringify(loadedUsageMetrics);

        if (profile.nutritionPlan) {
          const parsed = parseNutritionPlan(profile.nutritionPlan);
          if (parsed) {
            setPlan(parsed);
          }
        }
      } catch (loadError) {
        console.error("Nutrition profile load failed:", loadError);
        if (isMounted) {
          setError(text.loadError);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [text.loadError, text.profileMissing, user]);

  const toggleCondition = (condition: ClinicalCondition) => {
    measureSettingsInteraction(() => {
      setConditions((prev) =>
        prev.includes(condition)
          ? prev.filter((item) => item !== condition)
          : [...prev, condition]
      );
    });
  };

  const handleSaveMandatoryNutritionData = async (): Promise<void> => {
    if (!user) {
      setError(text.signInRequired);
      return;
    }

    const normalizedAllergies = foodAllergies.trim();
    if (!normalizedAllergies) {
      setError(text.allergiesRequired);
      return;
    }

    const parsedWeight = Number(monthlyWeightInput);
    if (!Number.isFinite(parsedWeight) || parsedWeight < 30 || parsedWeight > 300) {
      setError(text.invalidWeight);
      return;
    }

    setSavingMandatoryProfile(true);
    setError(null);
    setNotice(null);

    try {
      const nowIso = new Date().toISOString();
      const monthKey = getMonthKey();
      await updateUserProfile(user.uid, {
        nutritionAllergies: normalizedAllergies,
        weight: parsedWeight,
        nutritionWeightCheckMonth: monthKey,
        nutritionWeightCheckAt: nowIso,
      });

      setFoodAllergies(normalizedAllergies);
      setMonthlyWeightInput(String(parsedWeight));
      setLastWeightCheckMonth(monthKey);
      setNotice(text.mandatoryDataSaved);
    } catch (mandatorySaveError) {
      console.error("Failed to save mandatory nutrition data:", mandatorySaveError);
      setError(text.saveError);
    } finally {
      setSavingMandatoryProfile(false);
    }
  };

  const handleGenerate = async () => {
    if (!user) {
      setError(text.signInRequired);
      return;
    }

    const generationStartedAt = performance.now();
    incrementUsageCounter("generateAttempts");
    setGenerating(true);
    setError(null);
    setNotice(null);
    setClinicalHardStops([]);

    try {
      const normalizedDietaryNotes = dietaryNotesRef.current.trim();
      const profile = await getUserProfile(user.uid);
      if (!profile) {
        throw new Error(text.profileMissing);
      }

      if (!profile.age || !profile.weight || !profile.goal || !profile.trainingDays) {
        throw new Error(text.profileIncomplete);
      }

      const normalizedAllergies = foodAllergies.trim();
      if (!normalizedAllergies) {
        setError(text.allergiesRequired);
        incrementUsageCounter("generateBlockedHardStop");
        registerSectionInteraction("settings", performance.now() - generationStartedAt);
        return;
      }

      if (lastWeightCheckMonth !== getMonthKey()) {
        setError(text.weightMonthlyRequired);
        incrementUsageCounter("generateBlockedHardStop");
        registerSectionInteraction("settings", performance.now() - generationStartedAt);
        return;
      }

      const activeAdvancedProfile = advancedProfileEnabled && hasAdvancedProfileData(advancedProfile)
        ? advancedProfile
        : undefined;
      const missingMinimumLabs = buildMissingMinimumLabMessages(
        conditions,
        advancedProfileEnabled,
        advancedProfile,
        text,
        selectedLanguage,
      );

      if (missingMinimumLabs.length > 0) {
        setClinicalHardStops(missingMinimumLabs);
        setError(text.minLabsGateTitle);
        incrementUsageCounter("generateBlockedHardStop");
        registerSectionInteraction("settings", performance.now() - generationStartedAt);
        return;
      }

      const inputHardStops = assessClinicalInputHardStops(
        conditions,
        activeAdvancedProfile,
        selectedLanguage,
        {
          frailtyWeightLossGoal: conditions.includes("frailty") && profile.goal === "weight_loss",
        },
      );

      if (inputHardStops.length > 0) {
        setClinicalHardStops(serializeInputHardStops(inputHardStops, selectedLanguage));
        setError(text.hardStopGateTitle);
        incrementUsageCounter("generateBlockedHardStop");
        registerSectionInteraction("settings", performance.now() - generationStartedAt);
        return;
      }

      const generatedPlan = await generateNutritionPlan({
        profile: {
          age: profile.age,
          weight: profile.weight,
          height: profile.height,
          goal: profile.goal,
          trainingDays: profile.trainingDays,
          availableMinutesPerSession: profile.availableMinutesPerSession,
          preferredLanguage: selectedLanguage,
        },
        clinicalConditions: conditions,
        allergies: normalizedAllergies,
        athleteMode,
        dietaryNotes: normalizedDietaryNotes || undefined,
        advancedClinicalProfile: activeAdvancedProfile,
      });

      const nowIso = new Date().toISOString();
      const generatedRisk = assessNutritionRisk(
        generatedPlan,
        conditions,
        athleteMode,
        selectedLanguage,
        activeAdvancedProfile,
      );

      if (generatedRisk.requiresClinicalReview && generatedRisk.hardStops.length > 0) {
        setPlan(generatedPlan);
        setGeneratedAt(nowIso);
        setClinicalHardStops(
          generatedRisk.hardStops.map((entry) => `[${entry.metric}] ${entry.message} ${entry.action}`),
        );
        setError(text.hardStopPlanTitle);
        incrementUsageCounter("generateBlockedHardStop");
        registerSectionInteraction("settings", performance.now() - generationStartedAt);
        return;
      }

      const nextRiskHistory = [
        buildRiskSnapshot(generatedRisk, nowIso),
        ...riskHistory.filter((entry) => entry.at !== nowIso),
      ].slice(0, MAX_RISK_HISTORY_ITEMS);

      await updateUserProfile(user.uid, {
        clinicalConditions: conditions,
        nutritionAllergies: normalizedAllergies,
        nutritionWeightCheckMonth: lastWeightCheckMonth ?? getMonthKey(),
        nutritionAthleteMode: athleteMode,
        nutritionDietaryNotes: normalizedDietaryNotes || undefined,
        nutritionAdvancedProfileEnabled: advancedProfileEnabled,
        nutritionAdvancedClinicalProfile: activeAdvancedProfile,
        nutritionPlan: stringifyNutritionPlan(generatedPlan),
        nutritionPlanGeneratedAt: nowIso,
        nutritionRiskHistory: nextRiskHistory,
      });

      incrementUsageCounter("generateSuccess");
      setPlan(generatedPlan);
      setGeneratedAt(nowIso);
      setRiskHistory(nextRiskHistory);
      setClinicalHardStops([]);
      setNotice(text.generatedOk);
      registerSectionInteraction("settings", performance.now() - generationStartedAt);
    } catch (generateError) {
      console.error("Nutrition plan generation failed:", generateError);
      setError(generateError instanceof Error ? generateError.message : text.saveError);
      registerSectionInteraction("settings", performance.now() - generationStartedAt);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto lite-panel rounded-2xl p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="lite-panel rounded-3xl p-6 md:p-7">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{text.title}</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">{text.subtitle}</p>
          <p className="mt-3 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 max-w-3xl">
            {text.medicalDisclaimer}
          </p>
          {overviewMetrics && (
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {overviewMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.id} className="metric-pill flex items-center gap-3">
                    <span className="h-9 w-9 rounded-lg bg-primary/16 border border-primary/30 inline-flex items-center justify-center text-primary">
                      <Icon size={16} />
                    </span>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                      <p className="text-sm font-bold text-foreground">
                        {metric.value} <span className="text-muted-foreground font-medium">{metric.suffix}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {notice && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm px-4 py-3 inline-flex items-center gap-2">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/35 bg-destructive/10 text-destructive text-sm px-4 py-3 inline-flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      {!canGenerateNutrition && (
        <div className="rounded-xl border border-amber-400/45 bg-amber-500/10 p-4 space-y-2 text-amber-200">
          <p className="text-sm font-semibold">{text.missingRequiredDataGateTitle}</p>
          <ul className="list-disc pl-4 text-xs space-y-1">
            {!hasAllergiesDeclared && <li>{text.allergiesRequired}</li>}
            {!hasMonthlyWeightCheck && <li>{text.weightMonthlyRequired}</li>}
          </ul>
        </div>
      )}
      {clinicalHardStops.length > 0 && (
        <div className="rounded-xl border border-rose-400/45 bg-rose-500/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-rose-100">{text.hardStops}: {clinicalHardStops.length}</p>
          <ul className="list-disc pl-4 space-y-1 text-xs text-rose-100/95">
            {clinicalHardStops.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="lite-panel rounded-2xl p-5 md:p-6 space-y-5 nutrition-lazy-block">
        <div className="rounded-xl border border-border/80 bg-background/35 p-4 space-y-3">
          <div>
            <p className="font-semibold">{text.allergiesTitle}</p>
            <p className="text-xs text-muted-foreground mt-1">{text.allergiesHint}</p>
          </div>
          <textarea
            value={foodAllergies}
            onChange={(event) => setFoodAllergies(event.target.value)}
            placeholder={text.allergiesPlaceholder}
            className="w-full h-20 rounded-xl bg-input/95 border border-border px-3 py-2 text-sm outline-none focus:ring-2 ring-primary resize-none"
          />

          <div>
            <label className="text-sm font-semibold text-muted-foreground">{text.monthlyWeightTitle}</label>
            <input
              type="number"
              min={30}
              max={300}
              value={monthlyWeightInput}
              onChange={(event) => setMonthlyWeightInput(event.target.value)}
              className="mt-1 w-full h-10 rounded-xl bg-input/95 border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">{text.monthlyWeightHint}</p>
          </div>

          <button
            type="button"
            onClick={handleSaveMandatoryNutritionData}
            disabled={savingMandatoryProfile}
            className="h-10 px-4 rounded-xl border border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/15 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {savingMandatoryProfile ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {savingMandatoryProfile ? text.savingMandatoryData : text.saveMandatoryData}
          </button>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg">{text.conditionsTitle}</h2>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {conditionOrder.map((condition) => {
              const active = conditions.includes(condition);
              return (
                <button
                  key={condition}
                  type="button"
                  onClick={() => toggleCondition(condition)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-primary/45 bg-gradient-to-r from-primary/18 to-cyan-400/10 shadow-[0_14px_28px_-26px_rgba(16,185,129,0.95)]"
                      : "border-border/80 bg-background/35 hover:border-primary/30"
                  }`}
                >
                  <p className="font-semibold">
                    {clinicalConditionLabel(condition, selectedLanguage)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {conditionDescription(condition, selectedLanguage)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-background/35 p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{text.athleteMode}</p>
            <button
              type="button"
              onClick={() => measureSettingsInteraction(() => setAthleteMode((prev) => !prev))}
              className={`h-9 px-3 rounded-lg border text-sm font-semibold transition-colors ${
                athleteMode
                  ? "bg-primary/18 border-primary/45 text-primary"
                  : "bg-card/70 border-border text-foreground/80"
              }`}
            >
              {athleteMode ? "ON" : "OFF"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{text.athleteModeHint}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-muted-foreground">{text.notesTitle}</label>
          <textarea
            key={notesInputVersion}
            defaultValue={dietaryNotesRef.current}
            onChange={(event) => {
              dietaryNotesRef.current = event.target.value;
            }}
            placeholder={text.notesPlaceholder}
            className="w-full h-24 rounded-xl bg-input/95 border border-border px-3 py-2 text-sm outline-none focus:ring-2 ring-primary resize-none"
          />
        </div>

        <div className="rounded-xl border border-border/80 bg-background/35 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{text.advancedProfileTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">{text.advancedProfileHint}</p>
            </div>
            <button
              type="button"
              onClick={() => measureSettingsInteraction(() => setAdvancedProfileEnabled((prev) => !prev))}
              className={`h-9 px-3 rounded-lg border text-sm font-semibold transition-colors ${
                advancedProfileEnabled
                  ? "bg-primary/18 border-primary/45 text-primary"
                  : "bg-card/70 border-border text-foreground/80"
              }`}
            >
              {advancedProfileEnabled ? "ON" : "OFF"}
            </button>
          </div>

          {advancedProfileEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {advancedFieldConfig.map((field) => (
                <AdvancedNumberInput
                  key={field.key}
                  fieldKey={field.key}
                  label={field.label}
                  step={field.step}
                  committedValue={advancedProfile[field.key]}
                  onCommit={updateAdvancedField}
                />
              ))}
            </div>
          )}
        </div>

        <details className="rounded-xl border border-border/80 bg-background/35 p-4">
          <summary className="cursor-pointer text-sm font-semibold">{text.telemetryTitle}</summary>
          <p className="text-xs text-muted-foreground mt-2">{text.telemetryHint}</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {usageSectionRows.map((row) => (
              <div key={row.key} className="rounded-lg border border-border/70 bg-background/30 p-2 space-y-1">
                <p className="text-xs font-semibold">{row.label}</p>
                <p className="text-[11px] text-muted-foreground">{text.telemetryViews}: {row.stats.views}</p>
                <p className="text-[11px] text-muted-foreground">{text.telemetryInteractions}: {row.stats.interactions}</p>
                <p className="text-[11px] text-muted-foreground">{text.telemetryAvgMs}: {row.stats.avgResponseMs}</p>
                <p className="text-[11px] text-muted-foreground">{text.telemetryLastMs}: {row.stats.lastResponseMs}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">{text.telemetryUpdated}: {telemetryUpdatedLabel}</p>
        </details>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !canGenerateNutrition}
          className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
        >
          {generating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          {generating ? text.generating : text.generate}
        </button>
      </section>

      {plan && (
        <NutritionPlanSection
          plan={plan}
          generatedAtLabel={generatedAtLabel}
          riskAssessment={riskAssessment}
          riskTrend={riskTrend}
          selectedLanguage={selectedLanguage}
          text={text}
          onPlanInteraction={handlePlanInteraction}
        />
      )}
    </div>
  );
}
