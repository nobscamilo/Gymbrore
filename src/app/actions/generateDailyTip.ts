'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { resolveGenAiApiKey, resolveGenAiModel } from "@/lib/genai";

const DailyTipInputSchema = z.object({
  goal: z.enum(['hypertrophy', 'strength', 'endurance', 'weight_loss', 'maintenance']),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  preferredLanguage: z.enum(['es', 'en']).optional(),
  injuries: z.string().max(400).optional(),
  availableMinutesPerSession: z.coerce.number().min(20).max(240).optional(),
});

type DailyTipInput = z.infer<typeof DailyTipInputSchema>;

const fallbackTips: Record<
  DailyTipInput["goal"],
  { en: string[]; es: string[] }
> = {
  hypertrophy: {
    en: [
      "Prioritize a controlled eccentric (2-3s) to improve mechanical tension without extra load.",
      "Keep 1-2 reps in reserve on most sets to sustain weekly volume quality.",
      "Protein target near 1.6-2.2 g/kg/day helps support muscle gain recovery."
    ],
    es: [
      "Prioriza una fase excéntrica controlada (2-3s) para aumentar tension mecanica sin mas carga.",
      "Deja 1-2 repeticiones en reserva en la mayoria de series para sostener calidad semanal.",
      "Un objetivo de proteina cercano a 1.6-2.2 g/kg/dia ayuda a recuperacion para ganar masa."
    ],
  },
  strength: {
    en: [
      "Use longer rest (2-3 min) on main lifts to preserve force output.",
      "Keep bar path consistent rep to rep before increasing load.",
      "Track RPE honestly; strength improves faster when fatigue is managed."
    ],
    es: [
      "Usa descansos mas largos (2-3 min) en levantamientos principales para mantener fuerza.",
      "Mantien trayectoria de la barra consistente antes de subir carga.",
      "Registra RPE con honestidad; la fuerza mejora mas rapido con fatiga bien gestionada."
    ],
  },
  endurance: {
    en: [
      "Most weekly volume should stay easy-moderate to protect quality in hard sessions.",
      "Progress total duration gradually (about 5-10% weekly) to reduce overload risk.",
      "Fuel sessions longer than 60 minutes to sustain output and technique."
    ],
    es: [
      "La mayor parte del volumen semanal debe ser facil-moderado para proteger sesiones duras.",
      "Progresa duracion total de forma gradual (5-10% semanal) para reducir riesgo de sobrecarga.",
      "Alimenta sesiones mayores de 60 minutos para sostener rendimiento y tecnica."
    ],
  },
  weight_loss: {
    en: [
      "Keep most cardio in Zone 2 heart rate to increase sustainable fat oxidation.",
      "Preserve 2-3 weekly strength sessions to protect lean mass during caloric deficit.",
      "Daily NEAT (steps) often impacts fat loss as much as formal cardio."
    ],
    es: [
      "Mantien la mayor parte del cardio en Zona 2 de FC para favorecer oxidacion de grasa sostenible.",
      "Conserva 2-3 sesiones de fuerza por semana para proteger masa magra en deficit calorico.",
      "El NEAT diario (pasos) suele impactar la perdida de grasa tanto como el cardio formal."
    ],
  },
  maintenance: {
    en: [
      "Consistency beats intensity spikes; prioritize adherence across the week.",
      "Use mobility on low-load days to preserve joint range and movement quality.",
      "Keep one key lift per pattern to retain strength with minimal time cost."
    ],
    es: [
      "La constancia supera picos de intensidad; prioriza adherencia semanal.",
      "Usa movilidad en dias de baja carga para mantener rango articular y calidad de movimiento.",
      "Mantien un levantamiento clave por patron para conservar fuerza con poco tiempo."
    ],
  },
};

export async function generateDailyExpertTip(input: unknown): Promise<string> {
  const validated = DailyTipInputSchema.parse(input);
  const language = validated.preferredLanguage === "en" ? "en" : "es";
  const apiKey = resolveGenAiApiKey();
  const modelName = resolveGenAiModel();

  const fallbackPool = fallbackTips[validated.goal][language];
  const fallback = fallbackPool[new Date().getDate() % fallbackPool.length];

  if (!apiKey) {
    return fallback;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.45,
    },
  });

  const prompt = `
You are a unified multidisciplinary expert team:
- Sports medicine specialist (deportology)
- Endocrinologist
- Cardiologist
- Physiotherapist
- Clinical nutrition specialist
- Performance coach

Create exactly one short daily expert tip for this athlete.

Athlete profile:
- Goal: ${validated.goal}
- Experience level: ${validated.experienceLevel ?? "beginner"}
- Injuries/limitations: ${validated.injuries ?? "None"}
- Session time: ${validated.availableMinutesPerSession ? `${validated.availableMinutesPerSession} minutes` : "Not specified"}
- Preferred language: ${language === "en" ? "English" : "Spanish"}

Rules:
1. 1 sentence only (max 24 words).
2. Practical and specific.
3. Safe for listed limitations.
4. No emojis, no hashtags.
5. Output only the tip text in ${language === "en" ? "English" : "Spanish"}.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().replace(/\s+/g, " ").trim();
    if (!text) {
      return fallback;
    }
    return text;
  } catch (error) {
    console.error("Daily tip generation failed:", error);
    return fallback;
  }
}
