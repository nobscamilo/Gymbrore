"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getUserProfile, updateUserProfile } from "@/lib/firebase/firestore";
import {
  applyAdherenceProgressionToPlan,
  computeRecentAdherenceScore,
  DailyAdjustments,
  DailySessionLogs,
  estimateTrainingDayDurationMinutes,
  getIsoDateKey,
  getPlanAgeInDays,
  parseDailyAdjustments,
  parseDailySessionLogs,
  parseTrainingPlan,
  resolveExerciseLoadDisplay,
  stringifyDailySessionLogs,
  TrainingDay,
} from "@/lib/trainingPlan";
import { UserProfile } from "@/lib/types";
import { generateDailyExpertTip } from "@/app/actions/generateDailyTip";
import { generateTrainingPlan } from "@/app/actions/generateRoutine";
import { getExerciseInsight } from "@/lib/exerciseCatalog";
import { localizeFocusLabel } from "@/lib/narrativeLocalization";
import { Activity, AlertTriangle, Calendar, CheckCircle2, Dumbbell, Loader2, RefreshCw, Sparkles, Target, TrendingUp } from "lucide-react";

type WeeklyCalendarItem = {
  key: string;
  dateKey: string;
  weekday: string;
  dateLabel: string;
  focus: string;
  planEntry: TrainingDay | null;
  isToday: boolean;
  source: "plan" | "adjusted" | "rest" | "prestart";
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const parseSetCount = (value: string): number => {
  const numbers = value.match(/\d+/g);
  if (!numbers || numbers.length === 0) {
    return 0;
  }

  const first = Number(numbers[0]);
  return Number.isFinite(first) ? clamp(first, 0, 20) : 0;
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

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const { language } = useLanguage();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plan, setPlan] = useState<TrainingDay[] | null>(null);
  const [dailyAdjustments, setDailyAdjustments] = useState<DailyAdjustments>({});
  const [dailySessionLogs, setDailySessionLogs] = useState<DailySessionLogs>({});
  const [planGeneratedAt, setPlanGeneratedAt] = useState<string | null>(null);
  const [planStartDate, setPlanStartDate] = useState<string | null>(null);
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState<number>(3);
  const [autoWeeklyRefresh, setAutoWeeklyRefresh] = useState(true);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [refreshingWeek, setRefreshingWeek] = useState(false);
  const [savingAdherence, setSavingAdherence] = useState(false);
  const [adherenceInput, setAdherenceInput] = useState(100);

  const [dailyTip, setDailyTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);

  const refreshAttemptedRef = useRef(false);
  const tipRefreshDayRef = useRef<string | null>(null);

  const selectedLanguage = language === "en" ? "en" : "es";
  const isEnglish = language === "en";
  const text = isEnglish
    ? {
        welcome: "Welcome",
        subtitle: "Your dashboard now shows only operational essentials: today exercises and adherence.",
        openSession: "Open Session Details",
        openPlan: "Open Full Plan",
        expertTipTitle: "Expert Tip of the Day",
        generatingTip: "Generating your daily tip...",
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
        todaySession: "Today Exercises",
        today: "Today",
        focus: "Focus",
        adjustedTag: "Adjusted for this day",
        estimatedDuration: "Estimated duration",
        minutes: "minutes",
        noWorkout: "No workout assigned. Use this day for recovery, mobility, or light cardio.",
        sets: "Sets",
        reps: "Reps",
        rest: "Rest",
        load: "Load",
        adherenceTitle: "Adherence Tracker",
        adherenceSubtitle: "Log today's adherence so weekly progression can adapt sets, reps, and load.",
        adherenceToday: "Today's adherence",
        saveAdherence: "Save adherence",
        adherenceSaved: "Adherence saved for",
        adherenceSaveError: "Failed to save adherence.",
        signedInRequired: "You must be signed in.",
        loadProfileError: "Failed to load your profile data.",
        profileMissing: "Profile not found. Please complete onboarding again.",
        planCorrupted: "Your stored plan is corrupted. Regenerate it from the Plan section.",
        autoRefreshEnabled: "Weekly auto refresh enabled.",
        autoRefreshDisabled: "Weekly auto refresh disabled.",
        updateAutoRefreshError: "Failed to update weekly auto refresh setting.",
        autoRefreshCompleted: "Your routine was automatically refreshed using adherence-based progression.",
        autoRefreshFailed: "Automatic weekly refresh failed. You can update your plan manually.",
        planStartsSoon: "Plan starts soon",
        recoveryMobility: "Recovery / Mobility",
        adherenceWindow: "21d adherence",
        sessions: "sessions",
        sessionSnapshot: "Session Snapshot",
        sessionSnapshotSubtitle: "Today's actionable workload and muscle emphasis.",
        exercisesToday: "Exercises Today",
        totalSetsToday: "Total Sets Today",
        primaryMuscles: "Primary Muscles",
        weeklyMap: "7-Day Flow",
        adherenceTrendTitle: "Adherence Trend (14d)",
        adherenceTrendSubtitle: "Recent consistency. Bars with no value mean no log was recorded.",
        adherenceAverage: "Average",
        noTrendData: "No adherence logs yet.",
      }
    : {
        welcome: "Bienvenido",
        subtitle: "El dashboard ahora muestra solo lo operativo: ejercicios de hoy y adherencia.",
        openSession: "Abrir Sesion Detallada",
        openPlan: "Abrir Plan Completo",
        expertTipTitle: "Tip del Experto del Dia",
        generatingTip: "Generando tip diario...",
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
        todaySession: "Ejercicios de Hoy",
        today: "Hoy",
        focus: "Enfoque",
        adjustedTag: "Ajustada para este dia",
        estimatedDuration: "Duracion estimada",
        minutes: "minutos",
        noWorkout: "No hay entrenamiento asignado. Usa este dia para recuperacion, movilidad o cardio suave.",
        sets: "Series",
        reps: "Repeticiones",
        rest: "Descanso",
        load: "Carga",
        adherenceTitle: "Registro de Adherencia",
        adherenceSubtitle: "Guarda la adherencia de hoy para que la progresion semanal ajuste series, repeticiones y carga.",
        adherenceToday: "Adherencia de hoy",
        saveAdherence: "Guardar adherencia",
        adherenceSaved: "Adherencia guardada para",
        adherenceSaveError: "No se pudo guardar la adherencia.",
        signedInRequired: "Debes iniciar sesion.",
        loadProfileError: "No se pudo cargar tu perfil.",
        profileMissing: "Perfil no encontrado. Completa onboarding nuevamente.",
        planCorrupted: "El plan guardado esta corrupto. Regeneralo desde la seccion Plan.",
        autoRefreshEnabled: "Actualizacion semanal automatica activada.",
        autoRefreshDisabled: "Actualizacion semanal automatica desactivada.",
        updateAutoRefreshError: "No se pudo actualizar la preferencia de auto refresh.",
        autoRefreshCompleted: "Tu rutina se actualizo automaticamente con progresion basada en adherencia.",
        autoRefreshFailed: "Fallo la actualizacion automatica semanal. Puedes actualizar manualmente.",
        planStartsSoon: "El plan inicia pronto",
        recoveryMobility: "Recuperacion / Movilidad",
        adherenceWindow: "Adherencia 21d",
        sessions: "sesiones",
        sessionSnapshot: "Resumen de Sesion",
        sessionSnapshotSubtitle: "Carga accionable de hoy y enfasis muscular.",
        exercisesToday: "Ejercicios de Hoy",
        totalSetsToday: "Series Totales Hoy",
        primaryMuscles: "Musculos Primarios",
        weeklyMap: "Flujo de 7 Dias",
        adherenceTrendTitle: "Tendencia de Adherencia (14d)",
        adherenceTrendSubtitle: "Consistencia reciente. Barras vacias indican dias sin registro.",
        adherenceAverage: "Promedio",
        noTrendData: "Aun no hay registros de adherencia.",
      };

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
        setDailySessionLogs(parseDailySessionLogs(loadedProfile.dailySessionLogs));
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
        const adherence = computeRecentAdherenceScore(dailySessionLogs);
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
  }, [
    autoWeeklyRefresh,
    dailySessionLogs,
    isPlanStale,
    plan,
    profile,
    refreshingWeek,
    selectedLanguage,
    text.autoRefreshCompleted,
    text.autoRefreshFailed,
    user,
  ]);

  const weeklyCalendar = useMemo<WeeklyCalendarItem[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = parseDateOnly(planStartDate) ?? today;
    const workoutTargets = Math.min(Math.max(trainingDaysPerWeek ?? plan?.length ?? 0, 0), 7);
    const workoutSlots = buildWorkoutSlots(workoutTargets);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);

      const dateKey = getIsoDateKey(date);
      const isToday = index === 0;
      const daysSinceStart = Math.floor((date.getTime() - startDate.getTime()) / DAY_MS);

      if (daysSinceStart < 0) {
        return {
          key: `${dateKey}-${index}`,
          dateKey,
          weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
          dateLabel: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          focus: text.planStartsSoon,
          planEntry: null,
          isToday,
          source: "prestart",
        };
      }

      const weekCycleDay = daysSinceStart % 7;
      const shouldTrain = workoutSlots.includes(weekCycleDay) && !!plan && plan.length > 0;
      const adjustedEntry = dailyAdjustments[dateKey];

      let planEntry: TrainingDay | null = null;
      let source: WeeklyCalendarItem["source"] = "rest";

      if (adjustedEntry) {
        planEntry = adjustedEntry;
        source = "adjusted";
      } else if (shouldTrain && plan && plan.length > 0) {
        const weeksCompleted = Math.floor(daysSinceStart / 7);
        const sessionsThisWeek = workoutSlots.filter((slot) => slot <= weekCycleDay).length;
        const sessionSequence = weeksCompleted * workoutTargets + sessionsThisWeek - 1;
        const safeIndex = ((sessionSequence % plan.length) + plan.length) % plan.length;
        planEntry = plan[safeIndex];
        source = "plan";
      }

      return {
        key: `${dateKey}-${index}`,
        dateKey,
        weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
        dateLabel: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        focus: planEntry?.focus ?? text.recoveryMobility,
        planEntry,
        isToday,
        source,
      };
    });
  }, [dailyAdjustments, plan, planStartDate, text.planStartsSoon, text.recoveryMobility, trainingDaysPerWeek]);

  const selectedDay = weeklyCalendar.find((day) => day.isToday) ?? weeklyCalendar[0] ?? null;
  const todaySession = selectedDay?.planEntry ?? null;
  const todayLog = selectedDay ? dailySessionLogs[selectedDay.dateKey] : undefined;

  useEffect(() => {
    if (todayLog) {
      setAdherenceInput(clamp(Math.round(todayLog.adherencePct), 0, 100));
      return;
    }

    if (todaySession) {
      setAdherenceInput(100);
      return;
    }

    setAdherenceInput(0);
  }, [todayLog, todaySession]);

  const adherenceSummary = useMemo(() => {
    return computeRecentAdherenceScore(dailySessionLogs);
  }, [dailySessionLogs]);

  const todaySessionMetrics = useMemo(() => {
    if (!todaySession) {
      return {
        exerciseCount: 0,
        totalSets: 0,
        primaryMuscles: [] as string[],
      };
    }

    let totalSets = 0;
    const muscleCounts = new Map<string, number>();

    todaySession.exercises.forEach((exercise) => {
      totalSets += parseSetCount(exercise.sets);
      const insight = getExerciseInsight(exercise.name, selectedLanguage);
      insight.primaryMuscleLabels.forEach((label) => {
        muscleCounts.set(label, (muscleCounts.get(label) ?? 0) + 1);
      });
    });

    const primaryMuscles = Array.from(muscleCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([label]) => label);

    return {
      exerciseCount: todaySession.exercises.length,
      totalSets,
      primaryMuscles,
    };
  }, [selectedLanguage, todaySession]);

  const adherenceTrend = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (13 - index));
      const dateKey = getIsoDateKey(date);
      const adherence = dailySessionLogs[dateKey]?.adherencePct;

      return {
        key: dateKey,
        dayLabel: date.toLocaleDateString(undefined, { weekday: "narrow" }),
        value: typeof adherence === "number" ? clamp(Math.round(adherence), 0, 100) : null,
      };
    });
  }, [dailySessionLogs]);

  const adherenceTrendAverage = useMemo(() => {
    const values = adherenceTrend
      .map((item) => item.value)
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) {
      return null;
    }

    return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
  }, [adherenceTrend]);

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

  const handleSaveAdherence = async () => {
    if (!user || !selectedDay || !todaySession) {
      setError(text.signedInRequired);
      return;
    }

    const plannedExercises = todaySession.exercises.length;
    const safePct = clamp(Number(adherenceInput), 0, 100);
    const completedExercises = Math.round((safePct / 100) * plannedExercises);

    const entry = {
      dateKey: selectedDay.dateKey,
      adherencePct: safePct,
      plannedExercises,
      completedExercises,
      completed: safePct >= 70,
      recordedAt: new Date().toISOString(),
    };

    const nextLogs: DailySessionLogs = {
      ...dailySessionLogs,
      [selectedDay.dateKey]: entry,
    };

    setSavingAdherence(true);
    setError(null);

    try {
      await updateUserProfile(user.uid, {
        dailySessionLogs: stringifyDailySessionLogs(nextLogs),
      });
      setDailySessionLogs(nextLogs);
      setNotice(`${text.adherenceSaved} ${selectedDay.dateLabel}.`);
    } catch (saveError) {
      console.error("Failed to save adherence:", saveError);
      setError(text.adherenceSaveError);
    } finally {
      setSavingAdherence(false);
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

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/session"
            className="h-11 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary font-semibold flex items-center gap-2 hover:bg-primary/15 transition-colors"
          >
            <Target size={16} />
            {text.openSession}
          </Link>
          <Link
            href="/dashboard/plan"
            className="h-11 px-4 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center gap-2 hover:brightness-110 transition-all"
          >
            <Sparkles size={16} />
            {text.openPlan}
          </Link>
        </div>
      </header>

      {notice && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/10 text-primary text-sm">{notice}</div>
      )}

      {error && (
        <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <section className="rounded-xl border border-primary/30 bg-primary/10 p-4 md:p-5">
        <h2 className="text-sm uppercase tracking-wide font-semibold text-primary mb-1">{text.expertTipTitle}</h2>
        {tipLoading && !dailyTip ? (
          <p className="text-sm inline-flex items-center gap-2 text-primary">
            <Loader2 size={14} className="animate-spin" />
            {text.generatingTip}
          </p>
        ) : (
          <p className="text-sm text-primary font-medium">{dailyTip ?? text.generatingTip}</p>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
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
          <p className="text-4xl font-bold text-primary">
            {planAgeDays ?? 0}
            <span className="text-lg text-foreground"> d</span>
          </p>
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
            autoWeeklyRefresh ? "border-primary/40 bg-primary/10" : "border-border bg-card/50"
          }`}
        >
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{text.autoWeekly}</h3>
          <p className={`text-2xl font-bold ${autoWeeklyRefresh ? "text-primary" : "text-foreground"}`}>
            {autoWeeklyRefresh ? text.enabled : text.disabled}
          </p>
          <p className="text-xs text-muted-foreground mt-2">{text.tapToChange}</p>
        </button>

        <div className="p-5 rounded-xl border border-border bg-card/50 relative overflow-hidden">
          <div className="hidden sm:block absolute top-2 right-2 opacity-10">
            <CheckCircle2 size={56} />
          </div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{text.adherenceWindow}</h3>
          <p className="text-3xl font-bold text-primary">
            {adherenceSummary.score ?? 0}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {adherenceSummary.completedSessions}/{adherenceSummary.loggedSessions} {text.sessions}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-5">
        <article className="rounded-2xl border border-border bg-card/50 p-4 md:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{text.sessionSnapshot}</h2>
              <p className="text-xs text-muted-foreground">{text.sessionSnapshotSubtitle}</p>
            </div>
            <span className="h-9 w-9 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
              <Activity size={18} />
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/70 bg-background/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{text.exercisesToday}</p>
              <p className="text-2xl font-bold text-primary">{todaySessionMetrics.exerciseCount}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{text.totalSetsToday}</p>
              <p className="text-2xl font-bold text-primary">{todaySessionMetrics.totalSets}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{text.primaryMuscles}</p>
              <p className="text-sm font-semibold mt-1 text-primary">
                {todaySessionMetrics.primaryMuscles.length > 0
                  ? todaySessionMetrics.primaryMuscles.slice(0, 2).join(" • ")
                  : "—"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{text.weeklyMap}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {weeklyCalendar.map((day) => (
                <div
                  key={`weekly-map-${day.key}`}
                  className={`rounded-lg border p-2 transition-all hover:-translate-y-0.5 ${
                    day.isToday
                      ? "border-primary/45 bg-primary/10"
                      : day.source === "rest" || day.source === "prestart"
                        ? "border-border/70 bg-background/40"
                        : "border-border/80 bg-card/55"
                  }`}
                >
                  <p className="text-[11px] font-semibold">{day.weekday}</p>
                  <p className="text-[10px] text-muted-foreground">{day.dateLabel}</p>
                  <p className="text-[10px] mt-1 truncate text-primary/90">
                    {day.planEntry ? localizeFocusLabel(day.focus, selectedLanguage) : text.recoveryMobility}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-card/50 p-4 md:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{text.adherenceTrendTitle}</h2>
              <p className="text-xs text-muted-foreground">{text.adherenceTrendSubtitle}</p>
            </div>
            <span className="h-9 w-9 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
              <TrendingUp size={18} />
            </span>
          </div>

          <div className="h-28 rounded-xl border border-border/70 bg-background/35 p-3">
            <div className="h-full grid grid-cols-14 gap-1 items-end">
              {adherenceTrend.map((item, index) => {
                const value = item.value;
                const barHeight = value === null ? 6 : Math.max(10, value);
                const barClass =
                  value === null
                    ? "bg-border/50"
                    : value >= 85
                      ? "bg-emerald-400/80"
                      : value >= 70
                        ? "bg-primary/80"
                        : "bg-amber-400/80";

                return (
                  <div key={`adherence-bar-${item.key}-${index}`} className="h-full flex flex-col justify-end items-center gap-1">
                    <div
                      className={`w-full rounded-sm transition-all duration-500 ${barClass}`}
                      style={{ height: `${barHeight}%` }}
                      title={value === null ? `${item.key}: N/A` : `${item.key}: ${value}%`}
                    />
                    <span className="text-[9px] text-muted-foreground leading-none">{item.dayLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-primary font-semibold">
            {text.adherenceAverage}: {adherenceTrendAverage !== null ? `${adherenceTrendAverage}%` : text.noTrendData}
          </p>
        </article>
      </section>

      {isPlanStale && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm flex flex-wrap items-center gap-2">
          {text.stalePlanPrefix} {autoWeeklyRefresh ? text.stalePlanAuto : text.stalePlanManual}
          <Link href="/dashboard/plan" className="underline font-semibold">
            {text.goToPlan}
          </Link>
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
        <div className="rounded-2xl border border-border bg-card/50 p-4 md:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold">{text.todaySession}</h2>
            <span className="text-xs px-2 py-1 rounded-full bg-primary/15 text-primary font-semibold">{text.today}</span>
          </div>

          {loadingProfile ? (
            <div className="h-28 rounded-xl border border-dashed border-border bg-card/20 flex items-center justify-center text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : selectedDay?.source === "prestart" ? (
            <p className="text-sm text-muted-foreground">{text.planStartsSoon}</p>
          ) : todaySession ? (
            <>
              <p className="text-sm text-muted-foreground">
                {text.focus}: <span className="text-foreground font-medium">{localizeFocusLabel(selectedDay.focus, selectedLanguage)}</span>
                {selectedDay.source === "adjusted" && <span className="ml-2 text-primary font-semibold">({text.adjustedTag})</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {text.estimatedDuration}: ~{estimateTrainingDayDurationMinutes(todaySession)} {text.minutes}
              </p>

              <div className="grid gap-2">
                {todaySession.exercises.map((exercise, index) => {
                  const insight = getExerciseInsight(exercise.name, selectedLanguage);
                  return (
                    <article
                      key={`${selectedDay.dateKey}-${exercise.name}-${index}`}
                      className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <p className="font-semibold text-sm">{insight.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {text.sets}: {exercise.sets} - {text.reps}: {exercise.reps} - {text.rest}: {exercise.rest}
                        </p>
                      </div>
                      <p className="text-[11px] text-primary/90 mt-1">
                        <strong>{text.load}:</strong> {resolveExerciseLoadDisplay(exercise, selectedLanguage)}
                      </p>
                    </article>
                  );
                })}
              </div>

              <Link
                href="/dashboard/session"
                className="h-10 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/15 transition-colors inline-flex items-center w-fit"
              >
                {text.openSession}
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{text.noWorkout}</p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card/50 p-4 md:p-5 space-y-4">
          <h2 className="text-lg font-bold">{text.adherenceTitle}</h2>
          <p className="text-sm text-muted-foreground">{text.adherenceSubtitle}</p>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              {text.adherenceToday}: {adherenceInput}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={adherenceInput}
              onChange={(event) => setAdherenceInput(Number(event.target.value))}
              className="w-full"
              disabled={!todaySession}
            />
          </div>

          <button
            type="button"
            onClick={handleSaveAdherence}
            disabled={!todaySession || savingAdherence}
            className="h-11 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all disabled:opacity-50 inline-flex items-center gap-2"
          >
            {savingAdherence ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            {text.saveAdherence}
          </button>
        </div>
      </section>
    </div>
  );
}
