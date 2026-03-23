import { SupportedLanguage } from "@/lib/exerciseCatalog";

const ENGLISH_HINTS = [
  "the",
  "this",
  "session",
  "exercise",
  "for",
  "with",
  "and",
  "was",
  "selected",
  "targets",
  "focus",
  "rest",
  "sets",
  "reps",
];

const SPANISH_HINTS = [
  "el",
  "la",
  "sesion",
  "ejercicio",
  "para",
  "con",
  "y",
  "selecciono",
  "enfoque",
  "descanso",
  "series",
  "repeticiones",
];

const normalize = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const countHints = (value: string, hints: string[]): number => {
  const normalized = normalize(value);
  return hints.reduce((acc, hint) => {
    const regex = new RegExp(`\\b${hint}\\b`, "g");
    const matches = normalized.match(regex);
    return acc + (matches ? matches.length : 0);
  }, 0);
};

export const looksMostlyEnglish = (value: string): boolean => {
  if (!value.trim()) {
    return false;
  }
  const englishScore = countHints(value, ENGLISH_HINTS);
  const spanishScore = countHints(value, SPANISH_HINTS);
  return englishScore >= 2 && englishScore > spanishScore;
};

const SPANISH_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bthis session\b/gi, "esta sesion"],
  [/\bthis exercise\b/gi, "este ejercicio"],
  [/\bwas selected to\b/gi, "se selecciono para"],
  [/\bwas selected for\b/gi, "se selecciono para"],
  [/\btargets\b/gi, "trabaja"],
  [/\bfocus\b/gi, "enfoque"],
  [/\brest\b/gi, "descanso"],
  [/\bsets\b/gi, "series"],
  [/\breps\b/gi, "repeticiones"],
  [/\bminutes\b/gi, "minutos"],
  [/\bminute\b/gi, "minuto"],
  [/\bcontrolled tempo\b/gi, "tempo controlado"],
  [/\bfull range of motion\b/gi, "rango completo de movimiento"],
  [/\bstop if pain appears\b/gi, "deten el ejercicio si aparece dolor"],
  [/\brespect limitations\b/gi, "respeta limitaciones"],
  [/\bnot ideal but still viable\b/gi, "no es ideal pero sigue siendo viable"],
  [/\bplanned around\b/gi, "planificada para"],
  [/\bgoal\b/gi, "objetivo"],
  [/\bstrength\b/gi, "fuerza"],
  [/\bhypertrophy\b/gi, "hipertrofia"],
  [/\bendurance\b/gi, "resistencia"],
  [/\bmaintenance\b/gi, "mantenimiento"],
  [/\bweight loss\b/gi, "perdida de peso"],
  [/\bday\b/gi, "dia"],
];

export const localizeNarrativeText = (
  value: string | undefined,
  language: SupportedLanguage
): string | undefined => {
  if (!value || language === "en") {
    return value;
  }

  if (!looksMostlyEnglish(value)) {
    return value;
  }

  let localized = value;
  SPANISH_REPLACEMENTS.forEach(([pattern, replacement]) => {
    localized = localized.replace(pattern, replacement);
  });

  return localized;
};

export const localizeDayLabel = (value: string, language: SupportedLanguage): string => {
  if (language === "en") {
    return value;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^day\s*(\d+)$/i);
  if (match) {
    return `Dia ${match[1]}`;
  }

  return trimmed;
};

const FOCUS_ES_MAP: Record<string, string> = {
  push: "Empuje",
  pull: "Traccion",
  legs: "Piernas",
  upper: "Tren superior",
  lower: "Tren inferior",
  conditioning: "Acondicionamiento",
  "squat + core": "Sentadilla + Core",
  "bench + push": "Banca + Empuje",
  "deadlift + pull": "Peso Muerto + Traccion",
  "upper assistance": "Asistencia Tren Superior",
  "lower assistance": "Asistencia Tren Inferior",
  "power + speed": "Potencia + Velocidad",
  "aerobic base": "Base Aerobica",
  threshold: "Umbral",
  "tempo + core": "Tempo + Core",
  intervals: "Intervalos",
  "recovery + mobility": "Recuperacion + Movilidad",
  "mixed conditioning": "Acondicionamiento Mixto",
  "long session": "Sesion Larga",
  "full body a": "Cuerpo Completo A",
  "full body b": "Cuerpo Completo B",
  "full body c": "Cuerpo Completo C",
  "cardio + core": "Cardio + Core",
  hiit: "HIIT",
  "mobility + walk": "Movilidad + Caminata",
  "full body": "Cuerpo Completo",
};

export const localizeFocusLabel = (value: string, language: SupportedLanguage): string => {
  if (language === "en") {
    return value;
  }

  const normalized = normalize(value);
  return FOCUS_ES_MAP[normalized] ?? value;
};

