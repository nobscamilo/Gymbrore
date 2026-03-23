import { z } from "zod";
import { getExerciseInsight, SupportedLanguage } from "@/lib/exerciseCatalog";

export const TrainingExerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.string().min(1),
  reps: z.string().min(1),
  rpe: z.string().optional(),
  load: z.string().optional(),
  rest: z.string().min(1),
  notes: z.string().optional(),
  why: z.string().min(1).optional(),
});

export const SessionBlockSchema = z.object({
  title: z.string().min(1),
  durationMinutes: z.coerce.number().min(1).max(30),
  instructions: z.string().min(1),
  why: z.string().min(1).optional(),
});

export const TrainingDaySchema = z.object({
  day: z.string().min(1),
  focus: z.string().min(1),
  whyThisDay: z.string().min(1).optional(),
  warmup: z.array(SessionBlockSchema).min(1).max(6).optional(),
  exercises: z.array(TrainingExerciseSchema).min(1),
  cooldown: z.array(SessionBlockSchema).min(1).max(6).optional(),
});

export const TrainingPlanSchema = z.array(TrainingDaySchema).min(1);

const DailySessionLogEntrySchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adherencePct: z.coerce.number().min(0).max(100),
  plannedExercises: z.coerce.number().int().min(0).max(50),
  completedExercises: z.coerce.number().int().min(0).max(50),
  completed: z.boolean(),
  recordedAt: z.string().min(1),
});

export type TrainingDay = z.infer<typeof TrainingDaySchema>;
export type TrainingExercise = z.infer<typeof TrainingExerciseSchema>;
export type SessionBlock = z.infer<typeof SessionBlockSchema>;
export type DailySessionLogEntry = z.infer<typeof DailySessionLogEntrySchema>;
export type DailySessionLogs = Record<string, DailySessionLogEntry>;
export type AdherenceProgressionLevel = "progress" | "maintain" | "deload";

export const parseTrainingPlan = (rawPlan: string): TrainingDay[] | null => {
  try {
    const parsed = JSON.parse(rawPlan);
    return TrainingPlanSchema.parse(parsed);
  } catch {
    return null;
  }
};

type VideoSearchIntent = "technique" | "warmup" | "cooldown";

export const buildExerciseVideoSearchUrl = (
  exerciseName: string,
  intent: VideoSearchIntent = "technique"
): string => {
  const suffixByIntent: Record<VideoSearchIntent, string> = {
    technique: "technique proper form sports medicine",
    warmup: "dynamic warm up mobility prep",
    cooldown: "cool down stretch breathing recovery",
  };

  const query = encodeURIComponent(`${exerciseName} ${suffixByIntent[intent]}`);
  return `https://www.youtube.com/results?search_query=${query}`;
};

export const buildYouTubeSearchUrl = (query: string): string => {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
};

export type DailyAdjustments = Record<string, TrainingDay>;

export const parseDailySessionLogs = (rawLogs: string | undefined): DailySessionLogs => {
  if (!rawLogs || rawLogs.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawLogs);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const result: DailySessionLogs = {};
    Object.entries(parsed).forEach(([dateKey, entry]) => {
      const safeEntry = DailySessionLogEntrySchema.safeParse(entry);
      if (safeEntry.success) {
        result[dateKey] = safeEntry.data;
      }
    });

    return result;
  } catch {
    return {};
  }
};

export const stringifyDailySessionLogs = (logs: DailySessionLogs): string => {
  return JSON.stringify(logs);
};

const parseDateFromDateKey = (dateKey: string): Date | null => {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const getDaysDiff = (fromDate: Date, toDate: Date): number => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
};

export const computeRecentAdherenceScore = (
  logs: DailySessionLogs,
  referenceDate: Date = new Date(),
  windowDays = 21
): { score: number | null; completedSessions: number; loggedSessions: number } => {
  const entries = Object.values(logs).filter((entry) => {
    const date = parseDateFromDateKey(entry.dateKey);
    if (!date) {
      return false;
    }

    const diff = getDaysDiff(date, referenceDate);
    return diff >= 0 && diff < windowDays;
  });

  if (entries.length === 0) {
    return {
      score: null,
      completedSessions: 0,
      loggedSessions: 0,
    };
  }

  const score =
    entries.reduce((acc, entry) => acc + Math.max(0, Math.min(100, entry.adherencePct)), 0) / entries.length;
  const completedSessions = entries.filter((entry) => entry.completed).length;

  return {
    score: Number(score.toFixed(1)),
    completedSessions,
    loggedSessions: entries.length,
  };
};

export const resolveAdherenceProgressionLevel = (score: number | null): AdherenceProgressionLevel => {
  if (score === null) {
    return "maintain";
  }

  if (score >= 85) {
    return "progress";
  }

  if (score >= 65) {
    return "maintain";
  }

  return "deload";
};

const normalizeLoadText = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

const hasConcreteLoadValue = (value: string | undefined): boolean => {
  if (!value || value.trim().length === 0) {
    return false;
  }

  const normalized = normalizeLoadText(value);
  return (
    /\b\d+([.,]\d+)?\s?(kg|kgs|kilogramos|lb|lbs)\b/.test(normalized) ||
    normalized.includes("barra vacia") ||
    normalized.includes("empty bar") ||
    normalized.includes("peso corporal") ||
    normalized.includes("bodyweight") ||
    normalized.includes("primer pin") ||
    normalized.includes("first pin") ||
    normalized.includes("peso minimo") ||
    normalized.includes("minimum weight")
  );
};

const inferLoadProgressionLevel = (load: string | undefined): AdherenceProgressionLevel => {
  if (!load) {
    return "maintain";
  }

  const normalized = normalizeLoadText(load);
  if (
    normalized.includes("+2.5") ||
    normalized.includes("+5%") ||
    normalized.includes("prior week") ||
    normalized.includes("previous week") ||
    normalized.includes("semana previa")
  ) {
    return "progress";
  }

  if (
    normalized.includes("-5") ||
    normalized.includes("-10") ||
    normalized.includes("deload") ||
    normalized.includes("reduce load") ||
    normalized.includes("reducir carga")
  ) {
    return "deload";
  }

  return "maintain";
};

const resolveTargetRpe = (exercise: Pick<TrainingExercise, "rpe" | "load">): string => {
  if (exercise.rpe && exercise.rpe.trim().length > 0) {
    return exercise.rpe.trim();
  }

  const loadMatch = exercise.load?.match(/RPE\s*([0-9]+(?:\s*-\s*[0-9]+)?)/i);
  if (loadMatch?.[1]) {
    return loadMatch[1].replace(/\s+/g, "");
  }

  return "7";
};

const buildBaseLoadInstruction = (
  exerciseName: string,
  rpeTarget: string,
  language: SupportedLanguage
): string => {
  const insight = getExerciseInsight(exerciseName, language);

  if (language === "es") {
    if (insight.equipment === "barbell") {
      return `Empieza con barra vacia (20 kg) o barra tecnica mas ligera si hace falta. Si se siente muy suave, sube 2.5-5 kg; si se siente muy duro, baja un escalon. Busca RPE ${rpeTarget}.`;
    }

    if (insight.equipment === "dumbbell") {
      return `Empieza con las mancuernas mas ligeras disponibles (2-4 kg por mano). Si se siente muy suave, sube un escalon; si se siente muy duro, baja un escalon. Busca RPE ${rpeTarget}.`;
    }

    if (insight.equipment === "machine" || insight.equipment === "cable") {
      return `Empieza con el peso minimo de la maquina o el primer pin del cable. Ajusta un escalon arriba o abajo segun sensacion hasta llegar a RPE ${rpeTarget}.`;
    }

    if (insight.equipment === "bodyweight") {
      return `Empieza solo con peso corporal. Si se siente muy suave, anade la minima carga disponible o aumenta la dificultad; si se siente muy duro, reduce el rango o usa apoyo. Busca RPE ${rpeTarget}.`;
    }

    return `Empieza con la carga minima disponible y ajusta de forma progresiva segun sensacion hasta llegar a RPE ${rpeTarget}.`;
  }

  if (insight.equipment === "barbell") {
    return `Start with the empty bar (20 kg) or a lighter technique bar if needed. If it feels too easy, add 2.5-5 kg; if it feels too hard, drop one step. Aim for RPE ${rpeTarget}.`;
  }

  if (insight.equipment === "dumbbell") {
    return `Start with the lightest dumbbells available (2-4 kg each). If it feels too easy, go up one step; if it feels too hard, go down one step. Aim for RPE ${rpeTarget}.`;
  }

  if (insight.equipment === "machine" || insight.equipment === "cable") {
    return `Start with the minimum machine load or the first cable pin. Adjust one step up or down based on feel until you reach RPE ${rpeTarget}.`;
  }

  if (insight.equipment === "bodyweight") {
    return `Start with bodyweight only. If it feels too easy, add the smallest available load or increase difficulty; if it feels too hard, reduce range or use support. Aim for RPE ${rpeTarget}.`;
  }

  return `Start with the minimum available resistance and adjust progressively based on feel until you reach RPE ${rpeTarget}.`;
};

const buildProgressionInstruction = (
  level: AdherenceProgressionLevel,
  language: SupportedLanguage
): string => {
  if (language === "es") {
    if (level === "progress") {
      return "Si completas todas las series con tecnica limpia y aun se siente facil, sube 2.5-5% la proxima semana.";
    }

    if (level === "deload") {
      return "Hoy usa un escalon menos o aproximadamente 5-10% menos que la semana previa.";
    }

    return "Mantente en esta zona si la dificultad se siente correcta; ajusta un escalon arriba o abajo si queda muy suave o muy duro.";
  }

  if (level === "progress") {
    return "If all sets are clean and it still feels easy, increase 2.5-5% next week.";
  }

  if (level === "deload") {
    return "Use one step less today or about 5-10% less than last week.";
  }

  return "Stay in this zone if the difficulty feels right; move one step up or down if it feels too easy or too hard.";
};

export const resolveExerciseLoadDisplay = (
  exercise: Pick<TrainingExercise, "name" | "rpe" | "load">,
  language: SupportedLanguage,
  levelOverride?: AdherenceProgressionLevel
): string => {
  if (hasConcreteLoadValue(exercise.load)) {
    return exercise.load!.trim();
  }

  const level = levelOverride ?? inferLoadProgressionLevel(exercise.load);
  const base = buildBaseLoadInstruction(exercise.name, resolveTargetRpe(exercise), language);
  const progression = buildProgressionInstruction(level, language);
  return `${base} ${progression}`.trim();
};

const parseRangeValues = (value: string): number[] => {
  return value
    .split(/[^0-9.]+/g)
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((num) => Number.isFinite(num));
};

const adjustRangeString = (
  source: string,
  delta: number,
  minBound: number,
  maxBound: number,
  fallbackSingle: number
): string => {
  const values = parseRangeValues(source);
  if (values.length === 0) {
    const safeFallback = Math.max(minBound, Math.min(maxBound, fallbackSingle + delta));
    return String(Math.round(safeFallback));
  }

  if (values.length === 1) {
    const adjusted = Math.max(minBound, Math.min(maxBound, values[0] + delta));
    return String(Math.round(adjusted));
  }

  const first = Math.max(minBound, Math.min(maxBound, values[0] + delta));
  const second = Math.max(first, Math.min(maxBound, values[1] + delta));
  return `${Math.round(first)}-${Math.round(second)}`;
};

const resolveProgressionNote = (level: AdherenceProgressionLevel, language: "es" | "en"): string => {
  if (language === "es") {
    if (level === "progress") {
      return "Progresion semanal por alta adherencia: sube carga 2.5-5% si la tecnica fue estable.";
    }
    if (level === "deload") {
      return "Ajuste por baja adherencia/fatiga: reduce carga 5-10% y prioriza tecnica.";
    }
    return "Adherencia intermedia: manten volumen y carga, busca ejecucion consistente.";
  }

  if (level === "progress") {
    return "Weekly progression for high adherence: increase load by 2.5-5% if technique was stable.";
  }
  if (level === "deload") {
    return "Adjustment for low adherence/fatigue: reduce load by 5-10% and prioritize technique.";
  }
  return "Moderate adherence: maintain volume and load, prioritize consistent execution.";
};

const resolveLoadPrescription = (
  exercise: TrainingExercise,
  level: AdherenceProgressionLevel,
  language: "es" | "en"
): string => {
  return resolveExerciseLoadDisplay(exercise, language, level);
};

export const applyAdherenceProgressionToPlan = (
  plan: TrainingDay[],
  adherenceScore: number | null,
  language: "es" | "en" = "es"
): TrainingDay[] => {
  const level = resolveAdherenceProgressionLevel(adherenceScore);
  const progressionNote = resolveProgressionNote(level, language);

  return plan.map((day) => {
    const adjustedExercises = day.exercises.map((exercise) => {
      if (level === "progress") {
        return {
          ...exercise,
          sets: adjustRangeString(exercise.sets, 1, 1, 8, 3),
          reps: adjustRangeString(exercise.reps, 1, 3, 25, 10),
          load: resolveLoadPrescription(exercise, level, language),
        };
      }

      if (level === "deload") {
        return {
          ...exercise,
          sets: adjustRangeString(exercise.sets, -1, 1, 8, 3),
          reps: adjustRangeString(exercise.reps, -1, 3, 25, 10),
          load: resolveLoadPrescription(exercise, level, language),
        };
      }

      return {
        ...exercise,
        load: resolveLoadPrescription(exercise, level, language),
      };
    });

    const whyThisDay = day.whyThisDay
      ? `${day.whyThisDay} ${progressionNote}`
      : progressionNote;

    return {
      ...day,
      whyThisDay,
      exercises: adjustedExercises,
    };
  });
};

export const parseDailyAdjustments = (rawAdjustments: string | undefined): DailyAdjustments => {
  if (!rawAdjustments || rawAdjustments.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawAdjustments);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const result: DailyAdjustments = {};
    Object.entries(parsed).forEach(([dateKey, dayValue]) => {
      const safeDay = TrainingDaySchema.safeParse(dayValue);
      if (safeDay.success) {
        result[dateKey] = safeDay.data;
      }
    });

    return result;
  } catch {
    return {};
  }
};

export const stringifyDailyAdjustments = (adjustments: DailyAdjustments): string => {
  return JSON.stringify(adjustments);
};

export const getIsoDateKey = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const toAverageNumericValue = (value: string, fallback: number): number => {
  const cleaned = value.toLowerCase().replace(/[^0-9.\-]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return fallback;
  }

  const parts = cleaned.split("-").map((part) => Number(part.trim())).filter((num) => Number.isFinite(num));
  if (parts.length === 0) {
    return fallback;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return (parts[0] + parts[1]) / 2;
};

export const parseSetsToEstimatedCount = (sets: string): number => {
  return Math.max(1, toAverageNumericValue(sets, 3));
};

export const parseRepsToEstimatedCount = (reps: string): number => {
  return Math.max(1, toAverageNumericValue(reps, 10));
};

export const parseRestToSeconds = (rest: string): number => {
  const normalized = rest.toLowerCase();
  const value = toAverageNumericValue(normalized, 60);

  if (normalized.includes("min") || normalized.includes("m")) {
    return Math.max(10, value * 60);
  }

  return Math.max(10, value);
};

export const estimateExerciseDurationMinutes = (exercise: TrainingExercise): number => {
  const sets = parseSetsToEstimatedCount(exercise.sets);
  const reps = parseRepsToEstimatedCount(exercise.reps);
  const restSeconds = parseRestToSeconds(exercise.rest);

  const workSecondsPerRep = 4;
  const workSeconds = sets * reps * workSecondsPerRep;
  const restTotalSeconds = Math.max(0, sets - 1) * restSeconds;
  const setupSeconds = 45;
  const transitionSeconds = 20;

  const totalSeconds = workSeconds + restTotalSeconds + setupSeconds + transitionSeconds;
  return totalSeconds / 60;
};

export const estimateSessionBlocksMinutes = (blocks: SessionBlock[] | undefined, fallback: number): number => {
  if (!blocks || blocks.length === 0) {
    return fallback;
  }

  return blocks.reduce((acc, block) => acc + Math.max(1, block.durationMinutes), 0);
};

export const estimateTrainingDayDurationMinutes = (day: TrainingDay): number => {
  const exercisesMinutes = day.exercises.reduce((acc, exercise) => acc + estimateExerciseDurationMinutes(exercise), 0);
  const warmupMinutes = estimateSessionBlocksMinutes(day.warmup, 8);
  const cooldownMinutes = estimateSessionBlocksMinutes(day.cooldown, 5);

  return Math.round(exercisesMinutes + warmupMinutes + cooldownMinutes);
};

export const trimDayToAvailableMinutes = (day: TrainingDay, availableMinutes: number): TrainingDay => {
  if (!Number.isFinite(availableMinutes) || availableMinutes <= 0) {
    return day;
  }

  const minimumMinutes = 20;
  const targetMinutes = Math.max(minimumMinutes, availableMinutes);
  const exercises: TrainingExercise[] = [];
  let accumulatedMinutes =
    estimateSessionBlocksMinutes(day.warmup, 8) + estimateSessionBlocksMinutes(day.cooldown, 5);

  for (const exercise of day.exercises) {
    const exerciseMinutes = estimateExerciseDurationMinutes(exercise);
    const hasAny = exercises.length > 0;
    const canFit = accumulatedMinutes + exerciseMinutes <= targetMinutes;

    if (!hasAny || canFit) {
      exercises.push(exercise);
      accumulatedMinutes += exerciseMinutes;
    }
  }

  if (exercises.length === 0 && day.exercises.length > 0) {
    exercises.push(day.exercises[0]);
  }

  return {
    ...day,
    exercises,
    whyThisDay: day.whyThisDay,
  };
};

export const getPlanAgeInDays = (generatedAt: string | undefined): number | null => {
  if (!generatedAt) {
    return null;
  }

  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) {
    return null;
  }

  const now = new Date();
  const diffMs = now.getTime() - generatedDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};
