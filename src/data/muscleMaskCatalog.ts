import type { MuscleGroup } from "@/lib/exerciseCatalog";

export type AnatomyView = "front" | "back";

type MuscleMaskViewMap = Partial<Record<MuscleGroup, string>>;

export const MUSCLE_MASKS: Record<AnatomyView, MuscleMaskViewMap> = {
  front: {
    shoulders: "/anatomy/masks/front-shoulders.png",
    chest: "/anatomy/masks/front-chest.png",
    biceps: "/anatomy/masks/front-biceps.png",
    forearms: "/anatomy/masks/front-forearms.png",
    core: "/anatomy/masks/front-core.png",
    hip_flexors: "/anatomy/masks/front-hip_flexors.png",
    quads: "/anatomy/masks/front-quads.png",
    calves: "/anatomy/masks/front-calves.png",
  },
  back: {
    shoulders: "/anatomy/masks/back-shoulders.png",
    back: "/anatomy/masks/back-back.png",
    triceps: "/anatomy/masks/back-triceps.png",
    forearms: "/anatomy/masks/back-forearms.png",
    glutes: "/anatomy/masks/back-glutes.png",
    hamstrings: "/anatomy/masks/back-hamstrings.png",
    calves: "/anatomy/masks/back-calves.png",
  },
};

export const getMuscleMaskPath = (view: AnatomyView, muscle: MuscleGroup): string | undefined => {
  return MUSCLE_MASKS[view][muscle];
};
