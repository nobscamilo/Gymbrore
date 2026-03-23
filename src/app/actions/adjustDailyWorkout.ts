'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { TrainingDay, TrainingDaySchema, trimDayToAvailableMinutes } from '@/lib/trainingPlan';
import { resolveGenAiApiKey, resolveGenAiModel } from "@/lib/genai";
import { findCatalogExercise, getExerciseInsight, SupportedLanguage } from "@/lib/exerciseCatalog";
import { getExerciseDatabase } from "@/lib/exerciseDatabase";

const ProfileForAdjustmentSchema = z.object({
  age: z.coerce.number().min(10).max(100),
  weight: z.coerce.number().min(30).max(300),
  height: z.coerce.number().min(100).max(250).optional(),
  goal: z.enum(['hypertrophy', 'strength', 'endurance', 'weight_loss', 'maintenance']),
  equipment: z.enum(['gym', 'dumbbells', 'bodyweight']),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  injuries: z.string().max(400).optional(),
  preferredLanguage: z.enum(['es', 'en']).optional(),
});

const DailyAdjustmentInputSchema = z.object({
  profile: ProfileForAdjustmentSchema,
  day: TrainingDaySchema,
  pain: z.string().max(400).optional(),
  painLevel: z.coerce.number().min(0).max(10),
  sessionDate: z.string().optional(),
  availableMinutes: z.coerce.number().min(20).max(240).optional(),
});
type DailyAdjustmentInput = z.infer<typeof DailyAdjustmentInputSchema>;

type SessionBlock = NonNullable<TrainingDay["warmup"]>[number];

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
        why: "Prepara articulaciones y reduce rigidez antes de cargar.",
      },
      {
        title: "Activacion y aproximaciones",
        durationMinutes: 5,
        instructions: "Activa core y gluteos, luego realiza 1-2 series progresivas del primer ejercicio.",
        why: "Mejora control neuromuscular y calidad tecnica.",
      },
    ];
  }

  return [
    {
      title: "Joint mobility primer",
      durationMinutes: 4,
      instructions: `Mobilize ankles, hips, thoracic spine, and shoulders with control.${injuryNote}`.trim(),
      why: "Prepares joints and reduces stiffness before loading.",
    },
    {
      title: "Activation and ramp-up",
      durationMinutes: 5,
      instructions: "Activate core and glutes, then complete 1-2 progressive sets of the first main movement.",
      why: "Improves neuromuscular control and technical quality.",
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
        title: "Respiracion de recuperacion",
        durationMinutes: 2,
        instructions: "Respiracion diafragmatica lenta para bajar frecuencia cardiaca.",
        why: "Facilita recuperacion autonoma post-sesion.",
      },
      {
        title: "Estiramiento dirigido",
        durationMinutes: 4,
        instructions: `Estira musculos trabajados 20-30 segundos por grupo muscular.${injuryNote}`.trim(),
        why: "Disminuye tension residual y mejora recuperacion funcional.",
      },
    ];
  }

  return [
    {
      title: "Recovery breathing",
      durationMinutes: 2,
      instructions: "Use slow diaphragmatic breathing to decrease heart rate.",
      why: "Supports post-session autonomic recovery.",
    },
    {
      title: "Targeted stretching",
      durationMinutes: 4,
      instructions: `Stretch trained muscles for 20-30 seconds each.${injuryNote}`.trim(),
      why: "Reduces residual tension and improves functional recovery.",
    },
  ];
};

const ensureDaySessionPhases = (day: TrainingDay, isSpanish: boolean, injuries?: string): TrainingDay => {
  return {
    ...day,
    warmup: day.warmup && day.warmup.length > 0 ? day.warmup : buildDefaultWarmup(isSpanish, injuries),
    cooldown: day.cooldown && day.cooldown.length > 0 ? day.cooldown : buildDefaultCooldown(isSpanish, injuries),
  };
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
  availableEquipment: DailyAdjustmentInput["profile"]["equipment"]
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

const buildApprovedExerciseNames = (
  equipment: DailyAdjustmentInput["profile"]["equipment"]
): string[] => {
  const database = getExerciseDatabase("en");
  const unique = new Set<string>();

  database.forEach((option) => {
    const insight = getExerciseInsight(option.canonicalName, "en");
    if (isExerciseCompatibleWithEquipment(insight.equipment, equipment)) {
      unique.add(option.canonicalName);
    }
  });

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

const canonicalizeDayExerciseNames = (
  day: TrainingDay,
  equipment: DailyAdjustmentInput["profile"]["equipment"],
  language: SupportedLanguage
): TrainingDay => {
  const approvedNames = buildApprovedExerciseNames(equipment);
  const fallbackName =
    approvedNames.find((name) => normalizeText(name) === "plank") ??
    approvedNames[0] ??
    "Plank";

  return {
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
  };
};

const countHints = (value: string, hints: string[]): number => {
  const normalized = normalizeText(value);
  return hints.reduce((acc, hint) => {
    const regex = new RegExp(`\\b${hint}\\b`, "g");
    const matches = normalized.match(regex);
    return acc + (matches ? matches.length : 0);
  }, 0);
};

const shouldTranslateDayToSpanish = (day: TrainingDay): boolean => {
  const combined = [
    day.day,
    day.focus,
    day.whyThisDay ?? "",
    ...(day.warmup ?? []).flatMap((block) => [block.title, block.instructions, block.why ?? ""]),
    ...day.exercises.flatMap((exercise) => [exercise.notes ?? "", exercise.why ?? ""]),
    ...(day.cooldown ?? []).flatMap((block) => [block.title, block.instructions, block.why ?? ""]),
  ].join(" ");

  const englishScore = countHints(combined, ENGLISH_HINTS);
  const spanishScore = countHints(combined, SPANISH_HINTS);
  return englishScore >= 3 && englishScore > spanishScore;
};

const toSpanishDayLabel = (value: string): string => {
  const normalized = normalizeText(value);
  const dayMatch = normalized.match(/^day\s*(\d+)$/);
  if (dayMatch) {
    return `Dia ${dayMatch[1]}`;
  }
  return value;
};

const translateDayTextToSpanish = async (
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  day: TrainingDay
): Promise<TrainingDay> => {
  const prompt = `
Traduce al espanol profesional de medicina deportiva el siguiente dia de entrenamiento en JSON.
Reglas:
1. Traduce day, focus, whyThisDay, notes y why.
2. Conserva exactamente sets, reps, rest, rpe.
3. Mantien name sin cambios.
4. Devuelve SOLO un objeto JSON valido.

JSON:
${JSON.stringify(day)}
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const raw = extractJsonObject(response.text());
  return TrainingDaySchema.parse(raw);
};

const recommendedMinutesByGoal: Record<DailyAdjustmentInput["profile"]["goal"], number> = {
  hypertrophy: 75,
  strength: 80,
  endurance: 70,
  weight_loss: 60,
  maintenance: 55,
};

const applyFallbackReplacement = (
  exerciseName: string,
  painText: string,
  equipment: DailyAdjustmentInput["profile"]["equipment"]
): string => {
  const normalizedName = exerciseName.toLowerCase();
  const normalizedPain = painText.toLowerCase();

  if (normalizedPain.includes("knee")) {
    if (normalizedName.includes("squat") || normalizedName.includes("lunge")) {
      return equipment === "bodyweight" ? "Supported Split Squat (Pain-Free Range)" : "Box Squat (Pain-Free Range)";
    }
    if (normalizedName.includes("leg press")) {
      return "Step-Up (Low Box, Controlled Tempo)";
    }
  }

  if (normalizedPain.includes("shoulder")) {
    if (normalizedName.includes("press") || normalizedName.includes("push")) {
      return equipment === "gym" ? "Landmine Press" : "Neutral-Grip Floor Press";
    }
  }

  if (normalizedPain.includes("back")) {
    if (normalizedName.includes("deadlift") || normalizedName.includes("row")) {
      return equipment === "gym" ? "Chest-Supported Row" : "Bird Dog Row";
    }
    if (normalizedName.includes("squat")) {
      return "Goblet Box Squat";
    }
  }

  return exerciseName;
};

const createFallbackAdjustedDay = (input: DailyAdjustmentInput): TrainingDay => {
  const painSummary = input.pain && input.pain.trim().length > 0 ? input.pain.trim() : "no specific pain reported";
  const isSpanish = input.profile.preferredLanguage !== "en";
  const adjustedExercises = input.day.exercises.map((exercise) => {
    const adjustedName = applyFallbackReplacement(exercise.name, painSummary, input.profile.equipment);
    const conservativeLoad =
      input.painLevel >= 7
        ? (isSpanish ? "Reducir carga 10-15% hoy" : "Reduce load 10-15% today")
        : input.painLevel >= 4
          ? (isSpanish ? "Reducir carga 5-10% hoy" : "Reduce load 5-10% today")
          : (isSpanish ? "Mantener carga si la tecnica es estable" : "Maintain load if technique is stable");

    return {
      ...exercise,
      name: adjustedName,
      load: exercise.load && exercise.load.trim().length > 0 ? exercise.load : conservativeLoad,
      notes: isSpanish
        ? `Ajustado para hoy (${painSummary}, dolor ${input.painLevel}/10). Mantente en rango sin dolor y detente si aumentan los sintomas.`
        : `Adjusted for today (${painSummary}, pain ${input.painLevel}/10). Keep movement pain-free and stop if symptoms increase.`,
      why: isSpanish
        ? `Esta variacion mantiene el estimulo reduciendo carga en tejidos sensibles para progresar de forma segura hacia ${input.profile.goal}.`
        : `This variation keeps the training stimulus while reducing stress on sensitive tissues so you can progress safely toward ${input.profile.goal}.`,
    };
  });

  const adjustedDay: TrainingDay = {
    ...input.day,
    day: isSpanish ? toSpanishDayLabel(input.day.day) : input.day.day,
    whyThisDay: isSpanish
      ? `Esta sesion se ajusto para manejar ${painSummary} y conservar el estimulo especifico del objetivo (${input.profile.goal}).`
      : `This session was adjusted to manage ${painSummary} while preserving goal-specific stimulus (${input.profile.goal}).`,
    exercises: adjustedExercises,
  };

  if (input.availableMinutes) {
    const trimmedDay = trimDayToAvailableMinutes(adjustedDay, input.availableMinutes);
    const recommended = recommendedMinutesByGoal[input.profile.goal];
    const belowIdeal = input.availableMinutes < recommended;

    const safeTrimmed = ensureDaySessionPhases({
      ...trimmedDay,
      whyThisDay: `${trimmedDay.whyThisDay ?? ""} ${belowIdeal
        ? (isSpanish
          ? `Nota: ${input.availableMinutes} minutos no es lo ideal para ${input.profile.goal}, pero sigue siendo viable hoy.`
          : `Note: ${input.availableMinutes} minutes is not ideal for ${input.profile.goal}, but still viable today.`)
        : ""}`.trim(),
    }, isSpanish, input.profile.injuries);

    return canonicalizeDayExerciseNames(
      safeTrimmed,
      input.profile.equipment,
      input.profile.preferredLanguage === "en" ? "en" : "es"
    );
  }

  const safeAdjusted = ensureDaySessionPhases(adjustedDay, isSpanish, input.profile.injuries);
  return canonicalizeDayExerciseNames(
    safeAdjusted,
    input.profile.equipment,
    input.profile.preferredLanguage === "en" ? "en" : "es"
  );
};

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

export async function adjustDailyWorkoutForPain(input: {
  profile: unknown;
  day: TrainingDay;
  pain?: string;
  painLevel: number;
  sessionDate?: string;
  availableMinutes?: number;
}): Promise<TrainingDay> {
  const validated = DailyAdjustmentInputSchema.parse(input);
  const apiKey = resolveGenAiApiKey();
  const modelName = resolveGenAiModel();

  if (!apiKey) {
    return createFallbackAdjustedDay(validated);
  }

  const painSummary = validated.pain && validated.pain.trim().length > 0 ? validated.pain.trim() : "No additional pain";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });
  const approvedExerciseNames = buildApprovedExerciseNames(validated.profile.equipment);
  const approvedExerciseNamesPrompt = approvedExerciseNames.slice(0, 180).join(", ");

  const prompt = `
    You are a unified multidisciplinary team:
    - Sports medicine specialist (deportology)
    - Endocrinologist
    - Cardiologist
    - Physiotherapist
    - Clinical nutrition specialist

    Adjust a single workout session based on today's pain report.
    Keep the athlete progressing toward the goal while reducing risk.

    Athlete:
    - Goal: ${validated.profile.goal}
    - Experience: ${validated.profile.experienceLevel ?? "beginner"}
    - Equipment: ${validated.profile.equipment}
    - Injuries history: ${validated.profile.injuries ?? "None reported"}
    - Session date: ${validated.sessionDate ?? "today"}
    - Available time today: ${validated.availableMinutes ? `${validated.availableMinutes} minutes` : "Not specified"}
    - Preferred language: ${validated.profile.preferredLanguage === "en" ? "English" : "Spanish"}

    Today's symptoms:
    - Pain level: ${validated.painLevel}/10
    - Pain details: ${painSummary}

    Current day plan JSON:
    ${JSON.stringify(validated.day)}

    Instructions:
    1. Return a modified day object with safer alternatives if needed.
    2. Keep session effective for the stated goal.
    3. Explain WHY each exercise is still useful for goal progress despite modifications.
    4. Include a clear whyThisDay explanation.
    5. Avoid contraindicated moves if pain suggests risk.
    6. If available time is provided, fit the session to that time.
    7. If available time is below ideal for the goal, explicitly state it is not ideal but still viable.
    8. Preserve and adapt warmup/cooldown blocks for pain-aware execution.
    9. Adjust load recommendations (weight/intensity) based on pain and keep the session safe.
    10. Write all text fields in ${validated.profile.preferredLanguage === "en" ? "English" : "Spanish"}.
    11. In "name", use ONLY exact names from the approved exercise list below.
    12. Never invent names, never output translated name variants.

    Approved exercise names (${validated.profile.equipment} profile):
    ${approvedExerciseNamesPrompt}

    Output schema (JSON object only):
    {
      "day": "Day X",
      "focus": "Focus",
      "whyThisDay": "Clinical rationale",
      "warmup": [
        {
          "title": "Mobility primer",
          "durationMinutes": 4,
          "instructions": "Pain-aware instructions",
          "why": "Clinical reason"
        }
      ],
      "exercises": [
        {
          "name": "Exercise",
          "sets": "3",
          "reps": "8-12",
          "rpe": "7-8",
          "load": "55-65% 1RM or -10% today",
          "rest": "60-90s",
          "notes": "Pain-aware coaching cue",
          "why": "How this exercise drives progress toward goal"
        }
      ],
      "cooldown": [
        {
          "title": "Downregulation",
          "durationMinutes": 4,
          "instructions": "Pain-aware instructions",
          "why": "Clinical reason"
        }
      ]
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const raw = extractJsonObject(text);
    let parsed = TrainingDaySchema.parse(raw);
    parsed = ensureDaySessionPhases(parsed, validated.profile.preferredLanguage !== "en", validated.profile.injuries);

    if (validated.profile.preferredLanguage !== "en") {
      parsed = {
        ...parsed,
        day: toSpanishDayLabel(parsed.day),
      };

      if (shouldTranslateDayToSpanish(parsed)) {
        try {
          parsed = await translateDayTextToSpanish(model, parsed);
          parsed = ensureDaySessionPhases(parsed, true, validated.profile.injuries);
        } catch (translateError) {
          console.warn("Daily translation post-process failed:", translateError);
        }
      }
    }

    return canonicalizeDayExerciseNames(
      parsed,
      validated.profile.equipment,
      validated.profile.preferredLanguage === "en" ? "en" : "es"
    );
  } catch (error) {
    console.error("Daily pain adjustment failed:", error);
    return createFallbackAdjustedDay(validated);
  }
}
