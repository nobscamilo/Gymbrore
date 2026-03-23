import {
  CuratedExerciseEntry,
  getCuratedExerciseCatalog,
  getExerciseInsight,
  SupportedLanguage,
} from "@/lib/exerciseCatalog";

export type CuratedExerciseVideo = {
  id: string;
  sourceId: string;
  exerciseLabel: string;
  fileName: string;
  localUrl: string;
  keywords: string[];
  nameEn: string;
  nameEs: string;
};

export type LocalizedCuratedExerciseVideo = CuratedExerciseVideo & {
  localizedLabel: string;
  canonicalLabel: string;
  movementPattern: string;
  equipment: string;
  difficulty: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  painFlagLabels: string[];
  techniqueCues: string[];
};

export type ExerciseVideoMatch = {
  exerciseLabel: string;
  localizedLabel: string;
  localUrl: string;
  youtubeUrl: string;
  isCurated: boolean;
  sourceId?: string;
  fileName?: string;
  techniqueCues: string[];
  primaryMuscleLabels: string[];
  secondaryMuscleLabels: string[];
  painFlagLabels: string[];
  movementPatternLabel: string;
  equipmentLabel: string;
  difficultyLabel: string;
};

const CATALOG: CuratedExerciseEntry[] = getCuratedExerciseCatalog();

const toVideoRecord = (entry: CuratedExerciseEntry): CuratedExerciseVideo => {
  return {
    id: entry.id,
    sourceId: entry.sourceId,
    exerciseLabel: entry.nameEn,
    fileName: entry.fileName,
    localUrl: entry.localUrl,
    keywords: entry.keywords,
    nameEn: entry.nameEn,
    nameEs: entry.nameEs,
  };
};

export const getCuratedVideoCatalog = (
  language: SupportedLanguage = "en"
): LocalizedCuratedExerciseVideo[] => {
  return CATALOG.map((entry) => {
    const insight = getExerciseInsight(entry.nameEn, language);
    const record = toVideoRecord(entry);
    return {
      ...record,
      localizedLabel: insight.displayName,
      canonicalLabel: insight.canonicalName,
      movementPattern: insight.movementPatternLabel,
      equipment: insight.equipmentLabel,
      difficulty: insight.difficultyLabel,
      primaryMuscles: insight.primaryMuscleLabels,
      secondaryMuscles: insight.secondaryMuscleLabels,
      painFlagLabels: insight.painFlagLabels,
      techniqueCues: insight.techniqueCues,
    };
  }).sort((a, b) => a.localizedLabel.localeCompare(b.localizedLabel));
};

export const getExerciseVideoMatch = (
  exerciseName: string,
  language: SupportedLanguage = "en"
): ExerciseVideoMatch => {
  const insight = getExerciseInsight(exerciseName, language);
  return {
    exerciseLabel: insight.canonicalName,
    localizedLabel: insight.displayName,
    localUrl: insight.localUrl,
    youtubeUrl: insight.youtubeTechniqueUrl,
    isCurated: insight.isCurated,
    sourceId: insight.sourceId,
    fileName: insight.fileName,
    techniqueCues: insight.techniqueCues,
    primaryMuscleLabels: insight.primaryMuscleLabels,
    secondaryMuscleLabels: insight.secondaryMuscleLabels,
    painFlagLabels: insight.painFlagLabels,
    movementPatternLabel: insight.movementPatternLabel,
    equipmentLabel: insight.equipmentLabel,
    difficultyLabel: insight.difficultyLabel,
  };
};
