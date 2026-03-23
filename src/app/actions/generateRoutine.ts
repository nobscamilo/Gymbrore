'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { UserProfile } from '@/lib/types';
import { z } from 'zod';
import { resolveExerciseLoadDisplay, SessionBlock, TrainingDay, TrainingPlanSchema } from '@/lib/trainingPlan';
import { resolveGenAiApiKey, resolveGenAiModel } from "@/lib/genai";
import { findCatalogExercise, getExerciseInsight, SupportedLanguage } from "@/lib/exerciseCatalog";
import { getExerciseDatabase } from "@/lib/exerciseDatabase";

const focusByGoal: Record<UserProfile["goal"], string[]> = {
  hypertrophy: ["Push", "Pull", "Legs", "Upper", "Lower", "Push", "Conditioning"],
  strength: ["Squat + Core", "Bench + Push", "Deadlift + Pull", "Upper Assistance", "Lower Assistance", "Power + Speed", "Conditioning"],
  endurance: ["Aerobic Base", "Threshold", "Tempo + Core", "Intervals", "Recovery + Mobility", "Mixed Conditioning", "Long Session"],
  weight_loss: ["Full Body A", "Conditioning", "Full Body B", "Cardio + Core", "Full Body C", "HIIT", "Mobility + Walk"],
  maintenance: ["Upper", "Lower", "Conditioning", "Full Body", "Upper", "Lower", "Mobility"],
};

const focusByGoalEs: Record<UserProfile["goal"], string[]> = {
  hypertrophy: ["Empuje", "Traccion", "Piernas", "Tren Superior", "Tren Inferior", "Empuje", "Acondicionamiento"],
  strength: ["Sentadilla + Core", "Banca + Empuje", "Peso Muerto + Traccion", "Asistencia Superior", "Asistencia Inferior", "Potencia + Velocidad", "Acondicionamiento"],
  endurance: ["Base Aerobica", "Umbral", "Tempo + Core", "Intervalos", "Recuperacion + Movilidad", "Acondicionamiento Mixto", "Sesion Larga"],
  weight_loss: ["Cuerpo Completo A", "Acondicionamiento", "Cuerpo Completo B", "Cardio + Core", "Cuerpo Completo C", "HIIT", "Movilidad + Caminata"],
  maintenance: ["Tren Superior", "Tren Inferior", "Acondicionamiento", "Cuerpo Completo", "Tren Superior", "Tren Inferior", "Movilidad"],
};

const baseExercisesByEquipment: Record<UserProfile["equipment"], string[]> = {
  gym: [
    "Back Squat",
    "Front Squat",
    "Romanian Deadlift",
    "Deadlift",
    "Trap Bar Deadlift",
    "Bench Press",
    "Incline Dumbbell Press",
    "Landmine Press",
    "Seated Cable Row",
    "Chest-Supported Row",
    "Lat Pulldown",
    "Pull-Up",
    "Overhead Press",
    "Leg Press",
    "Face Pull",
    "Hip Thrust",
    "Walking Lunge",
    "Step-Up",
    "Calf Raise",
    "Plank",
    "Dead Bug",
    "TRX Row",
    "TRX Chest Press",
    "TRX Split Squat",
    "TRX Hamstring Curl",
    "Pilates Hundred",
    "Pilates Shoulder Bridge",
    "Yoga Downward Dog",
    "Sun Salutation Flow",
  ],
  dumbbells: [
    "Goblet Squat",
    "Dumbbell Romanian Deadlift",
    "Split Squat",
    "Bulgarian Split Squat",
    "Dumbbell Floor Press",
    "One-Arm Dumbbell Row",
    "Dumbbell Shoulder Press",
    "Reverse Lunge",
    "Walking Lunge",
    "Dumbbell Hip Thrust",
    "Dumbbell Lateral Raise",
    "Step-Up",
    "Calf Raise",
    "Biceps Curl",
    "Triceps Extension",
    "Dead Bug",
    "Side Plank",
    "Mountain Climbers",
    "TRX Row",
    "TRX Chest Press",
    "TRX Assisted Squat",
    "Pilates Hundred",
    "Pilates Roll Up",
    "Yoga Downward Dog",
    "Yoga Pigeon Stretch",
  ],
  bodyweight: [
    "Bodyweight Squat",
    "Split Squat",
    "Push-Up",
    "Pike Push-Up",
    "Inverted Row",
    "Glute Bridge",
    "Single-Leg Romanian Deadlift",
    "Walking Lunge",
    "Step-Up",
    "Calf Raise",
    "Mountain Climbers",
    "Dead Bug",
    "Plank",
    "Side Plank",
    "Joint Mobility Primer",
    "Activation and Ramp-Up Sets",
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
  ],
};

const intensityByGoal: Record<UserProfile["goal"], { sets: string; reps: string; rest: string; rpe: string }> = {
  hypertrophy: { sets: "3-4", reps: "8-12", rest: "60-90s", rpe: "7-8" },
  strength: { sets: "4-5", reps: "3-6", rest: "2-3m", rpe: "8-9" },
  endurance: { sets: "2-4", reps: "12-20", rest: "30-60s", rpe: "6-7" },
  weight_loss: { sets: "3-4", reps: "10-15", rest: "30-60s", rpe: "7-8" },
  maintenance: { sets: "2-3", reps: "8-12", rest: "60-90s", rpe: "6-7" },
};

const goalBenefitByGoal: Record<UserProfile["goal"], string> = {
  hypertrophy: "maximize mechanical tension and weekly volume to build muscle mass",
  strength: "improve neural efficiency and force production in compound lifts",
  endurance: "increase aerobic and muscular endurance while controlling fatigue",
  weight_loss: "increase total energy expenditure while preserving lean mass",
  maintenance: "maintain strength and conditioning with efficient weekly stimulus",
};

const goalBenefitByGoalEs: Record<UserProfile["goal"], string> = {
  hypertrophy: "maximizar la tension mecanica y el volumen semanal para ganar masa muscular",
  strength: "mejorar la eficiencia neural y la produccion de fuerza en levantamientos compuestos",
  endurance: "aumentar la resistencia aerobica y muscular controlando la fatiga",
  weight_loss: "incrementar el gasto energetico preservando masa magra",
  maintenance: "mantener fuerza y condicion fisica con un estimulo semanal eficiente",
};

const PlanInputSchema = z.object({
  age: z.coerce.number().min(10).max(100),
  weight: z.coerce.number().min(30).max(300),
  height: z.coerce.number().min(100).max(250).optional(),
  goal: z.enum(['hypertrophy', 'strength', 'endurance', 'weight_loss', 'maintenance']),
  equipment: z.enum(['gym', 'dumbbells', 'bodyweight']),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  injuries: z.string().max(400).optional(),
  trainingDays: z.coerce.number().int().min(1).max(7),
  planStartDate: z.string().optional(),
  availableMinutesPerSession: z.coerce.number().min(20).max(240).optional(),
  preferredLanguage: z.enum(['es', 'en']).optional(),
  recentAdherenceScore: z.coerce.number().min(0).max(100).optional(),
  recentCompletedSessions: z.coerce.number().int().min(0).max(30).optional(),
  recentLoggedSessions: z.coerce.number().int().min(0).max(30).optional(),
});
type PlanInput = z.infer<typeof PlanInputSchema>;

const buildDefaultWarmup = (isSpanish: boolean, injuries?: string): SessionBlock[] => {
  const injuryNote = injuries && injuries.trim().length > 0
    ? (isSpanish ? ` Ajusta segun: ${injuries}.` : ` Adjust according to: ${injuries}.`)
    : "";

  if (isSpanish) {
    return [
      {
        title: "Movilidad articular inicial",
        durationMinutes: 4,
        instructions: `Moviliza tobillos, cadera, toracica y hombros con control.${injuryNote}`.trim(),
        why: "Mejora rango util y reduce rigidez antes de cargar.",
      },
      {
        title: "Activacion y series de aproximacion",
        durationMinutes: 5,
        instructions: "Activa core y gluteos, luego realiza 1-2 series progresivas del primer ejercicio.",
        why: "Prepara sistema neuromuscular para entrenar con mejor tecnica.",
      },
    ];
  }

  return [
    {
      title: "Joint mobility primer",
      durationMinutes: 4,
      instructions: `Mobilize ankles, hips, thoracic spine, and shoulders with control.${injuryNote}`.trim(),
      why: "Improves usable range of motion and reduces stiffness before loading.",
    },
    {
      title: "Activation and ramp-up sets",
      durationMinutes: 5,
      instructions: "Activate core and glutes, then perform 1-2 progressive sets of the first main lift.",
      why: "Prepares the neuromuscular system for cleaner and safer execution.",
    },
  ];
};

const buildDefaultCooldown = (isSpanish: boolean, injuries?: string): SessionBlock[] => {
  const injuryNote = injuries && injuries.trim().length > 0
    ? (isSpanish ? ` Prioriza la zona: ${injuries}.` : ` Prioritize: ${injuries}.`)
    : "";

  if (isSpanish) {
    return [
      {
        title: "Vuelta a la calma respiratoria",
        durationMinutes: 2,
        instructions: "Respiracion diafragmatica 4-6 ciclos por minuto para bajar pulsaciones.",
        why: "Facilita recuperacion autonoma post-esfuerzo.",
      },
      {
        title: "Estiramiento dirigido",
        durationMinutes: 4,
        instructions: `Estiramiento suave de musculos trabajados, 20-30 segundos por grupo.${injuryNote}`.trim(),
        why: "Reduce tension residual y mejora tolerancia al siguiente entrenamiento.",
      },
    ];
  }

  return [
    {
      title: "Breathing downregulation",
      durationMinutes: 2,
      instructions: "Use diaphragmatic breathing at 4-6 breaths per minute to lower heart rate.",
      why: "Supports faster autonomic recovery after training.",
    },
    {
      title: "Targeted stretching",
      durationMinutes: 4,
      instructions: `Perform light stretching for worked muscles, 20-30 seconds each.${injuryNote}`.trim(),
      why: "Reduces residual tension and improves readiness for the next session.",
    },
  ];
};

const ensureSessionPhases = (plan: TrainingDay[], isSpanish: boolean, injuries?: string): TrainingDay[] => {
  return plan.map((day) => ({
    ...day,
    warmup: day.warmup && day.warmup.length > 0 ? day.warmup : buildDefaultWarmup(isSpanish, injuries),
    cooldown: day.cooldown && day.cooldown.length > 0 ? day.cooldown : buildDefaultCooldown(isSpanish, injuries),
  }));
};

const ENGLISH_HINTS = [
  "the",
  "this",
  "session",
  "exercise",
  "for",
  "with",
  "and",
  "focus",
  "selected",
  "was",
  "targets",
];

const SPANISH_HINTS = [
  "el",
  "la",
  "sesion",
  "ejercicio",
  "para",
  "con",
  "y",
  "enfoque",
  "selecciono",
  "esta",
];

const normalizeText = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const isExerciseCompatibleWithEquipment = (
  equipment: ReturnType<typeof getExerciseInsight>["equipment"],
  availableEquipment: PlanInput["equipment"]
): boolean => {
  if (availableEquipment === "gym") {
    return true;
  }

  if (availableEquipment === "dumbbells") {
    return equipment === "dumbbell" || equipment === "bodyweight" || equipment === "mixed";
  }

  return equipment === "bodyweight";
};

const tokenizeNormalized = (value: string): string[] => {
  return normalizeText(value).split(" ").filter(Boolean);
};

const scoreExerciseNameSimilarity = (rawName: string, candidateName: string): number => {
  const normalizedRaw = normalizeText(rawName);
  const normalizedCandidate = normalizeText(candidateName);
  if (!normalizedRaw || !normalizedCandidate) {
    return 0;
  }

  if (normalizedRaw === normalizedCandidate) {
    return 200;
  }

  let score = 0;
  if (normalizedRaw.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedRaw)) {
    score += 80;
  }

  const rawTokens = tokenizeNormalized(normalizedRaw);
  const candidateTokens = new Set(tokenizeNormalized(normalizedCandidate));
  const sharedTokens = rawTokens.filter((token) => candidateTokens.has(token)).length;
  score += sharedTokens * 14;

  if (sharedTokens >= 2) {
    score += 18;
  }

  return score;
};

const buildApprovedExerciseNames = (equipment: PlanInput["equipment"]): string[] => {
  const database = getExerciseDatabase("en");
  const unique = new Set<string>();

  database.forEach((option) => {
    const insight = getExerciseInsight(option.canonicalName, "en");
    if (isExerciseCompatibleWithEquipment(insight.equipment, equipment)) {
      unique.add(option.canonicalName);
    }
  });

  baseExercisesByEquipment[equipment].forEach((name) => unique.add(name));

  return Array.from(unique);
};

const resolveApprovedExerciseName = (rawName: string, approvedNames: string[]): string | null => {
  const normalizedRaw = normalizeText(rawName);
  if (!normalizedRaw) {
    return null;
  }

  const approvedSet = new Set(approvedNames.map((name) => normalizeText(name)));
  const directMatch = findCatalogExercise(rawName);
  if (directMatch && approvedSet.has(normalizeText(directMatch.nameEn))) {
    return directMatch.nameEn;
  }

  let bestName: string | null = null;
  let bestScore = 0;
  approvedNames.forEach((candidateName) => {
    const score = scoreExerciseNameSimilarity(rawName, candidateName);
    if (score > bestScore) {
      bestScore = score;
      bestName = candidateName;
    }
  });

  if (bestName && bestScore >= 30) {
    return bestName;
  }

  return null;
};

const canonicalizePlanExerciseNames = (
  plan: TrainingDay[],
  equipment: PlanInput["equipment"],
  language: SupportedLanguage
): TrainingDay[] => {
  const approvedNames = buildApprovedExerciseNames(equipment);
  const fallbackName =
    approvedNames.find((name) => normalizeText(name) === "plank") ??
    approvedNames[0] ??
    "Plank";

  return plan.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => {
      const resolved = resolveApprovedExerciseName(exercise.name, approvedNames) ?? fallbackName;
      if (resolved === exercise.name) {
        return exercise;
      }

      const renameNote =
        language === "en"
          ? "Exercise name standardized to approved catalog."
          : "Nombre estandarizado al catalogo aprobado.";

      return {
        ...exercise,
        name: resolved,
        notes: exercise.notes ? `${exercise.notes} ${renameNote}` : renameNote,
      };
    }),
  }));
};

const countHints = (value: string, hints: string[]): number => {
  const normalized = normalizeText(value);
  return hints.reduce((acc, hint) => {
    const regex = new RegExp(`\\b${hint}\\b`, "g");
    const matches = normalized.match(regex);
    return acc + (matches ? matches.length : 0);
  }, 0);
};

const shouldTranslatePlanToSpanish = (plan: TrainingDay[]): boolean => {
  const combined = plan
    .flatMap((day) => [
      day.day,
      day.focus,
      day.whyThisDay ?? "",
      ...(day.warmup ?? []).flatMap((block) => [block.title, block.instructions, block.why ?? ""]),
      ...day.exercises.flatMap((exercise) => [exercise.notes ?? "", exercise.why ?? ""]),
      ...(day.cooldown ?? []).flatMap((block) => [block.title, block.instructions, block.why ?? ""]),
    ])
    .join(" ");

  const englishScore = countHints(combined, ENGLISH_HINTS);
  const spanishScore = countHints(combined, SPANISH_HINTS);
  return englishScore >= 3 && englishScore > spanishScore;
};

const toSpanishDayAndFocus = (plan: TrainingDay[]): TrainingDay[] => {
  return plan.map((day, index) => {
    const normalizedFocus = normalizeText(day.focus);
    const translatedFocus = Object.entries({
      push: "Empuje",
      pull: "Traccion",
      legs: "Piernas",
      upper: "Tren Superior",
      lower: "Tren Inferior",
      conditioning: "Acondicionamiento",
      "squat core": "Sentadilla + Core",
      "bench push": "Banca + Empuje",
      "deadlift pull": "Peso Muerto + Traccion",
      "upper assistance": "Asistencia Superior",
      "lower assistance": "Asistencia Inferior",
      "power speed": "Potencia + Velocidad",
      "full body": "Cuerpo Completo",
      "cardio core": "Cardio + Core",
      mobility: "Movilidad",
      "recovery mobility": "Recuperacion + Movilidad",
      intervals: "Intervalos",
      threshold: "Umbral",
      "aerobic base": "Base Aerobica",
    }).find(([key]) => normalizedFocus.includes(key))?.[1];

    const normalizedDay = normalizeText(day.day);
    const dayMatch = normalizedDay.match(/^day\s*(\d+)$/);
    return {
      ...day,
      day: dayMatch ? `Dia ${dayMatch[1]}` : day.day || `Dia ${index + 1}`,
      focus: translatedFocus ?? day.focus,
    };
  });
};

const translatePlanTextToSpanish = async (
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  plan: TrainingDay[]
): Promise<TrainingDay[]> => {
  const prompt = `
Traduce al espanol profesional de medicina deportiva el siguiente plan JSON.
Reglas:
1. Traduce day, focus, whyThisDay, notes y why.
2. Conserva exactamente sets, reps, rest, rpe.
3. Mantien name sin cambios para no romper el mapeo tecnico de ejercicios.
4. Devuelve SOLO JSON array valido.

JSON:
${JSON.stringify(plan)}
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const translatedRaw = extractJsonArray(response.text());
  return toSafeTrainingDays(translatedRaw);
};

function toSafeTrainingDays(value: unknown): TrainingDay[] {
  return TrainingPlanSchema.parse(value);
}

function extractJsonArray(text: string): unknown {
  const stripped = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  const candidate = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
  return JSON.parse(candidate);
}

function createFallbackPlan(profile: PlanInput): TrainingDay[] {
  const trainingDays = Math.min(Math.max(Number(profile.trainingDays || 3), 1), 7);
  const isSpanish = profile.preferredLanguage !== "en";
  const focusTemplate = isSpanish ? focusByGoalEs[profile.goal] : focusByGoal[profile.goal];
  const exercisePool = baseExercisesByEquipment[profile.equipment];
  const intensity = intensityByGoal[profile.goal];
  const goalBenefit = goalBenefitByGoal[profile.goal];
  const goalBenefitEs = goalBenefitByGoalEs[profile.goal];
  const targetMinutes = profile.availableMinutesPerSession;

  let exercisesPerDay = 5;
  if (targetMinutes && targetMinutes <= 45) {
    exercisesPerDay = 3;
  } else if (targetMinutes && targetMinutes <= 65) {
    exercisesPerDay = 4;
  } else if (targetMinutes && targetMinutes >= 95) {
    exercisesPerDay = 6;
  }

  return Array.from({ length: trainingDays }, (_, index) => {
    const offset = (index * 2) % exercisePool.length;
    const exercises = Array.from({ length: exercisesPerDay }, (_, exerciseIndex) => {
      const exerciseName = exercisePool[(offset + exerciseIndex) % exercisePool.length];
      return {
        name: exerciseName,
        sets: intensity.sets,
        reps: intensity.reps,
        rpe: intensity.rpe,
        load: resolveExerciseLoadDisplay(
          {
            name: exerciseName,
            rpe: intensity.rpe,
          },
          isSpanish ? "es" : "en",
          "maintain"
        ),
        rest: intensity.rest,
        notes: profile.injuries
          ? (isSpanish
            ? `Respeta estas limitaciones: ${profile.injuries}. Deten el ejercicio si aparece dolor.`
            : `Respect limitations: ${profile.injuries}. Stop if pain appears.`)
          : (isSpanish ? "Tempo controlado y rango de movimiento completo." : "Controlled tempo and full range of motion."),
        why: isSpanish
          ? `${exerciseName} se selecciono para ${goalBenefitEs} en el enfoque ${focusTemplate[index % focusTemplate.length].toLowerCase()}.`
          : `${exerciseName} was selected to ${goalBenefit} for your ${focusTemplate[index % focusTemplate.length].toLowerCase()} focus.`,
      };
    });

    return {
      day: isSpanish ? `Dia ${index + 1}` : `Day ${index + 1}`,
      focus: focusTemplate[index % focusTemplate.length],
      whyThisDay: isSpanish
        ? `Esta sesion trabaja ${focusTemplate[index % focusTemplate.length].toLowerCase()} para ${goalBenefitEs}.${targetMinutes ? ` Planificada para ~${targetMinutes} minutos.` : ""}`
        : `This session targets ${focusTemplate[index % focusTemplate.length].toLowerCase()} to ${goalBenefit}.${targetMinutes ? ` Planned around ~${targetMinutes} minutes.` : ""}`,
      warmup: buildDefaultWarmup(isSpanish, profile.injuries),
      exercises,
      cooldown: buildDefaultCooldown(isSpanish, profile.injuries),
    };
  });
}

export async function generateTrainingPlan(profile: unknown): Promise<TrainingDay[]> {
  const validatedProfile = PlanInputSchema.parse(profile);
  const apiKey = resolveGenAiApiKey();
  const modelName = resolveGenAiModel();

  if (!apiKey) {
    console.warn("Gemini API key is missing. Falling back to template plan.");
    return createFallbackPlan(validatedProfile);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.5,
      responseMimeType: "application/json",
    },
  });
  const approvedExerciseNames = buildApprovedExerciseNames(validatedProfile.equipment);
  const approvedExerciseNamesPrompt = approvedExerciseNames.slice(0, 180).join(", ");

  const prompt = `
    You are a multidisciplinary performance-medical board composed of:
    - Sports medicine specialist (deportology)
    - Endocrinologist
    - Cardiologist
    - Physiotherapist
    - Clinical nutrition specialist
    - Strength & Conditioning coach

    Act as one unified expert team.
    Create a highly personalized, science-based training plan for the following athlete:

    **Athlete Profile:**
    - Age: ${validatedProfile.age}
    - Weight: ${validatedProfile.weight}kg
    - Height: ${validatedProfile.height ?? "N/A"}cm
    - Goal: ${validatedProfile.goal}
    - Experience: ${validatedProfile.experienceLevel ?? "beginner"}
    - Equipment Access: ${validatedProfile.equipment}
    - Training Frequency: ${validatedProfile.trainingDays} days/week
    - Injuries/Limitations: ${validatedProfile.injuries || 'None'}
    - Desired Start Date: ${validatedProfile.planStartDate ?? "As soon as possible"}
    - Available Time Per Session: ${validatedProfile.availableMinutesPerSession ? `${validatedProfile.availableMinutesPerSession} minutes` : "Not specified (choose ideal duration by objective)"}
    - Recent adherence score (last weeks): ${validatedProfile.recentAdherenceScore ?? "Unknown"}
    - Recent completed sessions: ${validatedProfile.recentCompletedSessions ?? "Unknown"} / ${validatedProfile.recentLoggedSessions ?? "Unknown logged"}

    **Guidelines:**
    1. **Safety First**: Strictly adjust for any listed injuries. If injuries are present, exclude contraindicated exercises and suggest rehab-friendly alternatives.
    2. **Evidence-Based**: Use optimal volume (10-20 hard sets/muscle/week for hypertrophy) and intensity logic suitable for the experience level.
    3. **Progression**: Include RPE (Rate of Perceived Exertion) guidelines.
    4. **Structure**: Organize strictly by "Day 1", "Day 2", etc., matching the requested frequency.
    5. **Education Priority**: Explain clinically WHY each exercise was prescribed and how it drives the athlete closer to their goal.
    6. **Sports Medicine Tone**: Sound like a sports medicine specialist, concise but specific.
    7. **Time Constraint Logic**: 
       - If Available Time Per Session is provided, fit the session to that duration.
       - If the time is below ideal for the goal, explicitly tell the user it is not ideal but still viable.
       - If no time is provided, assign the duration you consider necessary based on goal and safety.
       - Warm-up and cooldown must be included within total session time.

    8. **Language**: Write all descriptive text fields in ${validatedProfile.preferredLanguage === "en" ? "English" : "Spanish"}.
       You may keep standardized exercise names in English.
    9. **Adherence-Driven Progression**:
       - If adherence >= 85: increase weekly demand (slightly more sets/reps and +2.5-5% load progression).
       - If adherence 65-84: maintain progression conservatively.
       - If adherence < 65: deload (reduce sets/reps and recommend -5-10% load).
       - Explicitly reflect this in sets, reps, and load fields.
       - Do NOT use vague prescriptions like "65-75% 1RM" alone.
       - In the load field, always give a practical starting point: empty bar, lightest dumbbells, first machine pin, or bodyweight, then explain how to go up/down based on feel and target RPE.
    10. **Warm-up/Cooldown Specificity**:
       - Use specific drill names in warmup/cooldown blocks (avoid vague phrases).
       - Include at least one mobility drill and one activation drill in warmup.
       - Include breathing downregulation and targeted stretching in cooldown.
       - Keep the same clinical rationale quality as main exercises.
    11. **Exercise Naming Constraint (Critical)**:
       - In the "name" field, use ONLY exact exercise names from the approved list below.
       - Never invent exercise names, never output synonyms outside this list, never output translated names.
       - If uncertain, choose the closest approved name and keep progression in sets/reps/load.

    **Approved Exercise Names (${validatedProfile.equipment} equipment profile):**
    ${approvedExerciseNamesPrompt}

    **Output Format:**
    Return ONLY a valid JSON array of objects. Do not include markdown code blocks (like \`\`\`json). Just the raw JSON.
    Schema:
    [
      {
        "day": "Day 1",
        "focus": "Push (Chest/Shoulders/Triceps)",
        "whyThisDay": "How this day contributes to the weekly adaptation goal",
        "warmup": [
          {
            "title": "Mobility primer",
            "durationMinutes": 4,
            "instructions": "How to execute",
            "why": "Clinical reason"
          }
        ],
        "exercises": [
          {
            "name": "Exercise Name",
            "sets": "3",
            "reps": "8-12",
            "rpe": "8",
            "load": "Start with the minimum available load and adjust up or down until you reach RPE 8",
            "rest": "90s",
            "notes": "Focus on eccentric...",
            "why": "Clinical rationale linking this exercise to the user's goal and current limitations"
          }
        ],
        "cooldown": [
          {
            "title": "Breathing + stretch",
            "durationMinutes": 5,
            "instructions": "How to execute",
            "why": "Clinical reason"
          }
        ]
      }
    ]
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const rawPlan = extractJsonArray(text);
    let safePlan = toSafeTrainingDays(rawPlan);
    safePlan = ensureSessionPhases(
      safePlan,
      validatedProfile.preferredLanguage !== "en",
      validatedProfile.injuries
    );

    if (validatedProfile.preferredLanguage !== "en") {
      safePlan = toSpanishDayAndFocus(safePlan);
      if (shouldTranslatePlanToSpanish(safePlan)) {
        try {
          safePlan = await translatePlanTextToSpanish(model, safePlan);
          safePlan = ensureSessionPhases(safePlan, true, validatedProfile.injuries);
        } catch (translateError) {
          console.warn("Spanish translation post-process failed:", translateError);
        }
      }
    }

    safePlan = canonicalizePlanExerciseNames(
      safePlan,
      validatedProfile.equipment,
      validatedProfile.preferredLanguage === "en" ? "en" : "es"
    );

    return safePlan;
  } catch (error) {
    console.error("AI Generation Error:", error);
    return createFallbackPlan(validatedProfile);
  }
}
