"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getUserProfile, updateUserProfile } from "@/lib/firebase/firestore";
import {
    applyAdherenceProgressionToPlan,
    computeRecentAdherenceScore,
    DailyAdjustments,
    estimateTrainingDayDurationMinutes,
    getIsoDateKey,
    getPlanAgeInDays,
    parseDailyAdjustments,
    parseDailySessionLogs,
    parseTrainingPlan,
    resolveExerciseLoadDisplay,
    SessionBlock,
    trimDayToAvailableMinutes,
    stringifyDailyAdjustments,
    TrainingDay,
    TrainingExercise,
} from "@/lib/trainingPlan";
import { UserProfile } from "@/lib/types";
import { generateTrainingPlan } from "@/app/actions/generateRoutine";
import { adjustDailyWorkoutForPain } from "@/app/actions/adjustDailyWorkout";
import { generateDailyExpertTip } from "@/app/actions/generateDailyTip";
import { EquipmentType, getCatalogFilterOptions, getExerciseInsight, getMuscleLabel, MovementPattern, MuscleGroup } from "@/lib/exerciseCatalog";
import { getExerciseAlternatives, getExerciseDatabase, searchExercises } from "@/lib/exerciseDatabase";
import { localizeFocusLabel, localizeNarrativeText } from "@/lib/narrativeLocalization";
import { SESSION_PHASE_VIDEO_WHITELIST } from "@/data/videoWhitelist";
import { AlertTriangle, Calendar, Dumbbell, ExternalLink, Loader2, PlusCircle, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";

const LazyExerciseTechniquePanel = dynamic(() => import("@/components/ExerciseTechniquePanel"), {
    ssr: false,
    loading: () => (
        <div className="h-20 rounded-md border border-border/60 bg-background/40 animate-pulse" />
    ),
});

type WeeklyCalendarItem = {
    key: string;
    dateKey: string;
    weekday: string;
    dayNumber: number;
    month: string;
    dateLabel: string;
    focus: string;
    planEntry: TrainingDay | null;
    isToday: boolean;
    source: "plan" | "adjusted" | "rest" | "prestart";
};

type CustomExerciseDraft = {
    name: string;
    sets: string;
    reps: string;
    rest: string;
    notes: string;
    why: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeReplacementInput = (value: string): string => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

const emptyDraft: CustomExerciseDraft = {
    name: "",
    sets: "3",
    reps: "10-12",
    rest: "60-90s",
    notes: "",
    why: "",
};

const parseDateOnly = (value: string | undefined | null): Date | null => {
    if (!value) {
        return null;
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    parsed.setHours(0, 0, 0, 0);
    return parsed;
};

const buildWorkoutSlots = (workoutTargets: number): number[] => {
    const safeTargets = Math.min(Math.max(workoutTargets, 0), 7);
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

const toAiProfileInput = (profile: UserProfile) => {
    return {
        age: profile.age ?? 30,
        weight: profile.weight ?? 70,
        height: profile.height ?? 170,
        goal: profile.goal,
        equipment: profile.equipment,
        experienceLevel: profile.experienceLevel,
        injuries: profile.injuries,
        trainingDays: profile.trainingDays ?? 3,
        planStartDate: profile.planStartDate,
        availableMinutesPerSession: profile.availableMinutesPerSession ?? 60,
        preferredLanguage: profile.preferredLanguage,
    };
};

type FocusOverrideKey =
    | "push_chest"
    | "pull_back"
    | "legs"
    | "posterior_chain"
    | "shoulders_arms"
    | "core"
    | "mobility"
    | "trx_pilates_yoga";

type FocusOverridePreset = {
    key: FocusOverrideKey;
    labelEn: string;
    labelEs: string;
    focusEn: string;
    focusEs: string;
    primaryMuscles: MuscleGroup[];
    preferredPatterns: MovementPattern[];
    priorityKeywords: string[];
};

const FOCUS_OVERRIDE_PRESETS: FocusOverridePreset[] = [
    {
        key: "push_chest",
        labelEn: "Chest + Triceps",
        labelEs: "Pecho + Triceps",
        focusEn: "Push (Chest/Shoulders/Triceps)",
        focusEs: "Empuje (Pecho/Hombros/Triceps)",
        primaryMuscles: ["chest", "triceps", "shoulders"],
        preferredPatterns: ["push", "isolation"],
        priorityKeywords: ["bench", "press", "push up", "chest", "triceps"],
    },
    {
        key: "pull_back",
        labelEn: "Back + Biceps",
        labelEs: "Espalda + Biceps",
        focusEn: "Pull (Back/Biceps)",
        focusEs: "Traccion (Espalda/Biceps)",
        primaryMuscles: ["back", "biceps", "forearms"],
        preferredPatterns: ["pull", "isolation"],
        priorityKeywords: ["row", "pull", "lat", "biceps", "face pull", "trx row"],
    },
    {
        key: "legs",
        labelEn: "Legs",
        labelEs: "Pierna",
        focusEn: "Lower Body (Quads/Glutes/Hamstrings)",
        focusEs: "Tren Inferior (Cuadriceps/Gluteos/Isquios)",
        primaryMuscles: ["quads", "glutes", "hamstrings", "calves"],
        preferredPatterns: ["squat", "hinge", "lunge"],
        priorityKeywords: ["squat", "deadlift", "lunge", "press", "hip thrust", "glute"],
    },
    {
        key: "posterior_chain",
        labelEn: "Posterior Chain",
        labelEs: "Cadena Posterior",
        focusEn: "Posterior Chain (Glutes/Hamstrings/Back)",
        focusEs: "Cadena Posterior (Gluteos/Isquios/Espalda)",
        primaryMuscles: ["glutes", "hamstrings", "back", "core"],
        preferredPatterns: ["hinge", "pull"],
        priorityKeywords: ["deadlift", "romanian", "hip thrust", "glute bridge", "row"],
    },
    {
        key: "shoulders_arms",
        labelEn: "Shoulders + Arms",
        labelEs: "Hombros + Brazos",
        focusEn: "Shoulders / Biceps / Triceps",
        focusEs: "Hombros / Biceps / Triceps",
        primaryMuscles: ["shoulders", "biceps", "triceps", "forearms"],
        preferredPatterns: ["push", "pull", "isolation"],
        priorityKeywords: ["shoulder", "press", "raise", "curl", "triceps", "face pull"],
    },
    {
        key: "core",
        labelEn: "Core",
        labelEs: "Core",
        focusEn: "Core Stability",
        focusEs: "Estabilidad del Core",
        primaryMuscles: ["core", "hip_flexors"],
        preferredPatterns: ["core", "isolation"],
        priorityKeywords: ["core", "plank", "dead bug", "pilates", "trx pike"],
    },
    {
        key: "mobility",
        labelEn: "Mobility / Yoga / Pilates",
        labelEs: "Movilidad / Yoga / Pilates",
        focusEn: "Mobility + Recovery",
        focusEs: "Movilidad + Recuperacion",
        primaryMuscles: ["hip_flexors", "back", "shoulders", "core"],
        preferredPatterns: ["mobility", "core"],
        priorityKeywords: ["yoga", "pilates", "stretch", "mobility", "sun salutation", "trx"],
    },
    {
        key: "trx_pilates_yoga",
        labelEn: "TRX / Pilates / Yoga",
        labelEs: "TRX / Pilates / Yoga",
        focusEn: "TRX + Pilates + Yoga Session",
        focusEs: "Sesion TRX + Pilates + Yoga",
        primaryMuscles: ["core", "shoulders", "back", "glutes", "hip_flexors"],
        preferredPatterns: ["core", "mobility", "push", "pull", "lunge"],
        priorityKeywords: ["trx", "pilates", "yoga", "sun salutation", "mobility", "stretch"],
    },
];

const normalizeSearchText = (value: string): string => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

const resolveEquivalentMatch = (
    replacementInput: string,
    options: ReturnType<typeof getExerciseAlternatives>
): ReturnType<typeof getExerciseAlternatives>[number] | null => {
    const normalizedReplacement = normalizeReplacementInput(replacementInput);
    if (!normalizedReplacement) {
        return null;
    }

    const exactMatch = options.find((option) => {
        const normalizedLocalized = normalizeReplacementInput(option.name);
        const normalizedCanonical = normalizeReplacementInput(option.canonicalName);
        return normalizedReplacement === normalizedLocalized || normalizedReplacement === normalizedCanonical;
    });
    if (exactMatch) {
        return exactMatch;
    }

    const replacementTokens = normalizedReplacement.split(" ").filter(Boolean);
    let best: ReturnType<typeof getExerciseAlternatives>[number] | null = null;
    let bestScore = 0;

    options.forEach((option) => {
        const normalizedOptionText = normalizeReplacementInput(`${option.name} ${option.canonicalName}`);
        let score = 0;

        if (normalizedOptionText.includes(normalizedReplacement) || normalizedReplacement.includes(normalizedOptionText)) {
            score += 8;
        }

        const sharedTokens = replacementTokens.filter((token) => normalizedOptionText.includes(token)).length;
        score += sharedTokens * 3;

        if (score > bestScore) {
            bestScore = score;
            best = option;
        }
    });

    return bestScore >= 5 ? best : null;
};

const intersectionCount = <T extends string>(a: T[], b: T[]): number => {
    const bSet = new Set(b);
    return a.reduce((acc, value) => acc + (bSet.has(value) ? 1 : 0), 0);
};

const isExerciseCompatibleWithEquipment = (
    equipment: ReturnType<typeof getExerciseInsight>["equipment"],
    availableEquipment: "gym" | "dumbbells" | "bodyweight"
): boolean => {
    if (availableEquipment === "gym") {
        return true;
    }

    if (availableEquipment === "dumbbells") {
        return equipment === "dumbbell" || equipment === "bodyweight" || equipment === "mixed";
    }

    return equipment === "bodyweight";
};

const isWarmupOrCooldownLabel = (name: string): boolean => {
    const normalized = normalizeSearchText(name);
    return (
        normalized.includes("warm up") ||
        normalized.includes("warmup") ||
        normalized.includes("cool down") ||
        normalized.includes("cooldown") ||
        normalized.includes("breathing downregulation") ||
        normalized.includes("targeted stretching") ||
        normalized.includes("movilidad articular inicial") ||
        normalized.includes("vuelta a la calma") ||
        normalized.includes("estiramiento dirigido")
    );
};

const buildExercisePrescription = (pattern: MovementPattern): Pick<TrainingExercise, "sets" | "reps" | "rest"> => {
    if (pattern === "mobility") {
        return { sets: "2-3", reps: "8-12", rest: "30-45s" };
    }

    if (pattern === "core") {
        return { sets: "3", reps: "10-15", rest: "45-60s" };
    }

    if (pattern === "isolation") {
        return { sets: "3", reps: "10-15", rest: "60s" };
    }

    return { sets: "3-4", reps: "6-12", rest: "60-90s" };
};

const resolvePlanEntryForDate = ({
    targetDate,
    todayDate,
    planStartDate,
    trainingDaysPerWeek,
    plan,
    dailyAdjustments,
}: {
    targetDate: Date;
    todayDate: Date;
    planStartDate: string | null;
    trainingDaysPerWeek: number;
    plan: TrainingDay[] | null;
    dailyAdjustments: DailyAdjustments;
}): { planEntry: TrainingDay | null; source: WeeklyCalendarItem["source"] } => {
    const startDate = parseDateOnly(planStartDate) ?? todayDate;
    const workoutTargets = Math.min(Math.max(trainingDaysPerWeek ?? plan?.length ?? 0, 0), 7);
    const workoutSlots = buildWorkoutSlots(workoutTargets);
    const dateKey = getIsoDateKey(targetDate);
    const daysSinceStart = Math.floor((targetDate.getTime() - startDate.getTime()) / DAY_MS);

    if (daysSinceStart < 0) {
        return { planEntry: null, source: "prestart" };
    }

    const adjustedEntry = dailyAdjustments[dateKey];
    if (adjustedEntry) {
        return { planEntry: adjustedEntry, source: "adjusted" };
    }

    const weekCycleDay = daysSinceStart % 7;
    const shouldTrain = workoutSlots.includes(weekCycleDay) && !!plan && plan.length > 0;
    if (!shouldTrain || !plan || plan.length === 0 || workoutTargets <= 0) {
        return { planEntry: null, source: "rest" };
    }

    const weeksCompleted = Math.floor(daysSinceStart / 7);
    const sessionsThisWeek = workoutSlots.filter((slot) => slot <= weekCycleDay).length;
    const sessionSequence = weeksCompleted * workoutTargets + sessionsThisWeek - 1;
    const safeIndex = ((sessionSequence % plan.length) + plan.length) % plan.length;
    return { planEntry: plan[safeIndex], source: "plan" };
};

export default function SessionPage() {
    const { user } = useAuth();
    const { language } = useLanguage();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [plan, setPlan] = useState<TrainingDay[] | null>(null);
    const [dailyAdjustments, setDailyAdjustments] = useState<DailyAdjustments>({});
    const [planGeneratedAt, setPlanGeneratedAt] = useState<string | null>(null);
    const [planStartDate, setPlanStartDate] = useState<string | null>(null);
    const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState<number>(3);
    const [autoWeeklyRefresh, setAutoWeeklyRefresh] = useState(true);

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [refreshingWeek, setRefreshingWeek] = useState(false);
    const [adjustingDay, setAdjustingDay] = useState(false);
    const [adjustingByTimeOnly, setAdjustingByTimeOnly] = useState(false);
    const [savingCustomExercise, setSavingCustomExercise] = useState(false);
    const [swappingExerciseIndex, setSwappingExerciseIndex] = useState<number | null>(null);
    const [removingExerciseIndex, setRemovingExerciseIndex] = useState<number | null>(null);

    const [painText, setPainText] = useState("");
    const [painLevel, setPainLevel] = useState(3);
    const [availableMinutesToday, setAvailableMinutesToday] = useState(60);
    const [customExerciseDraft, setCustomExerciseDraft] = useState<CustomExerciseDraft>(emptyDraft);
    const [exerciseSearchDraft, setExerciseSearchDraft] = useState("");
    const [exerciseSearchQuery, setExerciseSearchQuery] = useState("");
    const [searchPatternFilter, setSearchPatternFilter] = useState<"all" | MovementPattern>("all");
    const [searchEquipmentFilter, setSearchEquipmentFilter] = useState<"all" | EquipmentType>("all");
    const [searchMuscleFilter, setSearchMuscleFilter] = useState<"all" | MuscleGroup>("all");
    const [replacementDrafts, setReplacementDrafts] = useState<Record<number, string>>({});
    const [openPreviewKeys, setOpenPreviewKeys] = useState<Record<string, boolean>>({});
    const [focusOverrideKey, setFocusOverrideKey] = useState<FocusOverrideKey>("push_chest");
    const [applyingFocusOverride, setApplyingFocusOverride] = useState(false);
    const [dailyTip, setDailyTip] = useState<string | null>(null);
    const [tipLoading, setTipLoading] = useState(false);

    const refreshAttemptedRef = useRef(false);
    const tipRefreshDayRef = useRef<string | null>(null);
    const selectedLanguage = language === "en" ? "en" : "es";
    const exerciseOptions = useMemo(() => getExerciseDatabase(selectedLanguage), [selectedLanguage]);
    const catalogFilterOptions = useMemo(() => getCatalogFilterOptions(selectedLanguage), [selectedLanguage]);
    const isEnglish = language === "en";
    const text = isEnglish
        ? {
            welcome: "Welcome",
            subtitle: "Understand your plan, adapt it safely, and execute with intent.",
            expertTipTitle: "Expert Tip of the Day",
            expertTipSubtitle: "Daily sports-medicine guidance aligned with your goal and level.",
            generatingTip: "Generating your daily tip...",
            openPlan: "Open Full Plan",
            activeDays: "Active Plan Days",
            planAge: "Plan Age",
            weeklyRefresh: "Weekly Refresh",
            refreshing: "Refreshing...",
            updateNeeded: "Update Needed",
            upToDate: "Up to Date",
            autoWeekly: "Auto Weekly Update",
            enabled: "Enabled",
            disabled: "Disabled",
            tapToChange: "Tap to change",
            stalePlanPrefix: "Your routine is older than 7 days.",
            stalePlanAuto: "Auto refresh is in progress or will run on next load.",
            stalePlanManual: "Enable auto refresh or regenerate manually.",
            goToPlan: "Go to plan",
            weeklyCalendar: "Today Session",
            openWeeklyPlanner: "Open weekly planner",
            today: "Today",
            startDate: "Start date",
            notSet: "Not set",
            sessionDetails: "Session Details",
            focus: "Focus",
            adjustedTag: "Adjusted for this day",
            estimatedDuration: "Estimated duration",
            minutes: "minutes",
            warmupPhase: "Warm-up / Mobility",
            cooldownPhase: "Cooldown / Stretching",
            phaseDuration: "Duration",
            preStart: "This day is before your selected start date. Training blocks will begin after start.",
            whySession: "Why this session",
            whyExercise: "Why",
            localVideo: "Local Video",
            techniqueReference: "Technique Reference",
            exercisePreview: "Technique + Muscle Map",
            openPreviewHint: "Open this section to load technique guidance and the anatomy map.",
            noWorkout: "No workout assigned. Use this day for recovery, mobility, or light cardio.",
            focusOverrideTitle: "Smart Focus Override",
            focusOverrideSubtitle: "Switch today's muscle group without repeating yesterday's primary load pattern.",
            focusOverrideSelect: "Target focus for today",
            focusOverrideApply: "Apply focus override",
            focusOverrideApplied: "Session focus updated for",
            focusOverrideConflict: "That focus overlaps with yesterday's primary muscles. Choose another group to keep weekly distribution coherent.",
            previousDayFocus: "Previous day focus",
            blockedByPrevious: "Blocked by previous day overlap",
            noFocusOption: "No safe focus options available today with current equipment.",
            focusOverrideError: "Could not apply the new focus. Try a different group or check equipment limits.",
            focusOverrideNoCandidates: "Not enough compatible exercises were found for that focus with your available equipment.",
            painCheckin: "Daily Pain Check-In",
            painDescription: "Report discomfort before training. The AI will adjust today's session to protect progress and reduce risk.",
            painPlaceholder: "Example: mild anterior knee pain on deep flexion",
            painLevel: "Pain level",
            availableTime: "Available time today (minutes)",
            availableTimeHint: "If this is below ideal, AI will adapt and mark it as viable but not optimal.",
            adjustToday: "Adjust Today Session",
            adjustByTimeOnly: "Adjust Only by Time",
            adjustByTimeOnlyHint: "Trim or expand only today's session by available minutes, without modifying the rest of the weekly plan.",
            addExerciseTitle: "Add Exercise to Today",
            addExerciseDescription: "Add extra work when needed. Custom additions are saved specifically for today's date.",
            exerciseName: "Exercise name",
            searchLibrary: "Search exercise library",
            searchLibraryHint: "Search before adding free text. Queries like core, trx, pilates, yoga, mobility, or glutes work best.",
            searchPlaceholder: "Example: core, trx, pilates, yoga",
            searchAction: "Search",
            clearSearch: "Clear",
            suggestedMatches: "Suggested matches",
            useExercise: "Use this exercise",
            noSearchResults: "No matches were found in the library for that term.",
            searchPattern: "Pattern",
            searchEquipment: "Equipment",
            searchMuscle: "Muscle",
            sets: "Sets",
            reps: "Reps",
            rest: "Rest",
            coachingNotes: "Coaching notes",
            whyPlaceholder: "Why this exercise helps goal progress",
            quickModalityTitle: "Quick modality add-ons",
            quickModalityHint: "Fast insert for TRX, Pilates, and Yoga movements.",
            addCustomExercise: "Add Custom Exercise",
            replaceWith: "Replace with",
            swapTitle: "1:1 Equipment Substitute",
            swapHint: "Tap one suggestion or type another equivalent option if the station is busy or unavailable.",
            swapFuzzyHint: "You do not need the exact full name; partial terms will auto-match the best 1:1 option.",
            replaceExercise: "Replace",
            removeExercise: "Remove",
            replacePlaceholder: "Alternative exercise name",
            equivalentHint: "Equivalent 1:1 options",
            replacementMustBeEquivalent: "Choose one of the equivalent 1:1 suggestions for safe replacement.",
            noEquivalentFound: "No safe 1:1 equivalent was found for this exercise with your available equipment.",
            cannotRemoveLast: "At least one exercise must remain in the session.",
            replaceExerciseError: "Failed to replace exercise.",
            removeExerciseError: "Failed to remove exercise.",
            replacedNotice: "Exercise replaced for",
            removedNotice: "Exercise removed for",
            youtubeGuide: "YouTube Guide",
            load: "Load",
            customSessionAdded: "Custom exercise added for",
            sessionAdjusted: "Session adjusted for",
            sessionAdjustedByTime: "Session adjusted only by available time for",
            basedOnPain: "based on your pain report.",
            autoRefreshEnabled: "Weekly auto refresh enabled.",
            autoRefreshDisabled: "Weekly auto refresh disabled.",
            loadProfileError: "Failed to load your profile data.",
            signedInRequired: "You must be signed in.",
            updateAutoRefreshError: "Failed to update weekly auto refresh setting.",
            selectTrainingDayFirst: "Select a training day to adjust first.",
            adjustSessionError: "Could not adjust today's session. Try again.",
            adjustByTimeError: "Could not adjust today by time only. Try again.",
            selectActiveDayFirst: "Select an active day before adding custom exercises.",
            exerciseNameRequired: "Exercise name is required.",
            saveExerciseError: "Failed to save custom exercise.",
            profileMissing: "Profile not found. Please complete onboarding again.",
            planCorrupted: "Your stored plan is corrupted. Regenerate it from the Plan section.",
            autoRefreshCompleted: "Your routine was automatically refreshed because it was older than 7 days.",
            autoRefreshFailed: "Automatic weekly refresh failed. You can update your plan manually.",
            planStartsSoon: "Plan starts soon",
            recoveryMobility: "Recovery / Mobility",
            customSession: "Custom Session",
            customSessionWhy: "User-created day to maintain continuity with the weekly goal.",
            customDefaultWhy: "Custom addition to support today's objective.",
        }
        : {
            welcome: "Bienvenido",
            subtitle: "Entiende tu plan, ajustalo de forma segura y ejecuta con intencion.",
            expertTipTitle: "Tip del Experto del Dia",
            expertTipSubtitle: "Recomendacion diaria de medicina deportiva segun tu objetivo y nivel.",
            generatingTip: "Generando tip diario...",
            openPlan: "Abrir Plan Completo",
            activeDays: "Dias del Plan",
            planAge: "Antiguedad del Plan",
            weeklyRefresh: "Actualizacion Semanal",
            refreshing: "Actualizando...",
            updateNeeded: "Actualizar",
            upToDate: "Al Dia",
            autoWeekly: "Actualizacion Auto",
            enabled: "Activa",
            disabled: "Inactiva",
            tapToChange: "Toca para cambiar",
            stalePlanPrefix: "Tu rutina tiene mas de 7 dias.",
            stalePlanAuto: "La actualizacion automatica esta en proceso o correra al siguiente ingreso.",
            stalePlanManual: "Activa auto refresh o regenera manualmente.",
            goToPlan: "Ir al plan",
            weeklyCalendar: "Sesion de Hoy",
            openWeeklyPlanner: "Abrir planificador semanal",
            today: "Hoy",
            startDate: "Inicio",
            notSet: "No definido",
            sessionDetails: "Detalle de Sesion",
            focus: "Enfoque",
            adjustedTag: "Ajustada para este dia",
            estimatedDuration: "Duracion estimada",
            minutes: "minutos",
            warmupPhase: "Calentamiento / Movilidad",
            cooldownPhase: "Enfriamiento / Estiramiento",
            phaseDuration: "Duracion",
            preStart: "Este dia es previo a tu fecha de inicio. El bloque empezara despues de esa fecha.",
            whySession: "Por que esta sesion",
            whyExercise: "Por que",
            localVideo: "Video Local",
            techniqueReference: "Referencia Tecnica",
            exercisePreview: "Tecnica + Mapa Muscular",
            openPreviewHint: "Abre esta seccion para cargar la guia tecnica y el mapa anatomico.",
            noWorkout: "No hay entrenamiento asignado. Usa este dia para recuperacion, movilidad o cardio suave.",
            focusOverrideTitle: "Cambio Inteligente de Enfoque",
            focusOverrideSubtitle: "Cambia el grupo muscular de hoy sin repetir el patron principal del dia previo.",
            focusOverrideSelect: "Enfoque objetivo para hoy",
            focusOverrideApply: "Aplicar cambio de enfoque",
            focusOverrideApplied: "Enfoque de sesion actualizado para",
            focusOverrideConflict: "Ese enfoque se solapa con la carga muscular principal de ayer. Elige otro grupo para mantener coherencia semanal.",
            previousDayFocus: "Enfoque del dia previo",
            blockedByPrevious: "Bloqueado por solape con el dia previo",
            noFocusOption: "No hay enfoques seguros disponibles hoy con el equipamiento actual.",
            focusOverrideError: "No se pudo aplicar el nuevo enfoque. Intenta con otro grupo o revisa limites de equipo.",
            focusOverrideNoCandidates: "No se encontraron suficientes ejercicios compatibles para ese enfoque con tu equipamiento disponible.",
            painCheckin: "Chequeo Diario de Dolor",
            painDescription: "Reporta molestias antes de entrenar. La IA ajustara la sesion para proteger progreso y reducir riesgo.",
            painPlaceholder: "Ejemplo: dolor leve de rodilla en flexion profunda",
            painLevel: "Nivel de dolor",
            availableTime: "Tiempo disponible hoy (minutos)",
            availableTimeHint: "Si es menos del ideal, la IA lo ajustara y avisara que es viable pero no optimo.",
            adjustToday: "Ajustar Sesion de Hoy",
            adjustByTimeOnly: "Ajustar Solo por Tiempo",
            adjustByTimeOnlyHint: "Recorta o expande solo la sesion de hoy segun minutos disponibles, sin modificar el resto del plan semanal.",
            addExerciseTitle: "Agregar Ejercicio para Hoy",
            addExerciseDescription: "Agrega trabajo extra cuando haga falta. Se guarda especificamente para la fecha de hoy.",
            exerciseName: "Nombre del ejercicio",
            searchLibrary: "Buscar en la libreria de ejercicios",
            searchLibraryHint: "Busca antes de agregar texto libre. Terminos como core, trx, pilates, yoga, movilidad o gluteos funcionan mejor.",
            searchPlaceholder: "Ejemplo: core, trx, pilates, yoga",
            searchAction: "Buscar",
            clearSearch: "Limpiar",
            suggestedMatches: "Coincidencias sugeridas",
            useExercise: "Usar este ejercicio",
            noSearchResults: "No se encontraron coincidencias en la libreria para ese termino.",
            searchPattern: "Patron",
            searchEquipment: "Equipo",
            searchMuscle: "Musculo",
            sets: "Series",
            reps: "Repeticiones",
            rest: "Descanso",
            coachingNotes: "Notas tecnicas",
            whyPlaceholder: "Por que este ejercicio ayuda al objetivo",
            quickModalityTitle: "Atajos de modalidad",
            quickModalityHint: "Insercion rapida de ejercicios TRX, Pilates y Yoga.",
            addCustomExercise: "Agregar Ejercicio",
            replaceWith: "Cambiar por",
            swapTitle: "Sustituto 1:1 por Equipo",
            swapHint: "Pulsa una sugerencia o escribe otro equivalente si la maquina o estacion no esta disponible.",
            swapFuzzyHint: "No necesitas escribir el nombre exacto completo; un termino parcial intentara coincidir con la mejor opcion 1:1.",
            replaceExercise: "Cambiar",
            removeExercise: "Quitar",
            replacePlaceholder: "Nombre de ejercicio alternativo",
            equivalentHint: "Opciones equivalentes 1:1",
            replacementMustBeEquivalent: "Elige una de las sugerencias equivalentes 1:1 para un cambio seguro.",
            noEquivalentFound: "No se encontro un equivalente 1:1 seguro con tu equipamiento disponible.",
            cannotRemoveLast: "Debe quedar al menos un ejercicio en la sesion.",
            replaceExerciseError: "No se pudo cambiar el ejercicio.",
            removeExerciseError: "No se pudo quitar el ejercicio.",
            replacedNotice: "Ejercicio reemplazado para",
            removedNotice: "Ejercicio eliminado para",
            youtubeGuide: "Guia YouTube",
            load: "Carga",
            customSessionAdded: "Ejercicio agregado para",
            sessionAdjusted: "Sesion ajustada para",
            sessionAdjustedByTime: "Sesion ajustada solo por tiempo disponible para",
            basedOnPain: "segun tu reporte de dolor.",
            autoRefreshEnabled: "Actualizacion semanal automatica activada.",
            autoRefreshDisabled: "Actualizacion semanal automatica desactivada.",
            loadProfileError: "No se pudo cargar tu perfil.",
            signedInRequired: "Debes iniciar sesion.",
            updateAutoRefreshError: "No se pudo actualizar la preferencia de auto refresh.",
            selectTrainingDayFirst: "Selecciona un dia de entrenamiento para ajustarlo.",
            adjustSessionError: "No se pudo ajustar la sesion de hoy. Intenta de nuevo.",
            adjustByTimeError: "No se pudo ajustar hoy solo por tiempo. Intenta de nuevo.",
            selectActiveDayFirst: "Selecciona un dia activo antes de agregar ejercicios.",
            exerciseNameRequired: "El nombre del ejercicio es obligatorio.",
            saveExerciseError: "No se pudo guardar el ejercicio.",
            profileMissing: "Perfil no encontrado. Completa onboarding nuevamente.",
            planCorrupted: "El plan guardado esta corrupto. Regeneralo desde la seccion Plan.",
            autoRefreshCompleted: "Tu rutina se actualizo automaticamente porque tenia mas de 7 dias.",
            autoRefreshFailed: "Fallo la actualizacion automatica semanal. Puedes actualizar manualmente.",
            planStartsSoon: "El plan inicia pronto",
            recoveryMobility: "Recuperacion / Movilidad",
            customSession: "Sesion Personalizada",
            customSessionWhy: "Dia creado por el usuario para mantener continuidad con el objetivo semanal.",
            customDefaultWhy: "Adicion personalizada para apoyar el objetivo del dia.",
        };
    const quickModalityExerciseNames = [
        "TRX Row",
        "TRX Chest Press",
        "TRX Assisted Squat",
        "TRX Split Squat",
        "TRX Hamstring Curl",
        "TRX Pike",
        "TRX Y Fly",
        "Pilates Hundred",
        "Pilates Roll Up",
        "Pilates Single Leg Stretch",
        "Pilates Shoulder Bridge",
        "Pilates Swan",
        "Yoga Downward Dog",
        "Yoga Cobra Pose",
        "Yoga Low Lunge Stretch",
        "Yoga Pigeon Stretch",
        "Sun Salutation Flow",
    ];

    useEffect(() => {
        let isMounted = true;

        const loadProfile = async () => {
            if (!user) {
                if (isMounted) {
                    setLoadingProfile(false);
                }
                return;
            }

            try {
                const loadedProfile = await getUserProfile(user.uid);
                if (!loadedProfile) {
                    setError(text.profileMissing);
                    return;
                }

                if (!isMounted) {
                    return;
                }

                setProfile(loadedProfile);
                setPlanGeneratedAt(loadedProfile.currentPlanGeneratedAt ?? null);
                setTrainingDaysPerWeek(loadedProfile.trainingDays ?? 3);
                setPlanStartDate(loadedProfile.planStartDate ?? new Date().toISOString().slice(0, 10));
                setAutoWeeklyRefresh(loadedProfile.autoWeeklyRefresh ?? true);
                setDailyAdjustments(parseDailyAdjustments(loadedProfile.dailyAdjustments));
                setAvailableMinutesToday(loadedProfile.availableMinutesPerSession ?? 60);
                setDailyTip(loadedProfile.dailyTip ?? null);

                if (loadedProfile.currentPlan) {
                    const parsedPlan = parseTrainingPlan(loadedProfile.currentPlan);
                    if (parsedPlan) {
                        setPlan(parsedPlan);
                    } else {
                        setPlan(null);
                        setError(text.planCorrupted);
                    }
                } else {
                    setPlan(null);
                }
            } catch (loadError) {
                console.error("Dashboard profile load failed:", loadError);
                if (isMounted) {
                    setError(text.loadProfileError);
                }
            } finally {
                if (isMounted) {
                    setLoadingProfile(false);
                }
            }
        };

        loadProfile();

        return () => {
            isMounted = false;
        };
    }, [text.loadProfileError, text.planCorrupted, text.profileMissing, user]);

    useEffect(() => {
        const refreshDailyTip = async () => {
            if (!user || !profile) {
                return;
            }

            const todayKey = getIsoDateKey(new Date());
            if (profile.dailyTip && profile.dailyTipDate === todayKey) {
                setDailyTip(profile.dailyTip);
                return;
            }

            if (tipRefreshDayRef.current === todayKey) {
                return;
            }

            tipRefreshDayRef.current = todayKey;
            setTipLoading(true);

            try {
                const nextTip = await generateDailyExpertTip({
                    goal: profile.goal,
                    experienceLevel: profile.experienceLevel,
                    preferredLanguage: profile.preferredLanguage,
                    injuries: profile.injuries,
                    availableMinutesPerSession: profile.availableMinutesPerSession,
                });

                setDailyTip(nextTip);

                await updateUserProfile(user.uid, {
                    dailyTip: nextTip,
                    dailyTipDate: todayKey,
                });

                setProfile((current) =>
                    current
                        ? {
                              ...current,
                              dailyTip: nextTip,
                              dailyTipDate: todayKey,
                          }
                        : current
                );
            } catch (tipError) {
                console.error("Failed to refresh daily expert tip:", tipError);
            } finally {
                setTipLoading(false);
            }
        };

        refreshDailyTip();
    }, [profile, user]);

    const planAgeDays = getPlanAgeInDays(planGeneratedAt ?? undefined);
    const isPlanStale = planAgeDays !== null && planAgeDays >= 7;

    useEffect(() => {
        const runAutoRefresh = async () => {
            if (!user || !profile || !plan || !autoWeeklyRefresh || !isPlanStale || refreshingWeek || refreshAttemptedRef.current) {
                return;
            }

            refreshAttemptedRef.current = true;
            setRefreshingWeek(true);
            setError(null);

            try {
                const adherence = computeRecentAdherenceScore(parseDailySessionLogs(profile.dailySessionLogs));
                const basePlan = await generateTrainingPlan({
                    ...toAiProfileInput(profile),
                    recentAdherenceScore: adherence.score ?? undefined,
                    recentCompletedSessions: adherence.completedSessions,
                    recentLoggedSessions: adherence.loggedSessions,
                });
                const refreshedPlan = applyAdherenceProgressionToPlan(basePlan, adherence.score, selectedLanguage);
                const generatedAt = new Date().toISOString();

                await updateUserProfile(user.uid, {
                    currentPlan: JSON.stringify(refreshedPlan),
                    currentPlanGeneratedAt: generatedAt,
                    currentPlanAcceptedAt: "",
                    dailyAdjustments: "{}",
                });

                setPlan(refreshedPlan);
                setPlanGeneratedAt(generatedAt);
                setDailyAdjustments({});
                setNotice(text.autoRefreshCompleted);
            } catch (refreshError) {
                console.error("Auto weekly refresh failed:", refreshError);
                setError(text.autoRefreshFailed);
            } finally {
                setRefreshingWeek(false);
            }
        };

        runAutoRefresh();
    }, [autoWeeklyRefresh, isPlanStale, plan, profile, refreshingWeek, selectedLanguage, text.autoRefreshCompleted, text.autoRefreshFailed, user]);

    const weeklyCalendar = useMemo<WeeklyCalendarItem[]>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(today);
            date.setDate(today.getDate() + index);

            const dateKey = getIsoDateKey(date);
            const resolved = resolvePlanEntryForDate({
                targetDate: date,
                todayDate: today,
                planStartDate,
                trainingDaysPerWeek,
                plan,
                dailyAdjustments,
            });

            return {
                key: `${dateKey}-${index}`,
                dateKey,
                weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
                dayNumber: date.getDate(),
                month: date.toLocaleDateString(undefined, { month: "short" }),
                dateLabel: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                focus:
                    resolved.source === "prestart"
                        ? text.planStartsSoon
                        : resolved.planEntry?.focus ?? text.recoveryMobility,
                planEntry: resolved.planEntry,
                isToday: index === 0,
                source: resolved.source,
            };
        });
    }, [dailyAdjustments, plan, planStartDate, text.planStartsSoon, text.recoveryMobility, trainingDaysPerWeek]);

    const selectedDay = weeklyCalendar.find((day) => day.isToday) ?? weeklyCalendar[0] ?? null;
    const previousDay = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const resolved = resolvePlanEntryForDate({
            targetDate: yesterday,
            todayDate: today,
            planStartDate,
            trainingDaysPerWeek,
            plan,
            dailyAdjustments,
        });

        return {
            dateLabel: yesterday.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            focus:
                resolved.source === "prestart"
                    ? text.planStartsSoon
                    : resolved.planEntry?.focus ?? text.recoveryMobility,
            planEntry: resolved.planEntry,
            source: resolved.source,
        };
    }, [dailyAdjustments, plan, planStartDate, text.planStartsSoon, text.recoveryMobility, trainingDaysPerWeek]);

    const previousPrimaryMuscles = useMemo<MuscleGroup[]>(() => {
        if (!previousDay.planEntry) {
            return [];
        }

        const unique = new Set<MuscleGroup>();
        previousDay.planEntry.exercises.forEach((exercise) => {
            const insight = getExerciseInsight(exercise.name, selectedLanguage);
            insight.primaryMuscles.forEach((muscle) => unique.add(muscle));
        });

        return Array.from(unique);
    }, [previousDay.planEntry, selectedLanguage]);

    const focusOverrideOptions = useMemo(() => {
        return FOCUS_OVERRIDE_PRESETS.map((preset) => {
            const overlap = intersectionCount(preset.primaryMuscles, previousPrimaryMuscles);
            const disabled = previousPrimaryMuscles.length > 0 && overlap > 0;
            return {
                ...preset,
                label: isEnglish ? preset.labelEn : preset.labelEs,
                focusLabel: isEnglish ? preset.focusEn : preset.focusEs,
                disabled,
            };
        });
    }, [isEnglish, previousPrimaryMuscles]);
    const hasAvailableFocusOption = focusOverrideOptions.some((option) => !option.disabled);

    useEffect(() => {
        const currentlySelected = focusOverrideOptions.find((option) => option.key === focusOverrideKey);
        if (currentlySelected && !currentlySelected.disabled) {
            return;
        }

        const firstAvailable = focusOverrideOptions.find((option) => !option.disabled);
        if (firstAvailable) {
            setFocusOverrideKey(firstAvailable.key);
        }
    }, [focusOverrideKey, focusOverrideOptions]);
    const replacementOptionsByExercise = useMemo<Record<number, ReturnType<typeof getExerciseAlternatives>>>(() => {
        if (!selectedDay?.planEntry) {
            return {};
        }

        return Object.fromEntries(
            selectedDay.planEntry.exercises.map((exercise, index) => [
                index,
                getExerciseAlternatives(
                    exercise.name,
                    selectedLanguage,
                    profile?.equipment ?? "gym",
                    10
                ),
            ])
        );
    }, [profile?.equipment, selectedDay, selectedLanguage]);
    const searchedExerciseOptions = useMemo(() => {
        const query = exerciseSearchQuery.trim();
        if (!query) {
            return [];
        }

        return searchExercises(query, selectedLanguage, 20)
            .filter((option) => {
                const insight = getExerciseInsight(option.canonicalName, selectedLanguage);
                const matchesPattern = searchPatternFilter === "all" || insight.movementPattern === searchPatternFilter;
                const matchesEquipment = searchEquipmentFilter === "all" || insight.equipment === searchEquipmentFilter;
                const matchesMuscle =
                    searchMuscleFilter === "all" ||
                    insight.primaryMuscles.includes(searchMuscleFilter) ||
                    insight.secondaryMuscles.includes(searchMuscleFilter);
                return matchesPattern && matchesEquipment && matchesMuscle;
            })
            .slice(0, 12);
    }, [exerciseSearchQuery, searchEquipmentFilter, searchMuscleFilter, searchPatternFilter, selectedLanguage]);

    const updateReplacementDraft = (exerciseIndex: number, value: string) => {
        setReplacementDrafts((prev) => ({
            ...prev,
            [exerciseIndex]: value,
        }));
    };

    const renderSessionBlocks = (
        blocks: SessionBlock[] | undefined,
        title: string,
        phase: "warmup" | "cooldown"
    ) => {
        if (!blocks || blocks.length === 0) {
            return null;
        }

        return (
            <section className="rounded-lg border border-border/70 bg-background/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-primary">{title}</h4>
                    <a
                        href={SESSION_PHASE_VIDEO_WHITELIST[phase][selectedLanguage]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary font-semibold"
                    >
                        {text.youtubeGuide}
                        <ExternalLink size={12} />
                    </a>
                </div>
                <div className="space-y-2">
                    {blocks.map((block, blockIndex) => (
                        <article key={`${title}-${block.title}-${blockIndex}`} className="rounded-md border border-border/60 bg-card/40 p-2 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold">{localizeNarrativeText(block.title, selectedLanguage)}</p>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold whitespace-nowrap">
                                    {text.phaseDuration}: {block.durationMinutes} {text.minutes}
                                </span>
                            </div>
                            <p className="text-xs text-foreground/90">{localizeNarrativeText(block.instructions, selectedLanguage)}</p>
                            {block.why && (
                                <p className="text-xs text-primary/90">
                                    <strong>{text.whyExercise}:</strong> {localizeNarrativeText(block.why, selectedLanguage)}
                                </p>
                            )}
                        </article>
                    ))}
                </div>
            </section>
        );
    };

    const saveDailyAdjustment = async (dateKey: string, adjustedDay: TrainingDay) => {
        if (!user) {
            throw new Error("You must be signed in.");
        }

        const nextAdjustments: DailyAdjustments = {
            ...dailyAdjustments,
            [dateKey]: adjustedDay,
        };

        await updateUserProfile(user.uid, {
            dailyAdjustments: stringifyDailyAdjustments(nextAdjustments),
        });

        setDailyAdjustments(nextAdjustments);
    };

    const handleToggleAutoRefresh = async () => {
        if (!user) {
            return;
        }

        const nextValue = !autoWeeklyRefresh;
        setAutoWeeklyRefresh(nextValue);

        try {
            await updateUserProfile(user.uid, { autoWeeklyRefresh: nextValue });
            setNotice(nextValue ? text.autoRefreshEnabled : text.autoRefreshDisabled);
        } catch (toggleError) {
            console.error("Failed to update auto refresh preference:", toggleError);
            setAutoWeeklyRefresh(!nextValue);
            setError(text.updateAutoRefreshError);
        }
    };

    const handleAdjustTodayForPain = async () => {
        if (!selectedDay || !selectedDay.planEntry || !profile) {
            setError(text.selectTrainingDayFirst);
            return;
        }

        setAdjustingDay(true);
        setError(null);

        try {
            const adjustedDay = await adjustDailyWorkoutForPain({
                profile: toAiProfileInput(profile),
                day: selectedDay.planEntry,
                pain: painText,
                painLevel,
                sessionDate: selectedDay.dateKey,
                availableMinutes: availableMinutesToday,
            });

            await saveDailyAdjustment(selectedDay.dateKey, adjustedDay);
            setNotice(`${text.sessionAdjusted} ${selectedDay.dateLabel} ${text.basedOnPain}`);
        } catch (adjustError) {
            console.error("Failed to adjust day for pain:", adjustError);
            setError(text.adjustSessionError);
        } finally {
            setAdjustingDay(false);
        }
    };

    const handleAdjustTodayByTimeOnly = async () => {
        if (!selectedDay || !selectedDay.planEntry) {
            setError(text.selectTrainingDayFirst);
            return;
        }

        setAdjustingByTimeOnly(true);
        setError(null);

        try {
            const trimmed = trimDayToAvailableMinutes(selectedDay.planEntry, availableMinutesToday);
            const updatedDay: TrainingDay = {
                ...trimmed,
                whyThisDay: `${trimmed.whyThisDay ?? ""} ${
                    isEnglish
                        ? `Time-only adjustment applied for ${availableMinutesToday} minutes today.`
                        : `Ajuste solo por tiempo aplicado para ${availableMinutesToday} minutos hoy.`
                }`.trim(),
            };

            await saveDailyAdjustment(selectedDay.dateKey, updatedDay);
            setNotice(`${text.sessionAdjustedByTime} ${selectedDay.dateLabel}.`);
        } catch (adjustError) {
            console.error("Failed to adjust day by time only:", adjustError);
            setError(text.adjustByTimeError);
        } finally {
            setAdjustingByTimeOnly(false);
        }
    };

    const submitExerciseSearch = (rawQuery?: string) => {
        const query = (rawQuery ?? exerciseSearchDraft).trim();
        setExerciseSearchQuery(query);
    };

    const clearExerciseSearch = () => {
        setExerciseSearchDraft("");
        setExerciseSearchQuery("");
    };

    const handleAddExerciseToDay = async () => {
        if (!selectedDay || selectedDay.source === "prestart") {
            setError(text.selectActiveDayFirst);
            return;
        }

        if (!customExerciseDraft.name.trim()) {
            setError(text.exerciseNameRequired);
            return;
        }

        if (!user) {
            setError(text.signedInRequired);
            return;
        }

        setSavingCustomExercise(true);
        setError(null);

        try {
            const baseDay: TrainingDay = selectedDay.planEntry ?? {
                day: selectedDay.weekday,
                focus: text.customSession,
                whyThisDay: text.customSessionWhy,
                exercises: [],
            };

            const updatedDay: TrainingDay = {
                ...baseDay,
                exercises: [
                    ...baseDay.exercises,
                    {
                        name: customExerciseDraft.name.trim(),
                        sets: customExerciseDraft.sets.trim() || "3",
                        reps: customExerciseDraft.reps.trim() || "10-12",
                        rest: customExerciseDraft.rest.trim() || "60-90s",
                        notes: customExerciseDraft.notes.trim() || "",
                        why: customExerciseDraft.why.trim() || text.customDefaultWhy,
                    },
                ],
            };

            await saveDailyAdjustment(selectedDay.dateKey, updatedDay);
            setCustomExerciseDraft(emptyDraft);
            clearExerciseSearch();
            setNotice(`${text.customSessionAdded} ${selectedDay.dateLabel}.`);
        } catch (saveError) {
            console.error("Failed to add custom exercise:", saveError);
            setError(text.saveExerciseError);
        } finally {
            setSavingCustomExercise(false);
        }
    };

    const handleReplaceExercise = async (exerciseIndex: number, directReplacementName?: string) => {
        if (!selectedDay?.planEntry) {
            setError(text.selectTrainingDayFirst);
            return;
        }

        const equivalentOptions = replacementOptionsByExercise[exerciseIndex] ?? [];
        if (equivalentOptions.length === 0) {
            setError(text.noEquivalentFound);
            return;
        }

        const replacementName = (directReplacementName ?? replacementDrafts[exerciseIndex] ?? "").trim();
        if (!replacementName) {
            setError(text.exerciseNameRequired);
            return;
        }

        const matchedEquivalent = resolveEquivalentMatch(replacementName, equivalentOptions);

        if (!matchedEquivalent) {
            setError(text.replacementMustBeEquivalent);
            return;
        }

        setSwappingExerciseIndex(exerciseIndex);
        setError(null);

        try {
            const updatedDay: TrainingDay = {
                ...selectedDay.planEntry,
                exercises: selectedDay.planEntry.exercises.map((exercise, index) => {
                    if (index !== exerciseIndex) {
                        return exercise;
                    }

                    const safeReplacement = matchedEquivalent.name === exercise.name ? exercise.name : matchedEquivalent.name;
                    const replacementNote = isEnglish
                        ? "Adjusted with a 1:1 equivalent due to equipment availability on this date."
                        : "Ajustado con equivalente 1:1 por disponibilidad de equipo en esta fecha.";

                    return {
                        ...exercise,
                        name: safeReplacement,
                        notes: exercise.notes ? `${exercise.notes} ${replacementNote}` : replacementNote,
                    };
                }),
            };

            await saveDailyAdjustment(selectedDay.dateKey, updatedDay);
            setReplacementDrafts((prev) => ({
                ...prev,
                [exerciseIndex]: "",
            }));
            setNotice(`${text.replacedNotice} ${selectedDay.dateLabel}.`);
        } catch (replaceError) {
            console.error("Failed to replace exercise:", replaceError);
            setError(text.replaceExerciseError);
        } finally {
            setSwappingExerciseIndex(null);
        }
    };

    const handleRemoveExercise = async (exerciseIndex: number) => {
        if (!selectedDay?.planEntry) {
            setError(text.selectTrainingDayFirst);
            return;
        }

        if (selectedDay.planEntry.exercises.length <= 1) {
            setError(text.cannotRemoveLast);
            return;
        }

        setRemovingExerciseIndex(exerciseIndex);
        setError(null);

        try {
            const updatedDay: TrainingDay = {
                ...selectedDay.planEntry,
                exercises: selectedDay.planEntry.exercises.filter((_, index) => index !== exerciseIndex),
            };

            await saveDailyAdjustment(selectedDay.dateKey, updatedDay);
            setNotice(`${text.removedNotice} ${selectedDay.dateLabel}.`);
        } catch (removeError) {
            console.error("Failed to remove exercise:", removeError);
            setError(text.removeExerciseError);
        } finally {
            setRemovingExerciseIndex(null);
        }
    };

    const handleOverrideFocusForToday = async () => {
        if (!selectedDay?.planEntry) {
            setError(text.selectTrainingDayFirst);
            return;
        }

        if (!user) {
            setError(text.signedInRequired);
            return;
        }

        const selectedOption = focusOverrideOptions.find((option) => option.key === focusOverrideKey);
        if (!selectedOption) {
            setError(text.focusOverrideError);
            return;
        }

        if (selectedOption.disabled) {
            setError(text.focusOverrideConflict);
            return;
        }

        setApplyingFocusOverride(true);
        setError(null);

        try {
            const targetExerciseCount =
                availableMinutesToday <= 35 ? 4 : availableMinutesToday <= 55 ? 5 : 6;

            const scoredCandidates = exerciseOptions
                .map((option) => {
                    const insight = getExerciseInsight(option.canonicalName, selectedLanguage);
                    const normalizedName = normalizeSearchText(insight.canonicalName);
                    const normalizedDisplay = normalizeSearchText(insight.displayName);
                    const patternMatch = selectedOption.preferredPatterns.includes(insight.movementPattern);
                    const primaryOverlap = intersectionCount(
                        insight.primaryMuscles,
                        selectedOption.primaryMuscles
                    );
                    const secondaryOverlap = intersectionCount(
                        insight.secondaryMuscles,
                        selectedOption.primaryMuscles
                    );
                    const keywordBoost = selectedOption.priorityKeywords.reduce((score, keyword) => {
                        const normalizedKeyword = normalizeSearchText(keyword);
                        if (normalizedName.includes(normalizedKeyword) || normalizedDisplay.includes(normalizedKeyword)) {
                            return score + 2;
                        }
                        return score;
                    }, 0);
                    const isModalityExercise =
                        normalizedName.includes("trx") ||
                        normalizedName.includes("pilates") ||
                        normalizedName.includes("yoga");

                    if (
                        !isExerciseCompatibleWithEquipment(
                            insight.equipment,
                            profile?.equipment ?? "gym"
                        )
                    ) {
                        return null;
                    }

                    if (isWarmupOrCooldownLabel(insight.canonicalName)) {
                        return null;
                    }

                    if (primaryOverlap <= 0 && secondaryOverlap <= 0 && !patternMatch) {
                        return null;
                    }

                    const score =
                        primaryOverlap * 9 +
                        secondaryOverlap * 4 +
                        (patternMatch ? 5 : 0) +
                        keywordBoost +
                        (isModalityExercise ? 2 : 0);

                    return {
                        option,
                        insight,
                        score,
                    };
                })
                .filter(
                    (
                        candidate
                    ): candidate is {
                        option: (typeof exerciseOptions)[number];
                        insight: ReturnType<typeof getExerciseInsight>;
                        score: number;
                    } => candidate !== null
                )
                .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name));

            const uniqueCandidates: typeof scoredCandidates = [];
            const seen = new Set<string>();
            scoredCandidates.forEach((candidate) => {
                const key = normalizeSearchText(candidate.option.canonicalName);
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueCandidates.push(candidate);
                }
            });

            const selectedCandidates = uniqueCandidates.slice(0, targetExerciseCount);
            if (selectedCandidates.length < 3) {
                setError(text.focusOverrideNoCandidates);
                return;
            }

            const updatedExercises: TrainingExercise[] = selectedCandidates.map((candidate) => {
                const prescription = buildExercisePrescription(candidate.insight.movementPattern);
                const rationale = isEnglish
                    ? `${candidate.insight.displayName} fits the ${selectedOption.labelEn.toLowerCase()} focus while preserving weekly split balance.`
                    : `${candidate.insight.displayName} se ajusta al enfoque de ${selectedOption.labelEs.toLowerCase()} manteniendo equilibrio del split semanal.`;

                return {
                    name: candidate.option.name,
                    sets: prescription.sets,
                    reps: prescription.reps,
                    rest: prescription.rest,
                    why: rationale,
                };
            });

            const previousMuscleLabel = previousPrimaryMuscles
                .map((muscle) => getMuscleLabel(muscle, selectedLanguage))
                .join(", ");
            const updatedDay: TrainingDay = {
                ...selectedDay.planEntry,
                focus: selectedOption.focusLabel,
                whyThisDay: isEnglish
                    ? `User override applied to prioritize ${selectedOption.labelEn.toLowerCase()} while avoiding direct overlap with previous-day primary demand${previousMuscleLabel ? ` (${previousMuscleLabel})` : ""}.`
                    : `Se aplico cambio de usuario para priorizar ${selectedOption.labelEs.toLowerCase()} evitando solape directo con la demanda principal del dia previo${previousMuscleLabel ? ` (${previousMuscleLabel})` : ""}.`,
                exercises: updatedExercises,
            };

            await saveDailyAdjustment(selectedDay.dateKey, updatedDay);
            setNotice(`${text.focusOverrideApplied} ${selectedDay.dateLabel}.`);
        } catch (overrideError) {
            console.error("Failed to override focus for day:", overrideError);
            setError(text.focusOverrideError);
        } finally {
            setApplyingFocusOverride(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in-up overflow-x-hidden">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                        {text.welcome}, <span className="text-primary">{profile?.displayName || user?.email?.split("@")[0]}</span>
                    </h1>
                    <p className="text-muted-foreground">{text.subtitle}</p>
                </div>

                <Link
                    href="/dashboard/plan"
                    className="h-11 px-4 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center gap-2 hover:brightness-110 transition-all"
                >
                    <Sparkles size={16} />
                    {text.openPlan}
                </Link>
            </header>

            {notice && (
                <div className="p-4 rounded-lg border border-primary/30 bg-primary/10 text-primary text-sm">
                    {notice}
                </div>
            )}

            {error && (
                <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}

            <section className="rounded-xl border border-primary/30 bg-primary/10 p-4 md:p-5">
                <h2 className="text-sm uppercase tracking-wide font-semibold text-primary mb-1">
                    {text.expertTipTitle}
                </h2>
                <p className="text-xs text-muted-foreground mb-2">{text.expertTipSubtitle}</p>
                {tipLoading && !dailyTip ? (
                    <p className="text-sm inline-flex items-center gap-2 text-primary">
                        <Loader2 size={14} className="animate-spin" />
                        {text.generatingTip}
                    </p>
                ) : (
                    <p className="text-sm text-primary font-medium">{dailyTip ?? text.generatingTip}</p>
                )}
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                <div className="p-5 rounded-xl border border-border bg-card/50 relative overflow-hidden">
                    <div className="hidden sm:block absolute top-2 right-2 opacity-10">
                        <Dumbbell size={56} />
                    </div>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{text.activeDays}</h3>
                    <p className="text-4xl font-bold">{plan?.length ?? 0}</p>
                </div>

                <div className="p-5 rounded-xl border border-border bg-card/50 relative overflow-hidden">
                    <div className="hidden sm:block absolute top-2 right-2 opacity-10">
                        <Calendar size={56} />
                    </div>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{text.planAge}</h3>
                    <p className="text-4xl font-bold text-primary">{planAgeDays ?? 0}<span className="text-lg text-foreground"> d</span></p>
                </div>

                <div className="p-5 rounded-xl border border-border bg-card/50 relative overflow-hidden">
                    <div className="hidden sm:block absolute top-2 right-2 opacity-10">
                        <RefreshCw size={56} />
                    </div>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{text.weeklyRefresh}</h3>
                    <p className={`text-2xl font-bold ${isPlanStale ? "text-amber-300" : "text-primary"}`}>
                        {refreshingWeek ? text.refreshing : isPlanStale ? text.updateNeeded : text.upToDate}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleToggleAutoRefresh}
                    className={`p-5 rounded-xl border text-left transition-colors ${
                        autoWeeklyRefresh
                            ? "border-primary/40 bg-primary/10"
                            : "border-border bg-card/50"
                    }`}
                >
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{text.autoWeekly}</h3>
                    <p className={`text-2xl font-bold ${autoWeeklyRefresh ? "text-primary" : "text-foreground"}`}>
                        {autoWeeklyRefresh ? text.enabled : text.disabled}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">{text.tapToChange}</p>
                </button>
            </section>

            {isPlanStale && (
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm flex flex-wrap items-center gap-2">
                    {text.stalePlanPrefix} {autoWeeklyRefresh ? text.stalePlanAuto : text.stalePlanManual}
                    <Link href="/dashboard/plan" className="underline font-semibold">{text.goToPlan}</Link>
                </div>
            )}

            <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold">{text.weeklyCalendar}</h2>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{text.startDate}: {planStartDate ?? text.notSet}</span>
                        <Link
                            href="/dashboard/plan"
                            className="h-8 px-3 rounded-lg border border-border bg-card/50 text-xs font-semibold hover:bg-card transition-colors inline-flex items-center"
                        >
                            {text.openWeeklyPlanner}
                        </Link>
                    </div>
                </div>

                {loadingProfile ? (
                    <div className="h-40 rounded-xl border border-dashed border-border bg-card/20 flex items-center justify-center text-muted-foreground">
                        <Loader2 className="animate-spin" />
                    </div>
                ) : selectedDay ? (
                    <div className="rounded-2xl border border-border bg-card/50 p-4 md:p-5 space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <h3 className="text-lg font-bold">{text.sessionDetails} - {selectedDay.weekday}, {selectedDay.dateLabel}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {text.focus}: <span className="text-foreground font-medium">{localizeFocusLabel(selectedDay.focus, selectedLanguage)}</span>
                                    {selectedDay.source === "adjusted" && <span className="ml-2 text-primary font-semibold">({text.adjustedTag})</span>}
                                </p>
                            </div>
                            <span className="w-fit text-[11px] px-2 py-1 rounded-full bg-primary/15 text-primary font-semibold">
                                {text.today}
                            </span>
                        </div>

                        {selectedDay.planEntry && (
                            <p className="text-xs text-muted-foreground">
                                {text.estimatedDuration}: ~{estimateTrainingDayDurationMinutes(selectedDay.planEntry)} {text.minutes}
                            </p>
                        )}

                        {selectedDay.source === "prestart" ? (
                            <p className="text-sm text-muted-foreground">{text.preStart}</p>
                        ) : selectedDay.planEntry ? (
                            <>
                                {selectedDay.planEntry.whyThisDay && (
                                    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
                                        <strong>{text.whySession}:</strong> {localizeNarrativeText(selectedDay.planEntry.whyThisDay, selectedLanguage)}
                                    </div>
                                )}

                                <section className="rounded-lg border border-border/70 bg-background/30 p-3 space-y-2">
                                    <p className="text-sm font-bold text-primary">{text.focusOverrideTitle}</p>
                                    <p className="text-xs text-muted-foreground">{text.focusOverrideSubtitle}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {text.previousDayFocus}:{" "}
                                        <span className="text-foreground">
                                            {previousDay.focus} ({previousDay.dateLabel})
                                        </span>
                                    </p>

                                    {hasAvailableFocusOption ? (
                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {text.focusOverrideSelect}
                                                </label>
                                                <select
                                                    value={focusOverrideKey}
                                                    onChange={(event) => setFocusOverrideKey(event.target.value as FocusOverrideKey)}
                                                    className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                                                >
                                                    {focusOverrideOptions.map((option) => (
                                                        <option key={option.key} value={option.key} disabled={option.disabled}>
                                                            {option.label}
                                                            {option.disabled ? ` (${text.blockedByPrevious})` : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleOverrideFocusForToday}
                                                disabled={applyingFocusOverride || focusOverrideOptions.find((option) => option.key === focusOverrideKey)?.disabled}
                                                className="h-10 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                            >
                                                {applyingFocusOverride ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                {text.focusOverrideApply}
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">{text.noFocusOption}</p>
                                    )}
                                </section>

                                {renderSessionBlocks(selectedDay.planEntry.warmup, text.warmupPhase, "warmup")}

                                <div className="grid gap-3">
                                    {selectedDay.planEntry.exercises.map((exercise, index) => {
                                        const insight = getExerciseInsight(exercise.name, selectedLanguage);
                                        const previewKey = `${selectedDay.dateKey}-${index}`;
                                        const isPreviewOpen = !!openPreviewKeys[previewKey];

                                        return (
                                            <article
                                                key={`${selectedDay.dateKey}-${exercise.name}-${index}`}
                                                className="rounded-lg border border-border/70 bg-background/40 p-3 space-y-2"
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                    <div>
                                                        <p className="font-semibold">{insight.displayName}</p>
                                                        {selectedLanguage === "es" && insight.displayName !== insight.canonicalName && (
                                                            <p className="text-[11px] text-muted-foreground">{insight.canonicalName}</p>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {text.sets}: {exercise.sets} - {text.reps}: {exercise.reps} - {text.rest}: {exercise.rest}
                                                    </p>
                                                </div>
                                                <p className="text-xs text-primary/90">
                                                    <strong>{text.load}:</strong> {resolveExerciseLoadDisplay(exercise, selectedLanguage)}
                                                </p>

                                                {exercise.why && (
                                                    <p className="text-xs text-primary/90">
                                                        <strong>{text.whyExercise}:</strong> {localizeNarrativeText(exercise.why, selectedLanguage)}
                                                    </p>
                                                )}

                                                {exercise.notes && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {localizeNarrativeText(exercise.notes, selectedLanguage)}
                                                    </p>
                                                )}

                                                <details
                                                    className="rounded-md border border-border/70 bg-background/30 p-2"
                                                    onToggle={(event) => {
                                                        const isOpen = (event.currentTarget as HTMLDetailsElement).open;
                                                        setOpenPreviewKeys((prev) => (
                                                            prev[previewKey] === isOpen
                                                                ? prev
                                                                : { ...prev, [previewKey]: isOpen }
                                                        ));
                                                    }}
                                                >
                                                    <summary className="cursor-pointer text-xs font-semibold text-primary">
                                                        {text.exercisePreview}
                                                    </summary>
                                                    <div className="pt-2">
                                                        {isPreviewOpen ? (
                                                            <LazyExerciseTechniquePanel
                                                                exerciseName={exercise.name}
                                                                language={selectedLanguage}
                                                                experienceLevel={profile?.experienceLevel ?? "beginner"}
                                                                showVideo
                                                                compact
                                                            />
                                                        ) : (
                                                            <p className="text-[11px] text-muted-foreground">{text.openPreviewHint}</p>
                                                        )}
                                                    </div>
                                                </details>

                                                <div className="rounded-md border border-border/70 bg-background/25 p-2 space-y-2">
                                                    <div className="space-y-1">
                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                            {text.swapTitle}
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {text.swapHint}
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {text.swapFuzzyHint}
                                                        </p>
                                                        {(replacementOptionsByExercise[index]?.length ?? 0) > 0 ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {replacementOptionsByExercise[index]?.slice(0, 4).map((option) => (
                                                                    <button
                                                                        key={`${option.id}-quick-${index}`}
                                                                        type="button"
                                                                        onClick={() => handleReplaceExercise(index, option.name)}
                                                                        disabled={swappingExerciseIndex === index}
                                                                        className="h-8 px-3 rounded-full border border-primary/35 bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/15 disabled:opacity-50"
                                                                    >
                                                                        {option.name}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-[11px] text-muted-foreground">{text.noEquivalentFound}</p>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center pt-1">
                                                        <div className="space-y-1">
                                                        <input
                                                            value={replacementDrafts[index] ?? ""}
                                                            onChange={(event) => updateReplacementDraft(index, event.target.value)}
                                                            placeholder={text.replacePlaceholder}
                                                            list={`exercise-swap-options-${index}`}
                                                            className="h-9 w-full rounded-lg bg-input border border-border px-3 text-xs outline-none focus:ring-2 ring-primary"
                                                        />
                                                        <datalist id={`exercise-swap-options-${index}`}>
                                                            {replacementOptionsByExercise[index]?.map((option) => (
                                                                <option key={`${option.id}-${index}`} value={option.name}>
                                                                    {option.canonicalName}
                                                                </option>
                                                            ))}
                                                        </datalist>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {text.equivalentHint}: {replacementOptionsByExercise[index]?.slice(0, 3).map((option) => option.name).join(" • ") || (isEnglish ? "N/A" : "N/D")}
                                                        </p>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleReplaceExercise(index)}
                                                            disabled={swappingExerciseIndex === index || (replacementOptionsByExercise[index]?.length ?? 0) === 0}
                                                            className="h-9 px-3 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-semibold disabled:opacity-50"
                                                        >
                                                            {swappingExerciseIndex === index ? <Loader2 size={14} className="animate-spin" /> : text.replaceExercise}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveExercise(index)}
                                                            disabled={removingExerciseIndex === index}
                                                            className="h-9 px-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1"
                                                        >
                                                            {removingExerciseIndex === index ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={13} />}
                                                            {text.removeExercise}
                                                        </button>
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>

                                {renderSessionBlocks(selectedDay.planEntry.cooldown, text.cooldownPhase, "cooldown")}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">{text.noWorkout}</p>
                        )}
                    </div>
                ) : (
                    <div className="rounded-xl border border-border bg-card/30 p-4 text-sm text-muted-foreground">
                        {text.noWorkout}
                    </div>
                )}
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                    <h3 className="font-bold text-lg">{text.painCheckin}</h3>
                    <p className="text-sm text-muted-foreground">
                        {text.painDescription}
                    </p>

                    <textarea
                        value={painText}
                        onChange={(event) => setPainText(event.target.value)}
                        placeholder={text.painPlaceholder}
                        className="w-full h-24 rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
                    />

                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">{text.painLevel}: {painLevel}/10</label>
                        <input
                            type="range"
                            min={0}
                            max={10}
                            value={painLevel}
                            onChange={(event) => setPainLevel(Number(event.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">{text.availableTime}</label>
                        <input
                            type="number"
                            min={20}
                            max={240}
                            data-testid="session-available-minutes"
                            value={availableMinutesToday}
                            onChange={(event) => setAvailableMinutesToday(Number(event.target.value))}
                            className="w-full h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">{text.availableTimeHint}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={handleAdjustTodayForPain}
                            disabled={adjustingDay || adjustingByTimeOnly || !selectedDay || selectedDay.source === "prestart" || !selectedDay.planEntry}
                            className="h-11 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
                        >
                            {adjustingDay ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                            {text.adjustToday}
                        </button>
                        <button
                            type="button"
                            onClick={handleAdjustTodayByTimeOnly}
                            disabled={adjustingByTimeOnly || adjustingDay || !selectedDay || selectedDay.source === "prestart" || !selectedDay.planEntry}
                            data-testid="session-adjust-time-only"
                            className="h-11 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/15 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                        >
                            {adjustingByTimeOnly ? <Loader2 className="animate-spin" size={16} /> : <Calendar size={16} />}
                            {text.adjustByTimeOnly}
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                    <h3 className="font-bold text-lg">{text.addExerciseTitle}</h3>
                    <p className="text-sm text-muted-foreground">
                        {text.addExerciseDescription}
                    </p>

                    <div className="rounded-lg border border-border/70 bg-background/30 p-3 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {text.searchLibrary}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{text.searchLibraryHint}</p>
                        <form
                            className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                submitExerciseSearch();
                            }}
                        >
                            <input
                                value={exerciseSearchDraft}
                                onChange={(event) => setExerciseSearchDraft(event.target.value)}
                                placeholder={text.searchPlaceholder}
                                className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            />
                            <button
                                type="submit"
                                className="h-10 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 inline-flex items-center justify-center gap-2"
                            >
                                <Search size={14} />
                                {text.searchAction}
                            </button>
                            <button
                                type="button"
                                onClick={clearExerciseSearch}
                                className="h-10 px-4 rounded-lg border border-border bg-background/60 text-sm font-semibold hover:bg-background"
                            >
                                {text.clearSearch}
                            </button>
                        </form>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <select
                                value={searchPatternFilter}
                                onChange={(event) => setSearchPatternFilter(event.target.value as "all" | MovementPattern)}
                                className="h-9 rounded-lg bg-input border border-border px-3 text-xs outline-none focus:ring-2 ring-primary"
                            >
                                <option value="all">{text.searchPattern}: {isEnglish ? "All" : "Todos"}</option>
                                {catalogFilterOptions.movementPatterns.map((option) => (
                                    <option key={`session-pattern-${option.value}`} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={searchEquipmentFilter}
                                onChange={(event) => setSearchEquipmentFilter(event.target.value as "all" | EquipmentType)}
                                className="h-9 rounded-lg bg-input border border-border px-3 text-xs outline-none focus:ring-2 ring-primary"
                            >
                                <option value="all">{text.searchEquipment}: {isEnglish ? "All" : "Todos"}</option>
                                {catalogFilterOptions.equipmentTypes.map((option) => (
                                    <option key={`session-equipment-${option.value}`} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={searchMuscleFilter}
                                onChange={(event) => setSearchMuscleFilter(event.target.value as "all" | MuscleGroup)}
                                className="h-9 rounded-lg bg-input border border-border px-3 text-xs outline-none focus:ring-2 ring-primary"
                            >
                                <option value="all">{text.searchMuscle}: {isEnglish ? "All" : "Todos"}</option>
                                {catalogFilterOptions.muscles.map((option) => (
                                    <option key={`session-muscle-${option.value}`} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {exerciseSearchQuery.trim().length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {text.suggestedMatches}
                                </p>
                                {searchedExerciseOptions.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {searchedExerciseOptions.map((option) => (
                                            <button
                                                key={`session-search-${option.id}`}
                                                type="button"
                                                onClick={() =>
                                                    setCustomExerciseDraft((prev) => ({
                                                        ...prev,
                                                        name: option.name,
                                                    }))
                                                }
                                                className="h-8 px-3 rounded-full border border-primary/35 bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/15"
                                            >
                                                {option.name}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">{text.noSearchResults}</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            value={customExerciseDraft.name}
                            onChange={(event) => setCustomExerciseDraft((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder={text.exerciseName}
                            list="exercise-database-options-dashboard"
                            className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary md:col-span-2"
                        />
                        <datalist id="exercise-database-options-dashboard">
                            {exerciseOptions.map((exercise) => (
                                <option key={exercise.id} value={exercise.name}>
                                    {exercise.canonicalName}
                                </option>
                            ))}
                        </datalist>

                        <input
                            value={customExerciseDraft.sets}
                            onChange={(event) => setCustomExerciseDraft((prev) => ({ ...prev, sets: event.target.value }))}
                            placeholder={text.sets}
                            className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                        />
                        <input
                            value={customExerciseDraft.reps}
                            onChange={(event) => setCustomExerciseDraft((prev) => ({ ...prev, reps: event.target.value }))}
                            placeholder={text.reps}
                            className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                        />
                        <input
                            value={customExerciseDraft.rest}
                            onChange={(event) => setCustomExerciseDraft((prev) => ({ ...prev, rest: event.target.value }))}
                            placeholder={text.rest}
                            className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                        />
                        <input
                            value={customExerciseDraft.notes}
                            onChange={(event) => setCustomExerciseDraft((prev) => ({ ...prev, notes: event.target.value }))}
                            placeholder={text.coachingNotes}
                            className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                        />
                    </div>

                    <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {text.quickModalityTitle}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{text.quickModalityHint}</p>
                        <div className="flex flex-wrap gap-2">
                            {quickModalityExerciseNames.map((exerciseName) => {
                                const insight = getExerciseInsight(exerciseName, selectedLanguage);
                                return (
                                    <button
                                        key={`quick-modality-${exerciseName}`}
                                        type="button"
                                        onClick={() =>
                                            setCustomExerciseDraft((prev) => ({
                                                ...prev,
                                                name: insight.displayName,
                                            }))
                                        }
                                        className="h-8 px-3 rounded-full border border-primary/35 bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/15"
                                    >
                                        {insight.displayName}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <textarea
                        value={customExerciseDraft.why}
                        onChange={(event) => setCustomExerciseDraft((prev) => ({ ...prev, why: event.target.value }))}
                        placeholder={text.whyPlaceholder}
                        className="w-full h-20 rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
                    />

                    <button
                        type="button"
                        onClick={handleAddExerciseToDay}
                        disabled={savingCustomExercise || !selectedDay || selectedDay.source === "prestart"}
                        className="h-11 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/15 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {savingCustomExercise ? <Loader2 className="animate-spin" size={16} /> : <PlusCircle size={16} />}
                        {text.addCustomExercise}
                    </button>
                </div>
            </section>
        </div>
    );
}
