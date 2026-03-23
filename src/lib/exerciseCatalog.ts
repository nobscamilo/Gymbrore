import exerciseVideoIndex from "@/data/exerciseVideoIndex.json";
import topExerciseMetadata from "@/data/topExerciseMetadata.json";
import { EXERCISE_YOUTUBE_GUIDES, ExerciseYouTubeGuide } from "@/data/exerciseYouTubeGuides";

export type SupportedLanguage = "es" | "en";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "push"
  | "pull"
  | "lunge"
  | "core"
  | "cardio"
  | "mobility"
  | "isolation";

export type EquipmentType =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "mixed";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export type PainFlag = "knee" | "shoulder" | "low_back" | "wrist" | "neck" | "elbow" | "ankle";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "core"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "calves"
  | "hip_flexors";

type VideoIndexEntry = {
  id: string;
  sourceId?: string;
  exerciseLabel: string;
  fileName: string;
  localUrl: string;
  keywords: string[];
};

export type CuratedExerciseEntry = {
  id: string;
  sourceId: string;
  fileName: string;
  localUrl: string;
  nameEn: string;
  nameEs: string;
  movementPattern: MovementPattern;
  equipment: EquipmentType;
  difficulty: DifficultyLevel;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  painFlags: PainFlag[];
  keywords: string[];
  aliases: string[];
  techniqueEn: string[];
  techniqueEs: string[];
};

export type ExerciseInsight = {
  canonicalName: string;
  displayName: string;
  localUrl: string;
  youtubeTechniqueUrl: string;
  youtubeUrl: string;
  isCurated: boolean;
  sourceId?: string;
  fileName?: string;
  movementPattern: MovementPattern;
  movementPatternLabel: string;
  equipment: EquipmentType;
  equipmentLabel: string;
  difficulty: DifficultyLevel;
  difficultyLabel: string;
  primaryMuscles: MuscleGroup[];
  primaryMuscleLabels: string[];
  secondaryMuscles: MuscleGroup[];
  secondaryMuscleLabels: string[];
  painFlags: PainFlag[];
  painFlagLabels: string[];
  techniqueCues: string[];
  analysisSummary: string;
  nameEn: string;
  nameEs: string;
};

type TopExerciseOverride = {
  nameEs?: string;
  movementPattern?: MovementPattern;
  equipment?: EquipmentType;
  difficulty?: DifficultyLevel;
  primaryMuscles?: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  painFlags?: PainFlag[];
  aliases?: string[];
  techniqueEn?: string[];
  techniqueEs?: string[];
};

const normalizeText = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenize = (value: string): string[] => {
  return normalizeText(value).split(" ").filter(Boolean);
};

const toTitleCase = (value: string): string => {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
};

const toSafeName = (value: string): string => {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const NAME_PHRASES_ES: Array<[string, string]> = [
  ["romanian deadlift", "peso muerto rumano"],
  ["single leg", "a una pierna"],
  ["back squat", "sentadilla trasera"],
  ["front squat", "sentadilla frontal"],
  ["split squat", "sentadilla dividida"],
  ["step up", "subida al cajon"],
  ["step down", "bajada de cajon"],
  ["leg press", "prensa de piernas"],
  ["hip thrust", "empuje de cadera"],
  ["glute bridge", "puente de gluteos"],
  ["bench press", "press de banca"],
  ["overhead press", "press militar"],
  ["push up", "flexion"],
  ["pull up", "dominada"],
  ["lat pulldown", "jalon al pecho"],
  ["seated row", "remo sentado"],
  ["face pull", "jalon a la cara"],
  ["triceps extension", "extension de triceps"],
  ["biceps curl", "curl de biceps"],
  ["calf raise", "elevacion de pantorrillas"],
  ["side plank", "plancha lateral"],
  ["dead bug", "dead bug"],
  ["mountain climber", "escalador"],
  ["sit up", "abdominal"],
  ["v sit", "v sit"],
  ["crunch", "crunch"],
  ["stretch", "estiramiento"],
  ["mobility", "movilidad"],
];

const NAME_TOKENS_ES: Record<string, string> = {
  squat: "sentadilla",
  deadlift: "peso muerto",
  lunge: "zancada",
  press: "press",
  row: "remo",
  pull: "jalon",
  push: "empuje",
  curl: "curl",
  extension: "extension",
  raise: "elevacion",
  plank: "plancha",
  crunch: "crunch",
  stretch: "estiramiento",
  seated: "sentado",
  standing: "de pie",
  lying: "acostado",
  incline: "inclinado",
  decline: "declinado",
  reverse: "inverso",
  dumbbell: "mancuerna",
  barbell: "barra",
  cable: "cable",
  lever: "maquina",
  assisted: "asistido",
  underhand: "supino",
  upright: "vertical",
  weighted: "con carga",
  supine: "supino",
  prone: "prono",
  hip: "cadera",
  leg: "pierna",
  arm: "brazo",
  shoulder: "hombro",
  chest: "pecho",
  back: "espalda",
  core: "core",
};

const translateExerciseNameToSpanish = (nameEn: string): string => {
  let translated = normalizeText(nameEn);

  NAME_PHRASES_ES.forEach(([englishPhrase, spanishPhrase]) => {
    translated = translated.replace(
      new RegExp(`\\b${escapeRegex(englishPhrase)}\\b`, "g"),
      spanishPhrase
    );
  });

  translated = translated
    .split(" ")
    .map((token) => NAME_TOKENS_ES[token] ?? token)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return toTitleCase(translated || nameEn);
};

const includesAny = (normalized: string, keywords: string[]): boolean => {
  return keywords.some((keyword) => normalized.includes(keyword));
};

const inferMovementPattern = (normalized: string): MovementPattern => {
  if (includesAny(normalized, ["stretch", "mobility", "rollover", "doorway", "waist stretch"])) {
    return "mobility";
  }
  if (includesAny(normalized, ["jump", "shuffle", "sprint", "run", "burpee", "interval"])) {
    return "cardio";
  }
  if (includesAny(normalized, ["plank", "crunch", "sit up", "dead bug", "leg hip raise", "twist", "v sit"])) {
    return "core";
  }
  if (includesAny(normalized, ["lunge", "split squat", "step up", "step down"])) {
    return "lunge";
  }
  if (includesAny(normalized, ["deadlift", "hip thrust", "glute bridge", "good morning", "hinge"])) {
    return "hinge";
  }
  if (includesAny(normalized, ["squat", "leg press", "hack squat", "v squat"])) {
    return "squat";
  }
  if (includesAny(normalized, ["pull up", "pulldown", "row", "face pull", "shrug"])) {
    return "pull";
  }
  if (includesAny(normalized, ["press", "push up", "dip", "fly"])) {
    return "push";
  }
  return "isolation";
};

const inferEquipment = (normalized: string): EquipmentType => {
  if (normalized.includes("barbell")) {
    return "barbell";
  }
  if (normalized.includes("dumbbell")) {
    return "dumbbell";
  }
  if (normalized.includes("cable")) {
    return "cable";
  }
  if (includesAny(normalized, ["lever", "machine", "smith", "press"])) {
    return "machine";
  }
  if (includesAny(normalized, ["bodyweight", "push up", "plank", "stretch", "mobility"])) {
    return "bodyweight";
  }
  return "mixed";
};

const inferDifficulty = (normalized: string, pattern: MovementPattern): DifficultyLevel => {
  if (includesAny(normalized, ["single leg", "jump", "pistol", "snatch", "clean", "handstand"])) {
    return "advanced";
  }
  if (includesAny(normalized, ["assisted", "seated", "machine", "stretch"]) || pattern === "mobility") {
    return "beginner";
  }
  if (includesAny(normalized, ["barbell", "deadlift", "front squat", "overhead press"])) {
    return "intermediate";
  }
  return "beginner";
};

const addUnique = <T>(current: T[], values: T[]): T[] => {
  const next = [...current];
  values.forEach((value) => {
    if (!next.includes(value)) {
      next.push(value);
    }
  });
  return next;
};

const inferMuscles = (
  normalized: string,
  pattern: MovementPattern
): { primary: MuscleGroup[]; secondary: MuscleGroup[] } => {
  let primary: MuscleGroup[] = [];
  let secondary: MuscleGroup[] = [];

  if (includesAny(normalized, ["bench", "chest", "push up", "fly", "press"])) {
    primary = addUnique(primary, ["chest"]);
    secondary = addUnique(secondary, ["shoulders", "triceps"]);
  }

  if (includesAny(normalized, ["row", "pull up", "pulldown", "lat", "face pull"])) {
    primary = addUnique(primary, ["back"]);
    secondary = addUnique(secondary, ["biceps", "forearms", "shoulders"]);
  }

  if (includesAny(normalized, ["shoulder", "overhead", "lateral raise", "upright row"])) {
    primary = addUnique(primary, ["shoulders"]);
    secondary = addUnique(secondary, ["triceps", "back"]);
  }

  if (includesAny(normalized, ["squat", "leg press", "lunge", "step up", "step down"])) {
    primary = addUnique(primary, ["quads", "glutes"]);
    secondary = addUnique(secondary, ["hamstrings", "calves", "core"]);
  }

  if (includesAny(normalized, ["deadlift", "hip thrust", "glute bridge", "good morning", "hinge"])) {
    primary = addUnique(primary, ["glutes", "hamstrings"]);
    secondary = addUnique(secondary, ["back", "core"]);
  }

  if (includesAny(normalized, ["calf"])) {
    primary = addUnique(primary, ["calves"]);
    secondary = addUnique(secondary, ["hamstrings"]);
  }

  if (includesAny(normalized, ["triceps", "extension"])) {
    primary = addUnique(primary, ["triceps"]);
    secondary = addUnique(secondary, ["shoulders"]);
  }

  if (includesAny(normalized, ["biceps", "curl"])) {
    primary = addUnique(primary, ["biceps"]);
    secondary = addUnique(secondary, ["forearms"]);
  }

  if (includesAny(normalized, ["plank", "crunch", "sit up", "v sit", "dead bug", "twist"])) {
    primary = addUnique(primary, ["core"]);
    secondary = addUnique(secondary, ["hip_flexors"]);
  }

  if (primary.length === 0) {
    if (pattern === "core") {
      primary = ["core"];
      secondary = addUnique(secondary, ["hip_flexors"]);
    } else if (pattern === "squat" || pattern === "lunge") {
      primary = ["quads", "glutes"];
      secondary = addUnique(secondary, ["hamstrings", "core"]);
    } else if (pattern === "hinge") {
      primary = ["glutes", "hamstrings"];
      secondary = addUnique(secondary, ["back", "core"]);
    } else if (pattern === "push") {
      primary = ["chest", "shoulders"];
      secondary = addUnique(secondary, ["triceps"]);
    } else if (pattern === "pull") {
      primary = ["back", "biceps"];
      secondary = addUnique(secondary, ["forearms"]);
    } else if (pattern === "mobility") {
      primary = ["core"];
    } else {
      primary = ["core"];
    }
  }

  return { primary, secondary };
};

const inferPainFlags = (normalized: string, pattern: MovementPattern): PainFlag[] => {
  let flags: PainFlag[] = [];

  if (pattern === "squat" || pattern === "lunge" || includesAny(normalized, ["jump", "leg press"])) {
    flags = addUnique(flags, ["knee"]);
  }

  if (pattern === "push" || pattern === "pull" || includesAny(normalized, ["overhead", "lat pulldown", "dip"])) {
    flags = addUnique(flags, ["shoulder"]);
  }

  if (pattern === "hinge" || includesAny(normalized, ["deadlift", "bent", "good morning", "squat"])) {
    flags = addUnique(flags, ["low_back"]);
  }

  if (includesAny(normalized, ["wrist", "push up", "plank", "curl"])) {
    flags = addUnique(flags, ["wrist"]);
  }

  if (includesAny(normalized, ["curl", "extension", "triceps", "biceps", "pull up"])) {
    flags = addUnique(flags, ["elbow"]);
  }

  if (includesAny(normalized, ["calf", "jump", "shuffle", "run", "step"])) {
    flags = addUnique(flags, ["ankle"]);
  }

  if (includesAny(normalized, ["neck", "shrug"])) {
    flags = addUnique(flags, ["neck"]);
  }

  return flags;
};

const TECHNIQUE_BY_PATTERN_EN: Record<MovementPattern, string[]> = {
  squat: [
    "Brace your core before each rep and keep neutral spine.",
    "Descend with controlled tempo while tracking knees over toes.",
    "Drive through full foot contact to stand without collapsing hips.",
  ],
  hinge: [
    "Initiate from the hips, not the lower back.",
    "Keep ribs stacked over pelvis and maintain neutral spine.",
    "Finish by squeezing glutes while avoiding lumbar overextension.",
  ],
  push: [
    "Set shoulder blades and keep elbows in a pain-free path.",
    "Control the eccentric phase and avoid bouncing.",
    "Press with stable trunk to transfer force efficiently.",
  ],
  pull: [
    "Start by setting shoulders down and back before pulling.",
    "Lead with elbows while keeping neck relaxed.",
    "Control return phase to maintain tension in target muscles.",
  ],
  lunge: [
    "Keep pelvis level and trunk stable through each step.",
    "Use a stride that allows knee control without valgus collapse.",
    "Push through the front foot to return with balance.",
  ],
  core: [
    "Breathe behind the brace and avoid rib flare.",
    "Prioritize spinal control over range of motion.",
    "Stop each rep before compensating with neck or hip flexors.",
  ],
  cardio: [
    "Start with a progressive warm-up before high effort.",
    "Maintain posture and cadence you can repeat consistently.",
    "Scale intensity if pain or form breakdown appears.",
  ],
  mobility: [
    "Move into stretch gradually and stay below pain threshold.",
    "Use slow breathing to reduce protective tension.",
    "Hold alignment without forcing end-range positions.",
  ],
  isolation: [
    "Stabilize nearby joints before moving the target segment.",
    "Use full controlled range with no momentum.",
    "Stop 1-2 reps before technical failure in most sets.",
  ],
};

const TECHNIQUE_BY_PATTERN_ES: Record<MovementPattern, string[]> = {
  squat: [
    "Activa el core antes de cada repeticion y mantien columna neutral.",
    "Desciende con control, guiando rodillas en la misma linea de los pies.",
    "Empuja con apoyo completo del pie para subir sin colapsar cadera.",
  ],
  hinge: [
    "Inicia el movimiento desde la cadera, no desde la zona lumbar.",
    "Mantien costillas y pelvis alineadas durante todo el recorrido.",
    "Finaliza contrayendo gluteos sin hiperextender la espalda baja.",
  ],
  push: [
    "Fija escapulas y usa una trayectoria de codo sin dolor.",
    "Controla la fase de bajada y evita rebotes.",
    "Empuja con tronco estable para transferir fuerza de forma eficiente.",
  ],
  pull: [
    "Comienza bajando y fijando hombros antes de traccionar.",
    "Guia con codos mientras mantienes cuello relajado.",
    "Controla el regreso para sostener tension en el musculo objetivo.",
  ],
  lunge: [
    "Mantien pelvis estable y tronco firme en cada paso.",
    "Usa zancada que permita control de rodilla sin colapso medial.",
    "Empuja con el pie delantero para volver con equilibrio.",
  ],
  core: [
    "Respira manteniendo la presion abdominal sin perder postura.",
    "Prioriza control espinal por encima del rango.",
    "Deten la serie antes de compensar con cuello o flexores de cadera.",
  ],
  cardio: [
    "Empieza con calentamiento progresivo antes del esfuerzo alto.",
    "Mantien postura y ritmo que puedas repetir con tecnica limpia.",
    "Reduce intensidad si aparece dolor o perdida de forma.",
  ],
  mobility: [
    "Entra al estiramiento de forma gradual y sin pasar umbral de dolor.",
    "Usa respiracion lenta para bajar la tension protectora.",
    "Sostien alineacion sin forzar posiciones extremas.",
  ],
  isolation: [
    "Estabiliza articulaciones cercanas antes de mover el segmento objetivo.",
    "Usa rango completo controlado, sin impulso.",
    "Termina la serie 1-2 repeticiones antes del fallo tecnico.",
  ],
};

const MUSCLE_LABELS: Record<MuscleGroup, { en: string; es: string }> = {
  chest: { en: "Chest", es: "Pecho" },
  back: { en: "Back", es: "Espalda" },
  shoulders: { en: "Shoulders", es: "Hombros" },
  biceps: { en: "Biceps", es: "Biceps" },
  triceps: { en: "Triceps", es: "Triceps" },
  forearms: { en: "Forearms", es: "Antebrazos" },
  core: { en: "Core", es: "Core" },
  glutes: { en: "Glutes", es: "Gluteos" },
  quads: { en: "Quadriceps", es: "Cuadriceps" },
  hamstrings: { en: "Hamstrings", es: "Isquiotibiales" },
  calves: { en: "Calves", es: "Pantorrillas" },
  hip_flexors: { en: "Hip Flexors", es: "Flexores de cadera" },
};

const PAIN_FLAG_LABELS: Record<PainFlag, { en: string; es: string }> = {
  knee: {
    en: "Adjust depth or load if knee pain appears.",
    es: "Ajusta profundidad o carga si aparece dolor de rodilla.",
  },
  shoulder: {
    en: "Use pain-free shoulder range and stable scapula position.",
    es: "Trabaja en rango de hombro sin dolor y escapula estable.",
  },
  low_back: {
    en: "Prioritize neutral spine and reduce load with lumbar discomfort.",
    es: "Prioriza columna neutral y reduce carga con molestia lumbar.",
  },
  wrist: {
    en: "Modify grip or support position if wrist symptoms increase.",
    es: "Modifica agarre o apoyo si aumentan sintomas en muneca.",
  },
  neck: {
    en: "Keep neck neutral and avoid compensatory shrugging.",
    es: "Mantien cuello neutral y evita compensar con elevacion de hombros.",
  },
  elbow: {
    en: "Reduce range/load if elbow irritation appears.",
    es: "Reduce rango/carga si aparece irritacion en codo.",
  },
  ankle: {
    en: "Control ankle alignment and reduce impact if symptoms increase.",
    es: "Controla alineacion del tobillo y reduce impacto si aumentan sintomas.",
  },
};

const PATTERN_LABELS: Record<MovementPattern, { en: string; es: string }> = {
  squat: { en: "Squat Pattern", es: "Patron de sentadilla" },
  hinge: { en: "Hinge Pattern", es: "Patron de bisagra" },
  push: { en: "Push Pattern", es: "Patron de empuje" },
  pull: { en: "Pull Pattern", es: "Patron de traccion" },
  lunge: { en: "Lunge Pattern", es: "Patron unilateral" },
  core: { en: "Core Control", es: "Control del core" },
  cardio: { en: "Conditioning", es: "Acondicionamiento" },
  mobility: { en: "Mobility", es: "Movilidad" },
  isolation: { en: "Isolation", es: "Aislamiento" },
};

const EQUIPMENT_LABELS: Record<EquipmentType, { en: string; es: string }> = {
  barbell: { en: "Barbell", es: "Barra" },
  dumbbell: { en: "Dumbbell", es: "Mancuerna" },
  cable: { en: "Cable", es: "Cable" },
  machine: { en: "Machine", es: "Maquina" },
  bodyweight: { en: "Bodyweight", es: "Peso corporal" },
  mixed: { en: "Mixed", es: "Mixto" },
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, { en: string; es: string }> = {
  beginner: { en: "Beginner", es: "Principiante" },
  intermediate: { en: "Intermediate", es: "Intermedio" },
  advanced: { en: "Advanced", es: "Avanzado" },
};

const toLabel = <T extends string>(
  value: T,
  labels: Record<T, { en: string; es: string }>,
  language: SupportedLanguage
): string => {
  return labels[value][language];
};

const buildAliases = (nameEn: string, nameEs: string, keywords: string[]): string[] => {
  const aliases = new Set<string>();
  [nameEn, nameEs, ...keywords].forEach((value) => {
    const normalized = normalizeText(value);
    if (normalized) {
      aliases.add(normalized);
    }
  });
  return Array.from(aliases);
};

const YOUTUBE_GUIDE_MAP = EXERCISE_YOUTUBE_GUIDES as Record<string, ExerciseYouTubeGuide>;

const RAW_CATALOG = exerciseVideoIndex as VideoIndexEntry[];
const TOP_EXERCISE_OVERRIDES = topExerciseMetadata as Record<string, TopExerciseOverride>;

const applyTopOverride = (
  entry: CuratedExerciseEntry,
  override: TopExerciseOverride
): CuratedExerciseEntry => {
  const movementPattern = override.movementPattern ?? entry.movementPattern;
  const nameEs = override.nameEs ?? entry.nameEs;
  const keywords = addUnique(entry.keywords, override.aliases ?? []);

  return {
    ...entry,
    nameEs,
    movementPattern,
    equipment: override.equipment ?? entry.equipment,
    difficulty: override.difficulty ?? entry.difficulty,
    primaryMuscles: override.primaryMuscles ?? entry.primaryMuscles,
    secondaryMuscles: override.secondaryMuscles ?? entry.secondaryMuscles,
    painFlags: override.painFlags ?? entry.painFlags,
    keywords,
    aliases: buildAliases(entry.nameEn, nameEs, [...keywords, ...(override.aliases ?? [])]),
    techniqueEn: override.techniqueEn ?? entry.techniqueEn ?? TECHNIQUE_BY_PATTERN_EN[movementPattern],
    techniqueEs: override.techniqueEs ?? entry.techniqueEs ?? TECHNIQUE_BY_PATTERN_ES[movementPattern],
  };
};

const createCatalogEntry = (
  nameEn: string,
  partial: Partial<CuratedExerciseEntry>
): CuratedExerciseEntry => {
  const safeNameEn = toTitleCase(toSafeName(nameEn));
  const safeNameEs = partial.nameEs ?? translateExerciseNameToSpanish(safeNameEn);
  const normalized = normalizeText(safeNameEn);
  const movementPattern = partial.movementPattern ?? inferMovementPattern(normalized);
  const muscleInfo = inferMuscles(normalized, movementPattern);

  return {
    id: partial.id ?? normalized.replace(/\s+/g, "-"),
    sourceId: partial.sourceId ?? "",
    fileName: partial.fileName ?? "",
    localUrl: partial.localUrl ?? "",
    nameEn: safeNameEn,
    nameEs: safeNameEs,
    movementPattern,
    equipment: partial.equipment ?? inferEquipment(normalized),
    difficulty: partial.difficulty ?? inferDifficulty(normalized, movementPattern),
    primaryMuscles: partial.primaryMuscles ?? muscleInfo.primary,
    secondaryMuscles: partial.secondaryMuscles ?? muscleInfo.secondary,
    painFlags: partial.painFlags ?? inferPainFlags(normalized, movementPattern),
    keywords: partial.keywords ?? [],
    aliases:
      partial.aliases ??
      buildAliases(safeNameEn, safeNameEs, partial.keywords ?? []),
    techniqueEn: partial.techniqueEn ?? TECHNIQUE_BY_PATTERN_EN[movementPattern],
    techniqueEs: partial.techniqueEs ?? TECHNIQUE_BY_PATTERN_ES[movementPattern],
  };
};

const catalogMap = new Map<string, CuratedExerciseEntry>();

RAW_CATALOG.forEach((item) => {
  const baseEntry = createCatalogEntry(item.exerciseLabel, {
    id: item.id,
    sourceId: item.sourceId ?? "",
    fileName: item.fileName,
    localUrl: item.localUrl,
    keywords: item.keywords ?? [],
  });

  catalogMap.set(normalizeText(baseEntry.nameEn), baseEntry);
});

Object.entries(TOP_EXERCISE_OVERRIDES).forEach(([rawKey, override]) => {
  const normalizedKey = normalizeText(rawKey);
  const current = catalogMap.get(normalizedKey);

  if (current) {
    catalogMap.set(normalizedKey, applyTopOverride(current, override));
    return;
  }

  const created = createCatalogEntry(rawKey, {
    nameEs: override.nameEs,
    movementPattern: override.movementPattern,
    equipment: override.equipment,
    difficulty: override.difficulty,
    primaryMuscles: override.primaryMuscles,
    secondaryMuscles: override.secondaryMuscles,
    painFlags: override.painFlags,
    keywords: override.aliases ?? [],
    techniqueEn: override.techniqueEn,
    techniqueEs: override.techniqueEs,
  });

  catalogMap.set(normalizedKey, created);
});

const CATALOG: CuratedExerciseEntry[] = Array.from(catalogMap.values()).sort((a, b) =>
  a.nameEn.localeCompare(b.nameEn)
);

const MATCH_CACHE_MAX = 1500;
const INSIGHT_CACHE_MAX = 2500;
const EXERCISE_MATCH_CACHE = new Map<string, CuratedExerciseEntry | null>();
const EXERCISE_INSIGHT_CACHE = new Map<string, ExerciseInsight>();

const cacheSetWithLimit = <T>(cache: Map<string, T>, key: string, value: T, max: number) => {
  if (!cache.has(key) && cache.size >= max) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
};

const scoreMatch = (query: string, candidate: CuratedExerciseEntry): number => {
  if (!query) {
    return 0;
  }

  let score = 0;

  candidate.aliases.forEach((alias) => {
    if (query === alias) {
      score += 140;
    } else if (query.includes(alias)) {
      score += 90;
    } else if (alias.includes(query)) {
      score += 50;
    }
  });

  const queryTokens = new Set(tokenize(query));
  const candidateTokens = new Set(tokenize(`${candidate.nameEn} ${candidate.nameEs}`));
  let shared = 0;

  queryTokens.forEach((token) => {
    if (candidateTokens.has(token)) {
      shared += 1;
    }
  });

  score += shared * 12;
  return score;
};

const buildFallbackEntry = (exerciseName: string): CuratedExerciseEntry => {
  const safeNameEn = toTitleCase(toSafeName(exerciseName));
  const safeNameEs = translateExerciseNameToSpanish(safeNameEn);
  const normalized = normalizeText(safeNameEn);
  const movementPattern = inferMovementPattern(normalized);
  const equipment = inferEquipment(normalized);
  const difficulty = inferDifficulty(normalized, movementPattern);
  const muscleInfo = inferMuscles(normalized, movementPattern);
  const painFlags = inferPainFlags(normalized, movementPattern);

  return {
    id: normalizeText(safeNameEn).replace(/\s+/g, "-"),
    sourceId: "",
    fileName: "",
    localUrl: "",
    nameEn: safeNameEn,
    nameEs: safeNameEs,
    movementPattern,
    equipment,
    difficulty,
    primaryMuscles: muscleInfo.primary,
    secondaryMuscles: muscleInfo.secondary,
    painFlags,
    keywords: [],
    aliases: buildAliases(safeNameEn, safeNameEs, []),
    techniqueEn: TECHNIQUE_BY_PATTERN_EN[movementPattern],
    techniqueEs: TECHNIQUE_BY_PATTERN_ES[movementPattern],
  };
};

export const getCuratedExerciseCatalog = (): CuratedExerciseEntry[] => {
  return CATALOG;
};

export const findCatalogExercise = (exerciseName: string): CuratedExerciseEntry | null => {
  const normalizedQuery = normalizeText(exerciseName);
  if (!normalizedQuery) {
    return null;
  }

  if (EXERCISE_MATCH_CACHE.has(normalizedQuery)) {
    return EXERCISE_MATCH_CACHE.get(normalizedQuery) ?? null;
  }

  let best: CuratedExerciseEntry | null = null;
  let bestScore = 0;

  CATALOG.forEach((candidate) => {
    const score = scoreMatch(normalizedQuery, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  const resolved = best && bestScore >= 24 ? best : null;
  cacheSetWithLimit(EXERCISE_MATCH_CACHE, normalizedQuery, resolved, MATCH_CACHE_MAX);
  return resolved;
};

export const getLocalizedExerciseName = (
  exerciseName: string,
  language: SupportedLanguage
): string => {
  const matched = findCatalogExercise(exerciseName);
  if (matched) {
    return language === "es" ? matched.nameEs : matched.nameEn;
  }

  const fallback = buildFallbackEntry(exerciseName);
  return language === "es" ? fallback.nameEs : fallback.nameEn;
};

export const getMuscleLabel = (muscle: MuscleGroup, language: SupportedLanguage): string => {
  return MUSCLE_LABELS[muscle][language];
};

const resolveGuideEntry = (entry: CuratedExerciseEntry): ExerciseYouTubeGuide | null => {
  const keys = [
    normalizeText(entry.nameEn),
    normalizeText(entry.nameEs),
    ...entry.aliases.map((alias) => normalizeText(alias)),
  ];

  for (const key of keys) {
    const guide = YOUTUBE_GUIDE_MAP[key];
    if (guide) {
      return guide;
    }
  }

  return null;
};

const resolveYouTubeGuideUrls = (
  entry: CuratedExerciseEntry
): { technique: string } => {
  const guideEntry = resolveGuideEntry(entry);
  const techniqueQuery = guideEntry?.techniqueQuery ?? `${entry.nameEn} technique proper form`;
  const enrichedQuery = [techniqueQuery, entry.nameEn, entry.nameEs]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" ");

  return {
    technique:
      guideEntry?.techniqueUrl && guideEntry.techniqueUrl.trim().length > 0
        ? guideEntry.techniqueUrl.trim()
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(enrichedQuery)}`,
  };
};

const buildAnalysisSummary = (
  entry: CuratedExerciseEntry,
  language: SupportedLanguage
): string => {
  const primary = entry.primaryMuscles.map((muscle) => getMuscleLabel(muscle, language));
  const secondary = entry.secondaryMuscles.map((muscle) => getMuscleLabel(muscle, language));
  const painFlags = entry.painFlags.map((flag) => PAIN_FLAG_LABELS[flag][language]);
  const patternLabel = toLabel(entry.movementPattern, PATTERN_LABELS, language);
  const equipmentLabel = toLabel(entry.equipment, EQUIPMENT_LABELS, language);

  if (language === "es") {
    return [
      `${patternLabel} con ${equipmentLabel}.`,
      `Activos: ${primary.join(", ")}.`,
      secondary.length > 0 ? `Apoyo: ${secondary.join(", ")}.` : "Sin musculatura de apoyo relevante.",
      painFlags.length > 0
        ? `Control clinico: ${painFlags.join(" ")}`
        : "Sin banderas clinicas destacadas para este patron.",
    ].join(" ");
  }

  return [
    `${patternLabel} using ${equipmentLabel}.`,
    `Primary: ${primary.join(", ")}.`,
    secondary.length > 0 ? `Secondary: ${secondary.join(", ")}.` : "No relevant secondary musculature detected.",
    painFlags.length > 0
      ? `Clinical watchpoints: ${painFlags.join(" ")}`
      : "No major clinical caution flags for this pattern.",
  ].join(" ");
};

export const getExerciseInsight = (
  exerciseName: string,
  language: SupportedLanguage
): ExerciseInsight => {
  const normalizedExerciseName = normalizeText(exerciseName);
  const cacheKey = `${language}:${normalizedExerciseName}`;
  if (normalizedExerciseName && EXERCISE_INSIGHT_CACHE.has(cacheKey)) {
    return EXERCISE_INSIGHT_CACHE.get(cacheKey) as ExerciseInsight;
  }

  const matched = findCatalogExercise(exerciseName);
  const entry = matched ?? buildFallbackEntry(exerciseName);
  const youtubeGuides = resolveYouTubeGuideUrls(entry);

  const insight: ExerciseInsight = {
    canonicalName: entry.nameEn,
    displayName: language === "es" ? entry.nameEs : entry.nameEn,
    localUrl: entry.localUrl ?? "",
    youtubeTechniqueUrl: youtubeGuides.technique,
    youtubeUrl: youtubeGuides.technique,
    isCurated: Boolean(entry.localUrl),
    sourceId: entry.sourceId,
    fileName: entry.fileName,
    movementPattern: entry.movementPattern,
    movementPatternLabel: toLabel(entry.movementPattern, PATTERN_LABELS, language),
    equipment: entry.equipment,
    equipmentLabel: toLabel(entry.equipment, EQUIPMENT_LABELS, language),
    difficulty: entry.difficulty,
    difficultyLabel: toLabel(entry.difficulty, DIFFICULTY_LABELS, language),
    primaryMuscles: entry.primaryMuscles,
    primaryMuscleLabels: entry.primaryMuscles.map((muscle) => getMuscleLabel(muscle, language)),
    secondaryMuscles: entry.secondaryMuscles,
    secondaryMuscleLabels: entry.secondaryMuscles.map((muscle) => getMuscleLabel(muscle, language)),
    painFlags: entry.painFlags,
    painFlagLabels: entry.painFlags.map((flag) => PAIN_FLAG_LABELS[flag][language]),
    techniqueCues: language === "es" ? entry.techniqueEs : entry.techniqueEn,
    analysisSummary: buildAnalysisSummary(entry, language),
    nameEn: entry.nameEn,
    nameEs: entry.nameEs,
  };

  if (normalizedExerciseName) {
    cacheSetWithLimit(EXERCISE_INSIGHT_CACHE, cacheKey, insight, INSIGHT_CACHE_MAX);
  }

  return insight;
};

export const getCatalogFilterOptions = (language: SupportedLanguage) => {
  const movementPatterns = Array.from(
    new Set(CATALOG.map((entry) => entry.movementPattern))
  ).map((value) => ({
    value,
    label: toLabel(value, PATTERN_LABELS, language),
  }));

  const equipmentTypes = Array.from(
    new Set(CATALOG.map((entry) => entry.equipment))
  ).map((value) => ({
    value,
    label: toLabel(value, EQUIPMENT_LABELS, language),
  }));

  const muscles = Array.from(
    new Set(CATALOG.flatMap((entry) => [...entry.primaryMuscles, ...entry.secondaryMuscles]))
  ).map((value) => ({
    value,
    label: getMuscleLabel(value, language),
  }));

  const painFlags = Array.from(
    new Set(CATALOG.flatMap((entry) => entry.painFlags))
  ).map((value) => ({
    value,
    label: PAIN_FLAG_LABELS[value][language],
  }));

  return {
    movementPatterns,
    equipmentTypes,
    muscles,
    painFlags,
  };
};
