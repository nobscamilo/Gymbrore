import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GOOGLE_GENAI_API_KEY = defineSecret("GOOGLE_GENAI_API_KEY");
const ALLOWED_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-pro-latest",
  "gemini-2.5-pro",
]);

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const DAY_MS = 24 * 60 * 60 * 1000;

const focusByGoal = {
  hypertrophy: ["Push", "Pull", "Legs", "Upper", "Lower", "Push", "Conditioning"],
  strength: ["Squat + Core", "Bench + Push", "Deadlift + Pull", "Upper Assistance", "Lower Assistance", "Power + Speed", "Conditioning"],
  endurance: ["Aerobic Base", "Threshold", "Tempo + Core", "Intervals", "Recovery + Mobility", "Mixed Conditioning", "Long Session"],
  weight_loss: ["Full Body A", "Conditioning", "Full Body B", "Cardio + Core", "Full Body C", "HIIT", "Mobility + Walk"],
  maintenance: ["Upper", "Lower", "Conditioning", "Full Body", "Upper", "Lower", "Mobility"],
};

const focusByGoalEs = {
  hypertrophy: ["Empuje", "Traccion", "Piernas", "Tren Superior", "Tren Inferior", "Empuje", "Acondicionamiento"],
  strength: ["Sentadilla + Core", "Banca + Empuje", "Peso Muerto + Traccion", "Asistencia Superior", "Asistencia Inferior", "Potencia + Velocidad", "Acondicionamiento"],
  endurance: ["Base Aerobica", "Umbral", "Tempo + Core", "Intervalos", "Recuperacion + Movilidad", "Acondicionamiento Mixto", "Sesion Larga"],
  weight_loss: ["Cuerpo Completo A", "Acondicionamiento", "Cuerpo Completo B", "Cardio + Core", "Cuerpo Completo C", "HIIT", "Movilidad + Caminata"],
  maintenance: ["Tren Superior", "Tren Inferior", "Acondicionamiento", "Cuerpo Completo", "Tren Superior", "Tren Inferior", "Movilidad"],
};

const baseExercisesByEquipment = {
  gym: [
    "Back Squat",
    "Romanian Deadlift",
    "Bench Press",
    "Incline Dumbbell Press",
    "Seated Cable Row",
    "Lat Pulldown",
    "Overhead Press",
    "Leg Press",
    "Face Pull",
    "Plank",
  ],
  dumbbells: [
    "Goblet Squat",
    "Dumbbell Romanian Deadlift",
    "Dumbbell Floor Press",
    "One-Arm Dumbbell Row",
    "Dumbbell Shoulder Press",
    "Reverse Lunge",
    "Dumbbell Hip Thrust",
    "Dumbbell Lateral Raise",
    "Dead Bug",
    "Side Plank",
  ],
  bodyweight: [
    "Bodyweight Squat",
    "Split Squat",
    "Push-Up",
    "Pike Push-Up",
    "Inverted Row",
    "Glute Bridge",
    "Single-Leg Romanian Deadlift",
    "Mountain Climbers",
    "Dead Bug",
    "Plank",
  ],
};

const intensityByGoal = {
  hypertrophy: { sets: "3-4", reps: "8-12", rest: "60-90s", rpe: "7-8" },
  strength: { sets: "4-5", reps: "3-6", rest: "2-3m", rpe: "8-9" },
  endurance: { sets: "2-4", reps: "12-20", rest: "30-60s", rpe: "6-7" },
  weight_loss: { sets: "3-4", reps: "10-15", rest: "30-60s", rpe: "7-8" },
  maintenance: { sets: "2-3", reps: "8-12", rest: "60-90s", rpe: "6-7" },
};

const goalBenefitByGoal = {
  hypertrophy: "maximize mechanical tension and weekly volume to build muscle mass",
  strength: "improve neural efficiency and force production in compound lifts",
  endurance: "increase aerobic and muscular endurance while controlling fatigue",
  weight_loss: "increase total energy expenditure while preserving lean mass",
  maintenance: "maintain strength and conditioning with efficient weekly stimulus",
};

const goalBenefitByGoalEs = {
  hypertrophy: "maximizar la tension mecanica y el volumen semanal para ganar masa muscular",
  strength: "mejorar la eficiencia neural y la produccion de fuerza en levantamientos compuestos",
  endurance: "aumentar la resistencia aerobica y muscular controlando la fatiga",
  weight_loss: "incrementar el gasto energetico preservando masa magra",
  maintenance: "mantener fuerza y condicion fisica con un estimulo semanal eficiente",
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

const safeNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const normalizeText = (value) => {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const countHints = (value, hints) => {
  const normalized = normalizeText(value);
  return hints.reduce((acc, hint) => {
    const regex = new RegExp(`\\b${hint}\\b`, "g");
    const matches = normalized.match(regex);
    return acc + (matches ? matches.length : 0);
  }, 0);
};

const shouldTranslatePlanToSpanish = (plan) => {
  const combined = plan
    .flatMap((day) => [
      day.day,
      day.focus,
      day.whyThisDay || "",
      ...(Array.isArray(day.warmup)
        ? day.warmup.flatMap((block) => [block.title || "", block.instructions || "", block.why || ""])
        : []),
      ...(Array.isArray(day.exercises)
        ? day.exercises.flatMap((exercise) => [exercise.notes || "", exercise.why || ""])
        : []),
      ...(Array.isArray(day.cooldown)
        ? day.cooldown.flatMap((block) => [block.title || "", block.instructions || "", block.why || ""])
        : []),
    ])
    .join(" ");

  const englishScore = countHints(combined, ENGLISH_HINTS);
  const spanishScore = countHints(combined, SPANISH_HINTS);
  return englishScore >= 3 && englishScore > spanishScore;
};

const toSpanishDayAndFocus = (plan) => {
  const focusMap = {
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
  };

  return plan.map((day, index) => {
    const normalizedFocus = normalizeText(day.focus);
    const translatedFocus = Object.entries(focusMap).find(([key]) => normalizedFocus.includes(key))?.[1];
    const normalizedDay = normalizeText(day.day);
    const dayMatch = normalizedDay.match(/^day\s*(\d+)$/);

    return {
      ...day,
      day: dayMatch ? `Dia ${dayMatch[1]}` : (day.day || `Dia ${index + 1}`),
      focus: translatedFocus || day.focus,
    };
  });
};

const normalizeProfile = (raw) => {
  const goal = raw.goal in focusByGoal ? raw.goal : "maintenance";
  const equipment = raw.equipment in baseExercisesByEquipment ? raw.equipment : "gym";
  const trainingDays = Math.min(Math.max(Math.round(safeNumber(raw.trainingDays, 3)), 1), 7);
  const availableMinutesPerSession = raw.availableMinutesPerSession
    ? Math.min(Math.max(Math.round(safeNumber(raw.availableMinutesPerSession, 60)), 20), 240)
    : undefined;

  return {
    age: safeNumber(raw.age, 30),
    weight: safeNumber(raw.weight, 75),
    height: raw.height ? safeNumber(raw.height, 170) : undefined,
    goal,
    equipment,
    experienceLevel: raw.experienceLevel || "beginner",
    injuries: typeof raw.injuries === "string" ? raw.injuries : "",
    trainingDays,
    planStartDate: raw.planStartDate || undefined,
    availableMinutesPerSession,
    preferredLanguage: raw.preferredLanguage === "en" ? "en" : "es",
  };
};

const buildDefaultWarmup = (isSpanish, injuries) => {
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
        why: "Prepara el sistema neuromuscular para entrenar con mejor tecnica.",
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

const buildDefaultCooldown = (isSpanish, injuries) => {
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

const ensureSessionPhases = (plan, isSpanish, injuries) => {
  return plan.map((day) => ({
    ...day,
    warmup: Array.isArray(day.warmup) && day.warmup.length > 0 ? day.warmup : buildDefaultWarmup(isSpanish, injuries),
    cooldown: Array.isArray(day.cooldown) && day.cooldown.length > 0 ? day.cooldown : buildDefaultCooldown(isSpanish, injuries),
  }));
};

const createFallbackPlan = (profile) => {
  const trainingDays = profile.trainingDays;
  const isSpanish = profile.preferredLanguage !== "en";
  const focusTemplate = isSpanish ? focusByGoalEs[profile.goal] : focusByGoal[profile.goal];
  const exercisePool = baseExercisesByEquipment[profile.equipment];
  const intensity = intensityByGoal[profile.goal];
  const goalBenefit = goalBenefitByGoal[profile.goal];
  const goalBenefitEs = goalBenefitByGoalEs[profile.goal];

  let exercisesPerDay = 5;
  if (profile.availableMinutesPerSession && profile.availableMinutesPerSession <= 45) {
    exercisesPerDay = 3;
  } else if (profile.availableMinutesPerSession && profile.availableMinutesPerSession <= 65) {
    exercisesPerDay = 4;
  } else if (profile.availableMinutesPerSession && profile.availableMinutesPerSession >= 95) {
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
        ? `Esta sesion trabaja ${focusTemplate[index % focusTemplate.length].toLowerCase()} para ${goalBenefitEs}.${profile.availableMinutesPerSession ? ` Planificada para ~${profile.availableMinutesPerSession} minutos.` : ""}`
        : `This session targets ${focusTemplate[index % focusTemplate.length].toLowerCase()} to ${goalBenefit}.${profile.availableMinutesPerSession ? ` Planned around ~${profile.availableMinutesPerSession} minutes.` : ""}`,
      warmup: buildDefaultWarmup(isSpanish, profile.injuries),
      exercises,
      cooldown: buildDefaultCooldown(isSpanish, profile.injuries),
    };
  });
};

const parseJsonArray = (text) => {
  const stripped = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  const candidate = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
  return JSON.parse(candidate);
};

const toSafePlan = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Generated plan is not a valid array");
  }

  return value.map((day, index) => {
    const exercises = Array.isArray(day.exercises) ? day.exercises : [];
    if (exercises.length === 0) {
      throw new Error(`Day ${index + 1} has no exercises`);
    }

    const parsePhaseBlocks = (blocks) => {
      if (!Array.isArray(blocks) || blocks.length === 0) {
        return undefined;
      }

      const sanitized = blocks
        .map((block) => ({
          title: String(block?.title || "").trim(),
          durationMinutes: Math.min(Math.max(Math.round(safeNumber(block?.durationMinutes, 0)), 1), 30),
          instructions: String(block?.instructions || "").trim(),
          why: block?.why ? String(block.why) : undefined,
        }))
        .filter((block) => block.title.length > 0 && block.instructions.length > 0);

      return sanitized.length > 0 ? sanitized : undefined;
    };

    return {
      day: String(day.day || `Day ${index + 1}`),
      focus: String(day.focus || "General"),
      whyThisDay: day.whyThisDay ? String(day.whyThisDay) : undefined,
      warmup: parsePhaseBlocks(day.warmup),
      exercises: exercises.map((exercise) => ({
        name: String(exercise.name || "Exercise"),
        sets: String(exercise.sets || "3"),
        reps: String(exercise.reps || "8-12"),
        rpe: exercise.rpe ? String(exercise.rpe) : undefined,
        rest: String(exercise.rest || "60-90s"),
        notes: exercise.notes ? String(exercise.notes) : undefined,
        why: exercise.why ? String(exercise.why) : undefined,
      })),
      cooldown: parsePhaseBlocks(day.cooldown),
    };
  });
};

const translatePlanTextToSpanish = async (model, plan) => {
  const prompt = `
Traduce al espanol profesional de medicina deportiva el siguiente plan JSON.
Reglas:
1. Traduce day, focus, whyThisDay, notes y why.
2. Conserva exactamente sets, reps, rest, rpe.
3. Mantien name sin cambios para conservar el catalogo de ejercicios.
4. Devuelve SOLO JSON array valido.

JSON:
${JSON.stringify(plan)}
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const translatedRaw = parseJsonArray(response.text());
  return toSafePlan(translatedRaw);
};

const generateTrainingPlanWithAi = async (rawProfile, apiKey) => {
  const profile = normalizeProfile(rawProfile);
  if (!apiKey) {
    return createFallbackPlan(profile);
  }

  const preferredModel = process.env.GOOGLE_GENAI_MODEL || "gemini-2.0-flash";
  const modelName = ALLOWED_MODELS.has(preferredModel) ? preferredModel : "gemini-2.0-flash";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.5,
      responseMimeType: "application/json",
    },
  });

  const prompt = `
Act as a world-class Sports Medicine Doctor and Strength & Conditioning Coach.
Create a personalized, science-based weekly training plan.

Athlete Profile:
- Age: ${profile.age}
- Weight: ${profile.weight}kg
- Height: ${profile.height ?? "N/A"}cm
- Goal: ${profile.goal}
- Experience: ${profile.experienceLevel}
- Equipment Access: ${profile.equipment}
- Training Frequency: ${profile.trainingDays} days/week
- Injuries/Limitations: ${profile.injuries || "None"}
- Desired Start Date: ${profile.planStartDate ?? "As soon as possible"}
- Available Time Per Session: ${profile.availableMinutesPerSession ? `${profile.availableMinutesPerSession} minutes` : "Not specified (choose ideal duration by objective)"}
- Preferred language: ${profile.preferredLanguage === "en" ? "English" : "Spanish"}

Guidelines:
1. Safety first for injuries/limitations.
2. Include evidence-based set/rep/rest and RPE.
3. Explain WHY each exercise contributes toward the user's goal.
4. If time is constrained and below ideal, say it is not ideal but still viable.
5. Include warmup (mobility/activation) and cooldown (downregulation/stretching) in each day.
6. Warmup + cooldown must be included in total session time.
7. Write all text fields in ${profile.preferredLanguage === "en" ? "English" : "Spanish"}.
8. Return only JSON array in this format:
[
  {
    "day": "Day 1",
    "focus": "Push",
    "whyThisDay": "...",
    "warmup": [
      {
        "title": "Mobility primer",
        "durationMinutes": 4,
        "instructions": "...",
        "why": "..."
      }
    ],
    "exercises": [
      {
        "name": "Exercise Name",
        "sets": "3",
        "reps": "8-12",
        "rpe": "8",
        "rest": "90s",
        "notes": "...",
        "why": "..."
      }
    ],
    "cooldown": [
      {
        "title": "Breathing + stretch",
        "durationMinutes": 4,
        "instructions": "...",
        "why": "..."
      }
    ]
  }
]
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawPlan = parseJsonArray(response.text());
    let safePlan = toSafePlan(rawPlan);
    safePlan = ensureSessionPhases(safePlan, profile.preferredLanguage !== "en", profile.injuries);

    if (profile.preferredLanguage !== "en") {
      safePlan = toSpanishDayAndFocus(safePlan);
      if (shouldTranslatePlanToSpanish(safePlan)) {
        try {
          safePlan = await translatePlanTextToSpanish(model, safePlan);
          safePlan = ensureSessionPhases(safePlan, true, profile.injuries);
        } catch (translateError) {
          logger.warn("Scheduler translation post-process failed", translateError);
        }
      }
    }

    return safePlan;
  } catch (error) {
    logger.error("AI generation failed in scheduler. Falling back.", error);
    return createFallbackPlan(profile);
  }
};

const shouldSkipProfile = (profile) => {
  return !profile || !profile.goal || !profile.equipment || !profile.trainingDays;
};

export const weeklyAutoRefreshPlans = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "Etc/UTC",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 540,
    secrets: [GOOGLE_GENAI_API_KEY],
  },
  async () => {
    const thresholdIso = new Date(Date.now() - 7 * DAY_MS).toISOString();
    const apiKey = GOOGLE_GENAI_API_KEY.value();

    logger.info("weeklyAutoRefreshPlans started", { thresholdIso });

    const querySnapshot = await db
      .collection("users")
      .where("autoWeeklyRefresh", "==", true)
      .where("currentPlanGeneratedAt", "<=", thresholdIso)
      .get();

    if (querySnapshot.empty) {
      logger.info("weeklyAutoRefreshPlans: no stale users found");
      return;
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const doc of querySnapshot.docs) {
      const profile = doc.data();

      if (shouldSkipProfile(profile)) {
        skipped += 1;
        continue;
      }

      try {
        const plan = await generateTrainingPlanWithAi(profile, apiKey);
        const generatedAt = new Date().toISOString();

        await doc.ref.set(
          {
            currentPlan: JSON.stringify(plan),
            currentPlanGeneratedAt: generatedAt,
            currentPlanAcceptedAt: "",
            dailyAdjustments: "{}",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        processed += 1;
      } catch (error) {
        failed += 1;
        logger.error(`Failed to refresh plan for user ${doc.id}`, error);
      }
    }

    logger.info("weeklyAutoRefreshPlans finished", {
      scanned: querySnapshot.size,
      processed,
      skipped,
      failed,
    });
  }
);
