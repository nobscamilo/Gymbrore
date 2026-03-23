"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getUserProfile, updateUserProfile } from "@/lib/firebase/firestore";
import { generateTrainingPlan } from "@/app/actions/generateRoutine";
import { EquipmentType, getCatalogFilterOptions, getExerciseInsight, MovementPattern, MuscleGroup } from "@/lib/exerciseCatalog";
import {
    applyAdherenceProgressionToPlan,
    computeRecentAdherenceScore,
    estimateTrainingDayDurationMinutes,
    getPlanAgeInDays,
    parseDailySessionLogs,
    parseTrainingPlan,
    resolveExerciseLoadDisplay,
    SessionBlock,
    TrainingDay,
    TrainingExercise,
} from "@/lib/trainingPlan";
import { getExerciseAlternatives, getExerciseDatabase, searchExercises } from "@/lib/exerciseDatabase";
import { localizeDayLabel, localizeFocusLabel, localizeNarrativeText } from "@/lib/narrativeLocalization";
import { UserProfile } from "@/lib/types";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    PlusCircle,
    Search,
    Sparkles,
} from "lucide-react";

const LazyExerciseTechniquePanel = dynamic(() => import("@/components/ExerciseTechniquePanel"), {
    ssr: false,
    loading: () => (
        <div className="h-20 rounded-md border border-border/60 bg-background/40 animate-pulse" />
    ),
});

type CustomExerciseDraft = {
    name: string;
    sets: string;
    reps: string;
    rest: string;
    notes: string;
    why: string;
};

const defaultDraft: CustomExerciseDraft = {
    name: "",
    sets: "3",
    reps: "10-12",
    rest: "60-90s",
    notes: "",
    why: "",
};

type RegenerationDraft = {
    age: number;
    weight: number;
    height: number;
    goal: UserProfile["goal"];
    equipment: UserProfile["equipment"];
    experienceLevel: UserProfile["experienceLevel"];
    injuries: string;
    trainingDays: number;
    availableMinutesPerSession: number;
    planStartDate: string;
};

const toRegenerationDraft = (profile: UserProfile): RegenerationDraft => {
    return {
        age: profile.age ?? 30,
        weight: profile.weight ?? 70,
        height: profile.height ?? 170,
        goal: profile.goal,
        equipment: profile.equipment,
        experienceLevel: profile.experienceLevel,
        injuries: profile.injuries ?? "",
        trainingDays: profile.trainingDays ?? 3,
        availableMinutesPerSession: profile.availableMinutesPerSession ?? 60,
        planStartDate: profile.planStartDate ?? new Date().toISOString().slice(0, 10),
    };
};

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return fallback;
};

const normalizeReplacementInput = (value: string): string => {
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

export default function TrainingPlanPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { language } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [savingCustomExercise, setSavingCustomExercise] = useState<number | null>(null);

    const [profileSnapshot, setProfileSnapshot] = useState<UserProfile | null>(null);
    const [plan, setPlan] = useState<TrainingDay[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [planGeneratedAt, setPlanGeneratedAt] = useState<string | null>(null);
    const [planAcceptedAt, setPlanAcceptedAt] = useState<string | null>(null);
    const [viewerExperienceLevel, setViewerExperienceLevel] = useState<"beginner" | "intermediate" | "advanced" | "expert">("beginner");
    const [equipmentAccess, setEquipmentAccess] = useState<"gym" | "dumbbells" | "bodyweight">("gym");
    const [selectedPlanDayIndex, setSelectedPlanDayIndex] = useState(0);
    const [showDetailedRationale, setShowDetailedRationale] = useState(false);

    const [customExerciseDrafts, setCustomExerciseDrafts] = useState<Record<number, CustomExerciseDraft>>({});
    const [exerciseSearchDrafts, setExerciseSearchDrafts] = useState<Record<number, string>>({});
    const [exerciseSearchQueries, setExerciseSearchQueries] = useState<Record<number, string>>({});
    const [replacementDrafts, setReplacementDrafts] = useState<Record<string, string>>({});
    const [searchPatternFilter, setSearchPatternFilter] = useState<"all" | MovementPattern>("all");
    const [searchEquipmentFilter, setSearchEquipmentFilter] = useState<"all" | EquipmentType>("all");
    const [searchMuscleFilter, setSearchMuscleFilter] = useState<"all" | MuscleGroup>("all");
    const [showRegenerationForm, setShowRegenerationForm] = useState(false);
    const [regenerationDraft, setRegenerationDraft] = useState<RegenerationDraft | null>(null);
    const [swappingExerciseKey, setSwappingExerciseKey] = useState<string | null>(null);
    const [openPreviewKeys, setOpenPreviewKeys] = useState<Record<string, boolean>>({});
    const selectedLanguage = language === "en" ? "en" : "es";
    const exerciseOptions = useMemo(() => getExerciseDatabase(selectedLanguage), [selectedLanguage]);
    const catalogFilterOptions = useMemo(() => getCatalogFilterOptions(selectedLanguage), [selectedLanguage]);
    const isEnglish = language === "en";
    const text = isEnglish
        ? {
            title: "Your AI Training Plan",
            subtitle: "Sports medicine-guided programming with rationale for every prescription.",
            back: "Back",
            generate: "Generate Plan",
            regenerate: "Regenerate Plan",
            updateWeekly: "Update Weekly Plan",
            updateInputs: "Reconfigure Inputs",
            updateInputsHint: "Before regenerating, update weight, time, training days, and key profile variables.",
            applyAndGenerate: "Apply Changes + Regenerate",
            cancel: "Cancel",
            confirmContinue: "Confirm & Continue",
            continue: "Continue",
            stale: "Your routine is",
            daysOld: "days old. Update it weekly for better progression.",
            noPlan: "No Plan Active",
            noPlanDescription: "Click generate to create a clinical, goal-specific plan with rationale for each exercise.",
            createPlan: "Create My Plan",
            whyDay: "Why this day",
            whyExercise: "Why this exercise",
            planDays: "Plan Days",
            planDaysHint: "Pick a day to inspect details and edit exercises.",
            compactMode: "Compact View",
            detailedMode: "Detailed View",
            densityHintCompact: "Less text, faster reading.",
            densityHintDetailed: "Includes full clinical rationale.",
            warmupPhase: "Warm-up / Mobility",
            cooldownPhase: "Cooldown / Stretching",
            phaseDuration: "Duration",
            localVideo: "Local Video",
            reference: "Technique Reference",
            exercisePreview: "Technique + Muscle Map",
            openPreviewHint: "Open this section to load technique guidance and the anatomy map.",
            addCustom: "Add Custom Exercise to",
            searchLibrary: "Search the exercise library",
            searchLibraryHint: "Use a real search before typing free text. Queries like core, trx, pilates, yoga, mobility, or glutes now work.",
            searchPlaceholder: "Example: core, trx, pilates, yoga",
            searchAction: "Search",
            clearSearch: "Clear",
            quickSearch: "Quick filters",
            suggestedMatches: "Suggested matches",
            useExercise: "Use this exercise",
            noSearchResults: "No library matches were found for that search. Refine the term instead of adding an arbitrary name.",
            swapTitle: "1:1 Equipment Substitute",
            swapHint: "Tap one suggestion or type another equivalent option if the station is busy or unavailable.",
            swapFuzzyHint: "You do not need the exact full name; partial terms will auto-match the best 1:1 option.",
            exerciseName: "Exercise name",
            sets: "Sets",
            reps: "Reps",
            rest: "Rest",
            load: "Load",
            searchPattern: "Pattern",
            searchEquipment: "Equipment",
            searchMuscle: "Muscle",
            age: "Age",
            weight: "Weight (kg)",
            height: "Height (cm)",
            goal: "Goal",
            equipmentField: "Equipment Access",
            level: "Experience Level",
            injuriesField: "Injuries / Limits",
            trainingDaysField: "Training Days / Week",
            sessionMinutesField: "Available Minutes / Session",
            startDateField: "Plan Start Date",
            replaceExercise: "Replace",
            replacePlaceholder: "Alternative exercise name",
            equivalentHint: "Equivalent 1:1 options",
            replacementMustBeEquivalent: "Choose one of the equivalent 1:1 suggestions for safe replacement.",
            noEquivalentFound: "No safe 1:1 equivalent was found for this exercise with your available equipment.",
            replaceExerciseError: "Failed to replace exercise.",
            replacedNotice: "Exercise replaced in",
            exerciseNameRequired: "Exercise name is required.",
            notes: "Notes",
            whyPlaceholder: "Explain why this exercise should be added",
            addExercise: "Add Exercise",
            corruptedPlan: "Your saved plan is corrupted. Regenerate it to continue.",
            loadPlanError: "We couldn't load your saved plan. You can generate a new one.",
            signInRequired: "You must be signed in to generate a plan.",
            profileMissing: "Profile not found. Complete onboarding first.",
            generatedNotice: "Plan generated. Review it and press Confirm & Continue.",
            confirmedNotice: "Plan confirmed.",
            confirmedAt: "Confirmed at",
            addExerciseNotice: "Custom exercise added to",
            saveExerciseError: "Failed to save custom exercise.",
            genericError: "Failed to generate plan",
        }
        : {
            title: "Tu Plan de Entrenamiento IA",
            subtitle: "Programacion guiada por medicina deportiva con razon clinica en cada ejercicio.",
            back: "Atras",
            generate: "Generar Plan",
            regenerate: "Regenerar Plan",
            updateWeekly: "Actualizar Plan Semanal",
            updateInputs: "Reconfigurar Variables",
            updateInputsHint: "Antes de regenerar, actualiza peso, tiempo, dias de entrenamiento y variables clave del perfil.",
            applyAndGenerate: "Aplicar Cambios + Regenerar",
            cancel: "Cancelar",
            confirmContinue: "Confirmar y Continuar",
            continue: "Continuar",
            stale: "Tu rutina tiene",
            daysOld: "dias. Actualizala semanalmente para mejorar progreso.",
            noPlan: "No hay plan activo",
            noPlanDescription: "Pulsa generar para crear un plan clinico con razon en cada prescripcion.",
            createPlan: "Crear Mi Plan",
            whyDay: "Por que este dia",
            whyExercise: "Por que este ejercicio",
            planDays: "Dias del Plan",
            planDaysHint: "Selecciona un dia para revisar detalles y editar ejercicios.",
            compactMode: "Vista Compacta",
            detailedMode: "Vista Detallada",
            densityHintCompact: "Menos texto, lectura mas rapida.",
            densityHintDetailed: "Incluye razon clinica completa.",
            warmupPhase: "Calentamiento / Movilidad",
            cooldownPhase: "Enfriamiento / Estiramiento",
            phaseDuration: "Duracion",
            localVideo: "Video Local",
            reference: "Referencia Tecnica",
            exercisePreview: "Tecnica + Mapa Muscular",
            openPreviewHint: "Abre esta seccion para cargar la guia tecnica y el mapa anatomico.",
            addCustom: "Agregar ejercicio a",
            searchLibrary: "Buscar en la libreria de ejercicios",
            searchLibraryHint: "Usa una busqueda real antes de escribir texto libre. Consultas como core, trx, pilates, yoga, movilidad o gluteos ya funcionan.",
            searchPlaceholder: "Ejemplo: core, trx, pilates, yoga",
            searchAction: "Buscar",
            clearSearch: "Limpiar",
            quickSearch: "Filtros rapidos",
            suggestedMatches: "Coincidencias sugeridas",
            useExercise: "Usar este ejercicio",
            noSearchResults: "No se encontraron coincidencias en la libreria para esa busqueda. Ajusta el termino antes de agregar un nombre arbitrario.",
            swapTitle: "Sustituto 1:1 por Equipo",
            swapHint: "Pulsa una sugerencia o escribe otro equivalente si la maquina o estacion no esta disponible.",
            swapFuzzyHint: "No necesitas escribir el nombre exacto completo; un termino parcial intentara coincidir con la mejor opcion 1:1.",
            exerciseName: "Nombre del ejercicio",
            sets: "Series",
            reps: "Repeticiones",
            rest: "Descanso",
            load: "Carga",
            searchPattern: "Patron",
            searchEquipment: "Equipo",
            searchMuscle: "Musculo",
            age: "Edad",
            weight: "Peso (kg)",
            height: "Talla (cm)",
            goal: "Objetivo",
            equipmentField: "Acceso a Equipo",
            level: "Nivel de Experiencia",
            injuriesField: "Lesiones / Limitaciones",
            trainingDaysField: "Dias de Entrenamiento / Semana",
            sessionMinutesField: "Minutos Disponibles / Sesion",
            startDateField: "Fecha de Inicio del Plan",
            replaceExercise: "Cambiar",
            replacePlaceholder: "Nombre de ejercicio alternativo",
            equivalentHint: "Opciones equivalentes 1:1",
            replacementMustBeEquivalent: "Elige una de las sugerencias equivalentes 1:1 para un cambio seguro.",
            noEquivalentFound: "No se encontro un equivalente 1:1 seguro con tu equipamiento disponible.",
            replaceExerciseError: "No se pudo cambiar el ejercicio.",
            replacedNotice: "Ejercicio reemplazado en",
            exerciseNameRequired: "El nombre del ejercicio es obligatorio.",
            notes: "Notas",
            whyPlaceholder: "Explica por que agregar este ejercicio",
            addExercise: "Agregar Ejercicio",
            corruptedPlan: "Tu plan guardado esta corrupto. Regeneralo para continuar.",
            loadPlanError: "No pudimos cargar tu plan guardado. Puedes generar uno nuevo.",
            signInRequired: "Debes iniciar sesion para generar un plan.",
            profileMissing: "Perfil no encontrado. Completa onboarding primero.",
            generatedNotice: "Plan generado. Revisalo y presiona Confirmar y Continuar.",
            confirmedNotice: "Plan confirmado.",
            confirmedAt: "Confirmado en",
            addExerciseNotice: "Ejercicio agregado a",
            saveExerciseError: "No se pudo guardar el ejercicio.",
            genericError: "No se pudo generar el plan",
        };
    const quickSearchTerms = isEnglish
        ? ["core", "trx", "pilates", "yoga", "mobility", "glutes"]
        : ["core", "trx", "pilates", "yoga", "movilidad", "gluteos"];

    useEffect(() => {
        let isMounted = true;

        const loadPlan = async () => {
            if (!user) {
                if (isMounted) {
                    setLoading(false);
                }
                return;
            }

            try {
                const profile = await getUserProfile(user.uid);
                if (profile?.currentPlan) {
                    const savedPlan = parseTrainingPlan(profile.currentPlan);
                    if (savedPlan) {
                        setPlan(savedPlan);
                    } else {
                        setError(text.corruptedPlan);
                    }
                }

                setPlanGeneratedAt(profile?.currentPlanGeneratedAt ?? null);
                setViewerExperienceLevel(profile?.experienceLevel ?? "beginner");
                setEquipmentAccess(profile?.equipment ?? "gym");
                if (profile) {
                    setProfileSnapshot(profile);
                    setRegenerationDraft(toRegenerationDraft(profile));
                }
                if (profile?.currentPlanAcceptedAt && profile.currentPlanAcceptedAt.trim().length > 0) {
                    setPlanAcceptedAt(profile.currentPlanAcceptedAt);
                } else {
                    setPlanAcceptedAt(null);
                }
            } catch (err) {
                console.error("Failed to load plan:", err);
                if (isMounted) {
                    setError(text.loadPlanError);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadPlan();

        return () => {
            isMounted = false;
        };
    }, [text.corruptedPlan, text.loadPlanError, user]);

    const openRegenerationForm = () => {
        if (!profileSnapshot) {
            setError(text.profileMissing);
            return;
        }

        setRegenerationDraft(toRegenerationDraft(profileSnapshot));
        setShowRegenerationForm(true);
    };

    const handleGenerate = async () => {
        if (!user || !regenerationDraft || !profileSnapshot) {
            setError(text.signInRequired);
            return;
        }

        setGenerating(true);
        setError(null);
        setNotice(null);

        try {
            const safeDraft: RegenerationDraft = {
                ...regenerationDraft,
                age: Math.min(Math.max(Number(regenerationDraft.age || profileSnapshot.age), 10), 100),
                weight: Math.min(Math.max(Number(regenerationDraft.weight || profileSnapshot.weight), 30), 300),
                height: Math.min(Math.max(Number(regenerationDraft.height || profileSnapshot.height), 100), 250),
                trainingDays: Math.min(Math.max(Number(regenerationDraft.trainingDays || profileSnapshot.trainingDays), 1), 7),
                availableMinutesPerSession: Math.min(Math.max(Number(regenerationDraft.availableMinutesPerSession || profileSnapshot.availableMinutesPerSession || 60), 20), 240),
                planStartDate: regenerationDraft.planStartDate || profileSnapshot.planStartDate || new Date().toISOString().slice(0, 10),
            };

            const updatedProfilePayload: Partial<UserProfile> = {
                age: safeDraft.age,
                weight: safeDraft.weight,
                height: safeDraft.height,
                goal: safeDraft.goal,
                equipment: safeDraft.equipment,
                experienceLevel: safeDraft.experienceLevel,
                injuries: safeDraft.injuries,
                trainingDays: safeDraft.trainingDays,
                availableMinutesPerSession: safeDraft.availableMinutesPerSession,
                planStartDate: safeDraft.planStartDate,
            };

            await updateUserProfile(user.uid, updatedProfilePayload);

            const mergedProfile: UserProfile = {
                ...profileSnapshot,
                ...updatedProfilePayload,
            };

            const profileForGeneration = {
                age: mergedProfile.age,
                weight: mergedProfile.weight,
                height: mergedProfile.height,
                goal: mergedProfile.goal,
                equipment: mergedProfile.equipment,
                experienceLevel: mergedProfile.experienceLevel,
                injuries: mergedProfile.injuries,
                trainingDays: mergedProfile.trainingDays,
                planStartDate: mergedProfile.planStartDate,
                availableMinutesPerSession: mergedProfile.availableMinutesPerSession,
                preferredLanguage: mergedProfile.preferredLanguage,
            };
            setEquipmentAccess(mergedProfile.equipment);
            setViewerExperienceLevel(mergedProfile.experienceLevel ?? "beginner");

            const adherence = computeRecentAdherenceScore(parseDailySessionLogs(mergedProfile.dailySessionLogs));
            const generatedPlan = await generateTrainingPlan({
                ...profileForGeneration,
                recentAdherenceScore: adherence.score ?? undefined,
                recentCompletedSessions: adherence.completedSessions,
                recentLoggedSessions: adherence.loggedSessions,
            });
            const newPlan = applyAdherenceProgressionToPlan(
                generatedPlan,
                adherence.score,
                mergedProfile.preferredLanguage === "en" ? "en" : "es"
            );
            if (!Array.isArray(newPlan) || newPlan.length === 0) {
                throw new Error("Generated plan is empty. Please try again.");
            }

            const generatedAt = new Date().toISOString();
            setPlan(newPlan);
            setPlanGeneratedAt(generatedAt);
            setPlanAcceptedAt(null);
            setSelectedPlanDayIndex(0);
            setNotice(text.generatedNotice);
            setProfileSnapshot(mergedProfile);
            setShowRegenerationForm(false);

            await updateUserProfile(user.uid, {
                currentPlan: JSON.stringify(newPlan),
                currentPlanGeneratedAt: generatedAt,
                currentPlanAcceptedAt: "",
            });
        } catch (err) {
            console.error("Plan generation failed:", err);
            setError(getErrorMessage(err, text.genericError));
        } finally {
            setGenerating(false);
        }
    };

    const handleConfirmPlan = async () => {
        if (!user || !plan) {
            return;
        }

        setConfirming(true);
        setError(null);
        setNotice(null);

        try {
            const acceptedAt = new Date().toISOString();
            await updateUserProfile(user.uid, {
                currentPlanAcceptedAt: acceptedAt,
            });
            setPlanAcceptedAt(acceptedAt);
            setNotice(text.confirmedNotice);
            router.replace("/dashboard");
        } catch (err) {
            console.error("Failed to confirm plan:", err);
            setError(getErrorMessage(err, text.genericError));
        } finally {
            setConfirming(false);
        }
    };

    const getDraftForDay = (dayIndex: number): CustomExerciseDraft => {
        return customExerciseDrafts[dayIndex] ?? defaultDraft;
    };

    const updateDraftForDay = (dayIndex: number, patch: Partial<CustomExerciseDraft>) => {
        setCustomExerciseDrafts((prev) => ({
            ...prev,
            [dayIndex]: {
                ...(prev[dayIndex] ?? defaultDraft),
                ...patch,
            },
        }));
    };

    const getSearchDraftForDay = (dayIndex: number): string => {
        return exerciseSearchDrafts[dayIndex] ?? "";
    };

    const updateSearchDraftForDay = (dayIndex: number, value: string) => {
        setExerciseSearchDrafts((prev) => ({
            ...prev,
            [dayIndex]: value,
        }));
    };

    const submitExerciseSearchForDay = (dayIndex: number, rawQuery?: string) => {
        const query = (rawQuery ?? exerciseSearchDrafts[dayIndex] ?? "").trim();
        setExerciseSearchQueries((prev) => ({
            ...prev,
            [dayIndex]: query,
        }));
    };

    const clearExerciseSearchForDay = (dayIndex: number) => {
        setExerciseSearchDrafts((prev) => ({
            ...prev,
            [dayIndex]: "",
        }));
        setExerciseSearchQueries((prev) => ({
            ...prev,
            [dayIndex]: "",
        }));
    };

    const handleAddExerciseToDay = async (dayIndex: number) => {
        if (!user || !plan) {
            return;
        }

        const draft = getDraftForDay(dayIndex);
        if (!draft.name.trim()) {
            setError("Exercise name is required to add a custom movement.");
            return;
        }

        setSavingCustomExercise(dayIndex);
        setError(null);

        try {
            const customExercise: TrainingExercise = {
                name: draft.name.trim(),
                sets: draft.sets.trim() || "3",
                reps: draft.reps.trim() || "10-12",
                rest: draft.rest.trim() || "60-90s",
                notes: draft.notes.trim() || undefined,
                why: draft.why.trim() || "Supports progression for this training day.",
            };

            const updatedPlan = plan.map((day, index) => {
                if (index !== dayIndex) {
                    return day;
                }

                return {
                    ...day,
                    exercises: [...day.exercises, customExercise],
                };
            });

            setPlan(updatedPlan);
            setCustomExerciseDrafts((prev) => {
                const next = { ...prev };
                delete next[dayIndex];
                return next;
            });

            await updateUserProfile(user.uid, {
                currentPlan: JSON.stringify(updatedPlan),
            });

            setNotice(`${text.addExerciseNotice} ${updatedPlan[dayIndex].day}.`);
        } catch (saveError) {
            console.error("Failed to add exercise:", saveError);
            setError(text.saveExerciseError);
        } finally {
            setSavingCustomExercise(null);
        }
    };

    const planAgeDays = useMemo(() => getPlanAgeInDays(planGeneratedAt ?? undefined), [planGeneratedAt]);
    const requiresWeeklyRefresh = planAgeDays !== null && planAgeDays >= 7;
    const safeSelectedPlanDayIndex = plan && plan.length > 0
        ? Math.min(Math.max(selectedPlanDayIndex, 0), plan.length - 1)
        : 0;
    const selectedPlanDay = plan && plan.length > 0 ? plan[safeSelectedPlanDayIndex] : null;
    const searchResultsByDay = useMemo<Record<number, ReturnType<typeof searchExercises>>>(() => {
        if (!plan) {
            return {};
        }

        return Object.fromEntries(
            plan.map((_, dayIndex) => {
                const query = (exerciseSearchQueries[dayIndex] ?? "").trim();
                const rawResults = query ? searchExercises(query, selectedLanguage, 12) : [];
                const filteredResults = rawResults.filter((option) => {
                    const insight = getExerciseInsight(option.canonicalName, selectedLanguage);
                    const matchesPattern = searchPatternFilter === "all" || insight.movementPattern === searchPatternFilter;
                    const matchesEquipment = searchEquipmentFilter === "all" || insight.equipment === searchEquipmentFilter;
                    const matchesMuscle =
                        searchMuscleFilter === "all" ||
                        insight.primaryMuscles.includes(searchMuscleFilter) ||
                        insight.secondaryMuscles.includes(searchMuscleFilter);
                    return matchesPattern && matchesEquipment && matchesMuscle;
                });
                return [dayIndex, filteredResults];
            })
        );
    }, [exerciseSearchQueries, plan, searchEquipmentFilter, searchMuscleFilter, searchPatternFilter, selectedLanguage]);
    const replacementOptionsByExercise = useMemo<Record<number, ReturnType<typeof getExerciseAlternatives>>>(() => {
        if (!selectedPlanDay) {
            return {};
        }

        return Object.fromEntries(
            selectedPlanDay.exercises.map((exercise, exerciseIndex) => [
                exerciseIndex,
                getExerciseAlternatives(exercise.name, selectedLanguage, equipmentAccess, 10),
            ])
        );
    }, [equipmentAccess, selectedLanguage, selectedPlanDay]);

    useEffect(() => {
        if (!plan || plan.length === 0) {
            setSelectedPlanDayIndex(0);
            return;
        }

        setSelectedPlanDayIndex((current) => Math.min(Math.max(current, 0), plan.length - 1));
    }, [plan]);

    const updateReplacementDraft = (dayIndex: number, exerciseIndex: number, value: string) => {
        setReplacementDrafts((prev) => ({
            ...prev,
            [`${dayIndex}-${exerciseIndex}`]: value,
        }));
    };

    const handleReplaceExercise = async (
        dayIndex: number,
        exerciseIndex: number,
        directReplacementName?: string
    ) => {
        if (!user || !plan) {
            return;
        }

        const optionKey = `${dayIndex}-${exerciseIndex}`;
        const equivalentOptions = replacementOptionsByExercise[exerciseIndex] ?? [];
        if (equivalentOptions.length === 0) {
            setError(text.noEquivalentFound);
            return;
        }

        const replacementName = (directReplacementName ?? replacementDrafts[optionKey] ?? "").trim();
        if (!replacementName) {
            setError(text.exerciseNameRequired);
            return;
        }

        const matchedEquivalent = resolveEquivalentMatch(replacementName, equivalentOptions);

        if (!matchedEquivalent) {
            setError(text.replacementMustBeEquivalent);
            return;
        }

        setSwappingExerciseKey(optionKey);
        setError(null);

        try {
            const updatedPlan = plan.map((day, currentDayIndex) => {
                if (currentDayIndex !== dayIndex) {
                    return day;
                }

                return {
                    ...day,
                    exercises: day.exercises.map((exercise, currentExerciseIndex) => {
                        if (currentExerciseIndex !== exerciseIndex) {
                            return exercise;
                        }

                        const replacementNote = isEnglish
                            ? "Adjusted with a 1:1 equivalent due to equipment availability."
                            : "Ajustado con equivalente 1:1 por disponibilidad de equipo.";

                        return {
                            ...exercise,
                            name: matchedEquivalent.name,
                            notes: exercise.notes ? `${exercise.notes} ${replacementNote}` : replacementNote,
                        };
                    }),
                };
            });

            setPlan(updatedPlan);
            setReplacementDrafts((prev) => ({
                ...prev,
                [optionKey]: "",
            }));

            await updateUserProfile(user.uid, {
                currentPlan: JSON.stringify(updatedPlan),
            });

            setNotice(`${text.replacedNotice} ${updatedPlan[dayIndex].day}.`);
        } catch (replaceError) {
            console.error("Failed to replace exercise:", replaceError);
            setError(text.replaceExerciseError);
        } finally {
            setSwappingExerciseKey(null);
        }
    };

    const renderSessionBlocks = (blocks: SessionBlock[] | undefined, title: string) => {
        if (!blocks || blocks.length === 0) {
            return null;
        }

        return (
            <div className="px-4 py-3 border-b border-border/70 bg-background/30 space-y-2">
                <h4 className="text-sm font-bold text-primary">{title}</h4>
                <div className="grid gap-2">
                    {blocks.map((block, blockIndex) => (
                        <article key={`${title}-${block.title}-${blockIndex}`} className="rounded-lg border border-border/70 bg-card/35 p-2 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold">{localizeNarrativeText(block.title, selectedLanguage)}</p>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold whitespace-nowrap">
                                    {text.phaseDuration}: {block.durationMinutes} min
                                </span>
                            </div>
                            <p className="text-xs text-foreground/90">{localizeNarrativeText(block.instructions, selectedLanguage)}</p>
                            {showDetailedRationale && block.why && (
                                <p className="text-xs text-primary/90">
                                    <strong>{text.whyExercise}:</strong> {localizeNarrativeText(block.why, selectedLanguage)}
                                </p>
                            )}
                        </article>
                    ))}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up overflow-x-hidden">
            <div className="glass-panel rounded-3xl p-5 md:p-6 space-y-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{text.title}</h1>
                        <p className="text-muted-foreground">{text.subtitle}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setShowDetailedRationale((prev) => !prev)}
                            className={`h-10 px-4 rounded-xl border text-sm font-semibold transition-all inline-flex items-center gap-2 ${
                                showDetailedRationale
                                    ? "border-primary/45 bg-primary/12 text-primary"
                                    : "border-border/80 bg-background/45 text-foreground/85"
                            }`}
                        >
                            {showDetailedRationale ? <Eye size={15} /> : <EyeOff size={15} />}
                            {showDetailedRationale ? text.detailedMode : text.compactMode}
                        </button>
                        <button
                            onClick={() => router.replace("/dashboard")}
                            className="h-10 px-4 rounded-xl border border-border/80 bg-card/60 text-foreground font-semibold flex items-center gap-2 hover:bg-card transition-colors"
                        >
                            <ArrowLeft size={16} />
                            {text.back}
                        </button>
                        <button
                            onClick={openRegenerationForm}
                            disabled={generating}
                            data-testid="plan-open-regeneration"
                            className="h-10 px-4 bg-primary text-primary-foreground font-bold rounded-xl flex items-center gap-2 shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
                        >
                            {generating ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                            {plan ? (requiresWeeklyRefresh ? text.updateWeekly : text.updateInputs) : text.generate}
                        </button>

                        {plan && (
                            <>
                                {!planAcceptedAt ? (
                                    <button
                                        onClick={handleConfirmPlan}
                                        disabled={confirming}
                                        className="h-10 px-4 rounded-xl border border-primary/50 bg-primary/10 text-primary font-semibold flex items-center gap-2 hover:bg-primary/15 transition-colors disabled:opacity-50"
                                    >
                                        {confirming ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                        {text.confirmContinue}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => router.replace("/dashboard")}
                                        className="h-10 px-4 rounded-xl border border-border/80 bg-card/60 text-foreground font-semibold flex items-center gap-2 hover:bg-card transition-colors"
                                    >
                                        {text.continue}
                                        <ArrowRight size={16} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    {showDetailedRationale ? text.densityHintDetailed : text.densityHintCompact}
                </p>
            </div>

            {showRegenerationForm && regenerationDraft && (
                <section className="rounded-2xl border border-primary/35 bg-primary/10 p-4 md:p-5 space-y-4">
                    <div>
                        <h2 className="text-lg font-bold text-primary">{text.updateInputs}</h2>
                        <p className="text-sm text-muted-foreground">{text.updateInputsHint}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.age}</label>
                            <input
                                type="number"
                                min={10}
                                max={100}
                                data-testid="plan-reg-age"
                                value={regenerationDraft.age}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, age: Number(event.target.value) } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.weight}</label>
                            <input
                                type="number"
                                min={30}
                                max={300}
                                step="0.1"
                                data-testid="plan-reg-weight"
                                value={regenerationDraft.weight}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, weight: Number(event.target.value) } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.height}</label>
                            <input
                                type="number"
                                min={100}
                                max={250}
                                data-testid="plan-reg-height"
                                value={regenerationDraft.height}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, height: Number(event.target.value) } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.goal}</label>
                            <select
                                data-testid="plan-reg-goal"
                                value={regenerationDraft.goal}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, goal: event.target.value as UserProfile["goal"] } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            >
                                <option value="hypertrophy">Hypertrophy</option>
                                <option value="strength">Strength</option>
                                <option value="endurance">Endurance</option>
                                <option value="weight_loss">Weight Loss</option>
                                <option value="maintenance">Maintenance</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.equipmentField}</label>
                            <select
                                data-testid="plan-reg-equipment"
                                value={regenerationDraft.equipment}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, equipment: event.target.value as UserProfile["equipment"] } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            >
                                <option value="gym">{isEnglish ? "Gym" : "Gimnasio"}</option>
                                <option value="dumbbells">{isEnglish ? "Dumbbells" : "Mancuernas"}</option>
                                <option value="bodyweight">{isEnglish ? "Bodyweight" : "Peso corporal"}</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.level}</label>
                            <select
                                data-testid="plan-reg-level"
                                value={regenerationDraft.experienceLevel}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, experienceLevel: event.target.value as UserProfile["experienceLevel"] } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            >
                                <option value="beginner">{isEnglish ? "Beginner" : "Principiante"}</option>
                                <option value="intermediate">{isEnglish ? "Intermediate" : "Intermedio"}</option>
                                <option value="advanced">{isEnglish ? "Advanced" : "Avanzado"}</option>
                                <option value="expert">{isEnglish ? "Expert" : "Experto"}</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.trainingDaysField}</label>
                            <input
                                type="number"
                                min={1}
                                max={7}
                                data-testid="plan-reg-training-days"
                                value={regenerationDraft.trainingDays}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, trainingDays: Number(event.target.value) } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.sessionMinutesField}</label>
                            <input
                                type="number"
                                min={20}
                                max={240}
                                data-testid="plan-reg-minutes"
                                value={regenerationDraft.availableMinutesPerSession}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, availableMinutesPerSession: Number(event.target.value) } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.injuriesField}</label>
                            <input
                                data-testid="plan-reg-injuries"
                                value={regenerationDraft.injuries}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, injuries: event.target.value } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.startDateField}</label>
                            <input
                                type="date"
                                data-testid="plan-reg-start-date"
                                value={regenerationDraft.planStartDate}
                                onChange={(event) => setRegenerationDraft((prev) => prev ? { ...prev, planStartDate: event.target.value } : prev)}
                                className="h-10 w-full rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={generating}
                            data-testid="plan-apply-regeneration"
                            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center gap-2 hover:brightness-110 disabled:opacity-50"
                        >
                            {generating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                            {text.applyAndGenerate}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowRegenerationForm(false)}
                            className="h-10 px-4 rounded-xl border border-border bg-card/60 text-sm font-semibold hover:bg-card"
                        >
                            {text.cancel}
                        </button>
                    </div>
                </section>
            )}

            {requiresWeeklyRefresh && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/35 text-amber-200 rounded-xl">
                    {text.stale} {planAgeDays} {text.daysOld}
                </div>
            )}

            {notice && (
                <div className="p-4 bg-primary/10 border border-primary/30 text-primary rounded-xl">
                    {notice}
                    {planAcceptedAt && (
                        <span className="ml-2 text-foreground/80">
                            {text.confirmedAt} {new Date(planAcceptedAt).toLocaleString()}.
                        </span>
                    )}
                </div>
            )}

            {error && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl flex items-center gap-2">
                    <AlertTriangle size={18} />
                    {error}
                </div>
            )}

            {!plan && !generating && (
                <div className="text-center py-12 border border-dashed border-border/80 rounded-2xl bg-card/35 glass-panel">
                    <Sparkles className="mx-auto text-primary mb-4" size={48} />
                    <h3 className="text-xl font-bold mb-2">{text.noPlan}</h3>
                    <p className="text-muted-foreground max-w-md mx-auto mb-6">
                        {text.noPlanDescription}
                    </p>
                    <button
                        onClick={openRegenerationForm}
                        className="h-12 px-6 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium rounded-xl"
                    >
                        {text.createPlan}
                    </button>
                </div>
            )}

            {plan && plan.length > 0 && (
                <section className="grid gap-5 lg:grid-cols-[250px_1fr]">
                    <aside className="rounded-2xl border border-border/80 bg-card/45 p-3 md:p-4 space-y-3 h-fit lg:sticky lg:top-6 glass-panel">
                        <div>
                            <h3 className="font-bold">{text.planDays}</h3>
                            <p className="text-xs text-muted-foreground">{text.planDaysHint}</p>
                        </div>

                        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1">
                            {plan.map((day, dayIndex) => {
                                const isActive = dayIndex === safeSelectedPlanDayIndex;
                                return (
                                    <button
                                        key={`${day.day}-nav-${dayIndex}`}
                                        type="button"
                                        onClick={() => setSelectedPlanDayIndex(dayIndex)}
                                        className={`min-w-[150px] lg:min-w-0 rounded-xl border px-3 py-2 text-left transition-all ${
                                            isActive
                                                ? "border-primary/50 bg-primary/12 text-primary"
                                                : "border-border bg-background/40 hover:border-primary/35"
                                        }`}
                                    >
                                        <p className="text-sm font-semibold">{localizeDayLabel(day.day, selectedLanguage)}</p>
                                        <p className="text-xs text-muted-foreground">{localizeFocusLabel(day.focus, selectedLanguage)}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    <div className="grid gap-6">
                        {selectedPlanDay && (() => {
                            const dayIndex = safeSelectedPlanDayIndex;
                            const day = selectedPlanDay;
                            const draft = getDraftForDay(dayIndex);
                            const searchDraft = getSearchDraftForDay(dayIndex);
                            const searchResults = searchResultsByDay[dayIndex] ?? [];

                            return (
                                <article key={`${day.day}-${dayIndex}`} className="bg-card/55 border border-border/80 rounded-2xl overflow-hidden shadow-sm glass-panel">
                                    <div className="bg-secondary/45 p-4 border-b border-border/70 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                        <h3 className="font-bold text-lg text-primary">{localizeDayLabel(day.day, selectedLanguage)}</h3>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium px-3 py-1 rounded-full bg-background border border-border">
                                                {localizeFocusLabel(day.focus, selectedLanguage)}
                                            </span>
                                            <span className="text-xs font-semibold px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                                                ~{estimateTrainingDayDurationMinutes(day)} min
                                            </span>
                                        </div>
                                    </div>

                                    {showDetailedRationale && day.whyThisDay && (
                                        <div className="px-4 py-3 border-b border-border bg-primary/5 text-sm text-primary">
                                            <strong>{text.whyDay}:</strong> {localizeNarrativeText(day.whyThisDay, selectedLanguage)}
                                        </div>
                                    )}

                                    {renderSessionBlocks(day.warmup, text.warmupPhase)}

                                    <div className="divide-y divide-border/80">
                                        {day.exercises.map((exercise, exerciseIndex) => {
                                            const insight = getExerciseInsight(exercise.name, selectedLanguage);
                                            const replacementKey = `${dayIndex}-${exerciseIndex}`;
                                            const previewKey = `${dayIndex}-${exerciseIndex}`;
                                            const isPreviewOpen = !!openPreviewKeys[previewKey];

                                            return (
                                                <div key={`${exercise.name}-${exerciseIndex}`} className="p-4 hover:bg-secondary/20 transition-colors space-y-3">
                                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                                        <div>
                                                            <h4 className="font-bold">{insight.displayName}</h4>
                                                            {selectedLanguage === "es" && insight.displayName !== insight.canonicalName && (
                                                                <p className="text-[11px] text-muted-foreground mt-1">{insight.canonicalName}</p>
                                                            )}
                                                            {showDetailedRationale && exercise.notes && (
                                                                <p className="text-xs text-muted-foreground mt-1 text-primary/80">
                                                                    {localizeNarrativeText(exercise.notes, selectedLanguage)}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-2 text-sm text-center w-full md:w-[320px]">
                                                            <div className="bg-background/50 rounded p-2">
                                                                <span className="block text-xs text-muted-foreground uppercase font-bold">{text.sets}</span>
                                                                <span className="font-mono font-bold">{exercise.sets}</span>
                                                            </div>
                                                            <div className="bg-background/50 rounded p-2">
                                                                <span className="block text-xs text-muted-foreground uppercase font-bold">{text.reps}</span>
                                                                <span className="font-mono font-bold">{exercise.reps}</span>
                                                            </div>
                                                            <div className="bg-background/50 rounded p-2">
                                                                <span className="block text-xs text-muted-foreground uppercase font-bold">{text.rest}</span>
                                                                <span className="font-mono font-bold">{exercise.rest}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <p className="text-xs text-primary/90">
                                                        <strong>{text.load}:</strong> {resolveExerciseLoadDisplay(exercise, selectedLanguage)}
                                                    </p>

                                                    {showDetailedRationale && exercise.why && (
                                                        <p className="text-xs text-primary/90">
                                                            <strong>{text.whyExercise}:</strong> {localizeNarrativeText(exercise.why, selectedLanguage)}
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
                                                                    experienceLevel={viewerExperienceLevel}
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
                                                            {(replacementOptionsByExercise[exerciseIndex]?.length ?? 0) > 0 ? (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {replacementOptionsByExercise[exerciseIndex]?.slice(0, 4).map((option) => (
                                                                        <button
                                                                            key={`${option.id}-plan-quick-${exerciseIndex}`}
                                                                            type="button"
                                                                            onClick={() => handleReplaceExercise(dayIndex, exerciseIndex, option.name)}
                                                                            disabled={swappingExerciseKey === replacementKey}
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

                                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
                                                            <div className="space-y-1">
                                                                <input
                                                                    value={replacementDrafts[replacementKey] ?? ""}
                                                                    onChange={(event) => updateReplacementDraft(dayIndex, exerciseIndex, event.target.value)}
                                                                    placeholder={text.replacePlaceholder}
                                                                    list={`exercise-plan-swap-options-${dayIndex}-${exerciseIndex}`}
                                                                    className="h-9 w-full rounded-lg bg-input border border-border px-3 text-xs outline-none focus:ring-2 ring-primary"
                                                                />
                                                                <datalist id={`exercise-plan-swap-options-${dayIndex}-${exerciseIndex}`}>
                                                                    {replacementOptionsByExercise[exerciseIndex]?.map((option) => (
                                                                        <option key={`${option.id}-${dayIndex}-${exerciseIndex}`} value={option.name}>
                                                                            {option.canonicalName}
                                                                        </option>
                                                                    ))}
                                                                </datalist>
                                                                <p className="text-[11px] text-muted-foreground">
                                                                    {text.equivalentHint}: {replacementOptionsByExercise[exerciseIndex]?.slice(0, 3).map((option) => option.name).join(" • ") || (isEnglish ? "N/A" : "N/D")}
                                                                </p>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleReplaceExercise(dayIndex, exerciseIndex)}
                                                                disabled={swappingExerciseKey === replacementKey || (replacementOptionsByExercise[exerciseIndex]?.length ?? 0) === 0}
                                                                className="h-9 px-3 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-semibold disabled:opacity-50"
                                                            >
                                                                {swappingExerciseKey === replacementKey ? <Loader2 size={14} className="animate-spin" /> : text.replaceExercise}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {renderSessionBlocks(day.cooldown, text.cooldownPhase)}

                                    <div className="p-4 border-t border-border bg-card/30 space-y-3">
                                        <h4 className="font-semibold text-sm">{text.addCustom} {day.day}</h4>
                                        <div className="rounded-xl border border-border/70 bg-background/35 p-3 space-y-3">
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                                <div>
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                        {text.searchLibrary}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {text.searchLibraryHint}
                                                    </p>
                                                </div>
                                                {(searchDraft || searchResults.length > 0) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => clearExerciseSearchForDay(dayIndex)}
                                                        className="h-8 px-3 rounded-lg border border-border bg-card/60 text-[11px] font-semibold hover:bg-card"
                                                    >
                                                        {text.clearSearch}
                                                    </button>
                                                )}
                                            </div>

                                            <form
                                                onSubmit={(event) => {
                                                    event.preventDefault();
                                                    submitExerciseSearchForDay(dayIndex);
                                                }}
                                                className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2"
                                            >
                                                <input
                                                    value={searchDraft}
                                                    onChange={(event) => updateSearchDraftForDay(dayIndex, event.target.value)}
                                                    placeholder={text.searchPlaceholder}
                                                    className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                                                />
                                                <button
                                                    type="submit"
                                                    className="h-10 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary font-semibold inline-flex items-center justify-center gap-2 hover:bg-primary/15"
                                                >
                                                    <Search size={15} />
                                                    {text.searchAction}
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
                                                        <option key={`plan-pattern-${option.value}`} value={option.value}>
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
                                                        <option key={`plan-equipment-${option.value}`} value={option.value}>
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
                                                        <option key={`plan-muscle-${option.value}`} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {text.quickSearch}
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {quickSearchTerms.map((term) => (
                                                        <button
                                                            key={`${dayIndex}-${term}`}
                                                            type="button"
                                                            onClick={() => {
                                                                updateSearchDraftForDay(dayIndex, term);
                                                                submitExerciseSearchForDay(dayIndex, term);
                                                            }}
                                                            className="h-8 px-3 rounded-full border border-primary/35 bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/15"
                                                        >
                                                            {term}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {searchResults.length > 0 && (
                                                <div className="space-y-2">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                        {text.suggestedMatches}
                                                    </p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        {searchResults.map((result) => {
                                                            const resultInsight = getExerciseInsight(result.canonicalName, selectedLanguage);

                                                            return (
                                                                <button
                                                                    key={`${result.id}-search-result-${dayIndex}`}
                                                                    type="button"
                                                                    onClick={() => updateDraftForDay(dayIndex, { name: result.name })}
                                                                    className="rounded-xl border border-border/70 bg-card/55 p-3 text-left hover:border-primary/35 hover:bg-card transition-colors"
                                                                >
                                                                    <p className="text-sm font-semibold">{result.name}</p>
                                                                    <p className="text-[11px] text-muted-foreground mt-1">
                                                                        {resultInsight.movementPatternLabel} • {resultInsight.primaryMuscleLabels.slice(0, 2).join(", ")}
                                                                    </p>
                                                                    <p className="text-[11px] text-primary mt-2 font-semibold">{text.useExercise}</p>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {(exerciseSearchQueries[dayIndex] ?? "").trim().length > 0 && searchResults.length === 0 && (
                                                <p className="text-[11px] text-muted-foreground">{text.noSearchResults}</p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <input
                                                value={draft.name}
                                                onChange={(event) => updateDraftForDay(dayIndex, { name: event.target.value })}
                                                placeholder={text.exerciseName}
                                                list={`exercise-database-options-plan-${dayIndex}`}
                                                className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary md:col-span-2"
                                            />
                                            <datalist id={`exercise-database-options-plan-${dayIndex}`}>
                                                {exerciseOptions.map((exercise) => (
                                                    <option key={exercise.id} value={exercise.name}>
                                                        {exercise.canonicalName}
                                                    </option>
                                                ))}
                                            </datalist>
                                            <input
                                                value={draft.sets}
                                                onChange={(event) => updateDraftForDay(dayIndex, { sets: event.target.value })}
                                                placeholder={text.sets}
                                                className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                                            />
                                            <input
                                                value={draft.reps}
                                                onChange={(event) => updateDraftForDay(dayIndex, { reps: event.target.value })}
                                                placeholder={text.reps}
                                                className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                                            />
                                            <input
                                                value={draft.rest}
                                                onChange={(event) => updateDraftForDay(dayIndex, { rest: event.target.value })}
                                                placeholder={text.rest}
                                                className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                                            />
                                            <input
                                                value={draft.notes}
                                                onChange={(event) => updateDraftForDay(dayIndex, { notes: event.target.value })}
                                                placeholder={text.notes}
                                                className="h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                                            />
                                        </div>

                                        <textarea
                                            value={draft.why}
                                            onChange={(event) => updateDraftForDay(dayIndex, { why: event.target.value })}
                                            placeholder={text.whyPlaceholder}
                                            className="w-full h-20 rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
                                        />

                                        <button
                                            onClick={() => handleAddExerciseToDay(dayIndex)}
                                            disabled={savingCustomExercise === dayIndex}
                                            className="h-10 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/15 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                                        >
                                            {savingCustomExercise === dayIndex ? <Loader2 className="animate-spin" size={16} /> : <PlusCircle size={16} />}
                                            {text.addExercise}
                                        </button>
                                    </div>
                                </article>
                            );
                        })()}
                    </div>
                </section>
            )}
        </div>
    );
}
