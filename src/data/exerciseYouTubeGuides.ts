export type ExerciseYouTubeGuide = {
  techniqueQuery: string;
  techniqueUrl?: string;
  warmupQuery?: string;
  cooldownQuery?: string;
};

// Keys must be normalized (lowercase, ascii, spaces only).
export const EXERCISE_YOUTUBE_GUIDES: Record<string, ExerciseYouTubeGuide> = {
  "back squat": {
    techniqueQuery: "back squat technique sports medicine coaching",
    warmupQuery: "back squat dynamic warm up hips ankles thoracic",
    cooldownQuery: "post squat cooldown stretch hips quads glutes",
  },
  "front squat": {
    techniqueQuery: "front squat technique elbow position bracing",
    warmupQuery: "front squat warm up wrists ankles thoracic mobility",
    cooldownQuery: "front squat cooldown hips quads lower back",
  },
  "goblet squat": {
    techniqueQuery: "goblet squat technique form tutorial",
    warmupQuery: "goblet squat warm up routine",
    cooldownQuery: "squat cooldown mobility stretches",
  },
  "split squat": {
    techniqueQuery: "split squat technique knee friendly",
    warmupQuery: "split squat warm up glute activation",
    cooldownQuery: "lunge cooldown hip flexor and quad stretch",
  },
  "bulgarian split squat": {
    techniqueQuery: "bulgarian split squat technique and setup",
    warmupQuery: "bulgarian split squat warm up mobility",
    cooldownQuery: "single leg workout cooldown stretches",
  },
  "reverse lunge": {
    techniqueQuery: "reverse lunge technique proper form",
    warmupQuery: "lunge warm up dynamic routine",
    cooldownQuery: "lunge cooldown hip and quad stretching",
  },
  "walking lunge": {
    techniqueQuery: "walking lunge technique coaching cues",
    warmupQuery: "walking lunge warm up",
    cooldownQuery: "walking lunge cooldown stretches",
  },
  "leg press": {
    techniqueQuery: "leg press proper technique foot position",
    warmupQuery: "leg day warm up before leg press",
    cooldownQuery: "leg day cooldown stretch routine",
  },
  "romanian deadlift": {
    techniqueQuery: "romanian deadlift technique hip hinge",
    warmupQuery: "romanian deadlift warm up hamstrings glutes",
    cooldownQuery: "post deadlift cooldown lower back hamstrings",
  },
  "dumbbell romanian deadlift": {
    techniqueQuery: "dumbbell romanian deadlift technique",
    warmupQuery: "dumbbell hinge warm up routine",
    cooldownQuery: "hamstring and glute cooldown stretch",
  },
  "deadlift": {
    techniqueQuery: "deadlift technique sports medicine cues",
    warmupQuery: "deadlift warm up progression",
    cooldownQuery: "deadlift cooldown lower back and hamstrings",
  },
  "trap bar deadlift": {
    techniqueQuery: "trap bar deadlift technique tutorial",
    warmupQuery: "trap bar deadlift warm up",
    cooldownQuery: "post deadlift cooldown stretching",
  },
  "hip thrust": {
    techniqueQuery: "barbell hip thrust technique glute focus",
    warmupQuery: "hip thrust warm up glute activation",
    cooldownQuery: "glute workout cooldown and hip mobility",
  },
  "glute bridge": {
    techniqueQuery: "glute bridge technique core and glute",
    warmupQuery: "glute bridge activation warm up",
    cooldownQuery: "glute bridge cooldown routine",
  },
  "bench press": {
    techniqueQuery: "bench press technique shoulder safe setup",
    warmupQuery: "bench press warm up shoulders and pec activation",
    cooldownQuery: "bench press cooldown chest shoulder stretching",
  },
  "incline dumbbell press": {
    techniqueQuery: "incline dumbbell press technique",
    warmupQuery: "upper body push warm up",
    cooldownQuery: "chest and anterior shoulder cooldown stretch",
  },
  "dumbbell floor press": {
    techniqueQuery: "dumbbell floor press technique",
    warmupQuery: "dumbbell press warm up",
    cooldownQuery: "pressing cooldown mobility",
  },
  "push up": {
    techniqueQuery: "push up technique perfect form",
    warmupQuery: "push up warm up wrists shoulders core",
    cooldownQuery: "push workout cooldown chest and triceps",
  },
  "pike push up": {
    techniqueQuery: "pike push up technique shoulder mechanics",
    warmupQuery: "pike push up warm up",
    cooldownQuery: "shoulder cooldown stretches",
  },
  "overhead press": {
    techniqueQuery: "overhead press technique shoulder safe",
    warmupQuery: "overhead press warm up thoracic and shoulders",
    cooldownQuery: "overhead pressing cooldown mobility",
  },
  "dumbbell shoulder press": {
    techniqueQuery: "dumbbell shoulder press technique",
    warmupQuery: "shoulder press warm up routine",
    cooldownQuery: "shoulder cooldown stretching and breathing",
  },
  "landmine press": {
    techniqueQuery: "landmine press technique tutorial",
    warmupQuery: "landmine press warm up",
    cooldownQuery: "pressing cooldown routine",
  },
  "seated cable row": {
    techniqueQuery: "seated cable row technique back engagement",
    warmupQuery: "row warm up scapular activation",
    cooldownQuery: "back workout cooldown lat and thoracic stretch",
  },
  "one arm dumbbell row": {
    techniqueQuery: "one arm dumbbell row technique",
    warmupQuery: "dumbbell row warm up",
    cooldownQuery: "upper back cooldown stretch",
  },
  "chest supported row": {
    techniqueQuery: "chest supported row technique",
    warmupQuery: "row warm up shoulders and scapula",
    cooldownQuery: "pull day cooldown routine",
  },
  "lat pulldown": {
    techniqueQuery: "lat pulldown technique proper form",
    warmupQuery: "lat pulldown warm up",
    cooldownQuery: "lat and biceps cooldown stretches",
  },
  "pull up": {
    techniqueQuery: "pull up technique progression",
    warmupQuery: "pull up warm up scapular and shoulder prep",
    cooldownQuery: "pull up cooldown lats forearms shoulders",
  },
  "inverted row": {
    techniqueQuery: "inverted row technique tutorial",
    warmupQuery: "row warm up bodyweight",
    cooldownQuery: "back cooldown and stretch",
  },
  "face pull": {
    techniqueQuery: "face pull technique shoulder health",
    warmupQuery: "face pull warm up posture",
    cooldownQuery: "rear delt and upper back cooldown",
  },
  "biceps curl": {
    techniqueQuery: "biceps curl technique strict form",
    warmupQuery: "arm day warm up elbows wrists",
    cooldownQuery: "biceps and forearm cooldown stretch",
  },
  "triceps extension": {
    techniqueQuery: "triceps extension technique elbow friendly",
    warmupQuery: "triceps warm up and elbow prep",
    cooldownQuery: "triceps cooldown stretch",
  },
  "calf raise": {
    techniqueQuery: "calf raise technique full range",
    warmupQuery: "calf and ankle warm up",
    cooldownQuery: "calf stretch cooldown",
  },
  "plank": {
    techniqueQuery: "plank technique bracing and breathing",
    warmupQuery: "core activation warm up plank prep",
    cooldownQuery: "core cooldown breathing",
  },
  "side plank": {
    techniqueQuery: "side plank technique oblique stability",
    warmupQuery: "side plank warm up",
    cooldownQuery: "core and hip cooldown stretch",
  },
  "dead bug": {
    techniqueQuery: "dead bug technique core control",
    warmupQuery: "dead bug activation warm up",
    cooldownQuery: "core control cooldown breathing",
  },
  "mountain climbers": {
    techniqueQuery: "mountain climber technique core cardio",
    warmupQuery: "dynamic warm up mountain climbers",
    cooldownQuery: "post conditioning cooldown breathing",
  },
  "step up": {
    techniqueQuery: "step up technique knee control",
    warmupQuery: "step up warm up lower body",
    cooldownQuery: "step up cooldown hips and quads",
  },
  "step down": {
    techniqueQuery: "step down exercise technique knee rehab",
    warmupQuery: "step down warm up",
    cooldownQuery: "step down cooldown stretch",
  },

  "joint mobility primer": {
    techniqueQuery: "joint mobility primer full body warm up routine",
    warmupQuery: "joint mobility warm up sports medicine",
    cooldownQuery: "full body mobility cool down",
  },
  "activation and ramp up sets": {
    techniqueQuery: "activation drills and ramp up sets before lifting",
    warmupQuery: "strength training warm up ramp up sets",
    cooldownQuery: "post workout downregulation routine",
  },
  "breathing downregulation": {
    techniqueQuery: "breathing downregulation after workout",
    warmupQuery: "diaphragmatic breathing warm up",
    cooldownQuery: "box breathing cooldown parasympathetic",
  },
  "targeted stretching": {
    techniqueQuery: "targeted stretching routine post workout",
    warmupQuery: "dynamic stretching warm up",
    cooldownQuery: "static stretching cool down routine",
  },
  "mobility primer": {
    techniqueQuery: "mobility primer before training",
    warmupQuery: "mobility warm up routine",
    cooldownQuery: "mobility cooldown routine",
  },
  "breathing stretch": {
    techniqueQuery: "breathing and stretch cooldown",
    warmupQuery: "breathing warm up drill",
    cooldownQuery: "breathing stretch cooldown",
  },
  "movilidad articular inicial": {
    techniqueQuery: "movilidad articular calentamiento rutina",
    warmupQuery: "movilidad articular pre entrenamiento",
    cooldownQuery: "movilidad articular enfriamiento",
  },
  "activacion y series de aproximacion": {
    techniqueQuery: "activacion muscular y series de aproximacion",
    warmupQuery: "calentamiento en series de aproximacion gimnasio",
    cooldownQuery: "vuelta a la calma post entrenamiento",
  },
  "vuelta a la calma respiratoria": {
    techniqueQuery: "respiracion diafragmatica post entrenamiento",
    warmupQuery: "respiracion diafragmatica calentamiento",
    cooldownQuery: "vuelta a la calma respiratoria",
  },
  "estiramiento dirigido": {
    techniqueQuery: "estiramientos dirigidos post entrenamiento",
    warmupQuery: "estiramientos dinamicos pre entrenamiento",
    cooldownQuery: "estiramiento dirigido enfriamiento",
  },
  "dynamic hip opener": {
    techniqueQuery: "dynamic hip opener warm up",
    warmupQuery: "dynamic hip mobility warm up",
    cooldownQuery: "hip cooldown stretch routine",
  },
  "ankle dorsiflexion drill": {
    techniqueQuery: "ankle dorsiflexion mobility drill",
    warmupQuery: "ankle mobility warm up",
    cooldownQuery: "ankle mobility cooldown",
  },
  "thoracic spine rotation": {
    techniqueQuery: "thoracic spine rotation mobility drill",
    warmupQuery: "thoracic mobility warm up",
    cooldownQuery: "thoracic spine cooldown stretch",
  },
  "scapular wall slide": {
    techniqueQuery: "scapular wall slide technique",
    warmupQuery: "shoulder activation warm up wall slides",
    cooldownQuery: "shoulder mobility cooldown wall slides",
  },
  "band pull apart": {
    techniqueQuery: "band pull apart technique",
    warmupQuery: "band pull apart warm up",
    cooldownQuery: "upper back cooldown mobility",
  },
  "cat cow mobility": {
    techniqueQuery: "cat cow mobility exercise",
    warmupQuery: "cat cow warm up",
    cooldownQuery: "cat cow cooldown",
  },
  "worlds greatest stretch": {
    techniqueQuery: "worlds greatest stretch technique",
    warmupQuery: "worlds greatest stretch warm up",
    cooldownQuery: "worlds greatest stretch cooldown",
  },
  "hamstring dynamic sweep": {
    techniqueQuery: "hamstring dynamic sweep warm up",
    warmupQuery: "dynamic hamstring warm up",
    cooldownQuery: "hamstring cooldown stretch",
  },
  "hip flexor stretch": {
    techniqueQuery: "hip flexor stretch proper form",
    warmupQuery: "hip flexor mobility warm up",
    cooldownQuery: "hip flexor cooldown stretch",
  },
  "calf stretch wall": {
    techniqueQuery: "calf wall stretch technique",
    warmupQuery: "calf mobility warm up",
    cooldownQuery: "calf wall stretch cooldown",
  },
  "pec doorway stretch": {
    techniqueQuery: "pec doorway stretch technique",
    warmupQuery: "pec activation warm up",
    cooldownQuery: "chest doorway stretch cooldown",
  },
  "lat stretch bench": {
    techniqueQuery: "lat stretch on bench tutorial",
    warmupQuery: "lat mobility warm up",
    cooldownQuery: "lat stretch cooldown",
  },
  "quadriceps stretch standing": {
    techniqueQuery: "standing quadriceps stretch technique",
    warmupQuery: "quad dynamic warm up",
    cooldownQuery: "standing quad stretch cooldown",
  },
  "adductor rockback": {
    techniqueQuery: "adductor rockback mobility exercise",
    warmupQuery: "adductor mobility warm up",
    cooldownQuery: "adductor stretch cooldown",
  },
  "bear plank breathing": {
    techniqueQuery: "bear plank breathing drill",
    warmupQuery: "core breathing warm up",
    cooldownQuery: "core downregulation breathing",
  },
  "90 90 hip switch": {
    techniqueQuery: "90 90 hip switch mobility",
    warmupQuery: "90 90 hip mobility warm up",
    cooldownQuery: "90 90 hip stretch cooldown",
  },
  "walking knee hug": {
    techniqueQuery: "walking knee hug dynamic warm up",
    warmupQuery: "walking knee hug warm up drill",
    cooldownQuery: "hip mobility cooldown",
  },
  "walking quad pull": {
    techniqueQuery: "walking quad pull dynamic warm up",
    warmupQuery: "walking quad pull warm up",
    cooldownQuery: "quad stretch cooldown",
  },
  "spinal segmentation drill": {
    techniqueQuery: "spinal segmentation drill mobility",
    warmupQuery: "spine mobility warm up",
    cooldownQuery: "spine cooldown mobility",
  },
  "trx row": {
    techniqueQuery: "trx row technique neutral spine scapular retraction",
  },
  "trx chest press": {
    techniqueQuery: "trx chest press technique shoulder stable",
  },
  "trx assisted squat": {
    techniqueQuery: "trx assisted squat technique knee friendly",
  },
  "trx split squat": {
    techniqueQuery: "trx split squat technique balance setup",
  },
  "trx hamstring curl": {
    techniqueQuery: "trx hamstring curl technique hip extension",
  },
  "trx pike": {
    techniqueQuery: "trx pike technique core control shoulder positioning",
  },
  "trx y fly": {
    techniqueQuery: "trx y fly technique scapular control",
  },
  "pilates hundred": {
    techniqueQuery: "pilates hundred technique breathing tempo",
  },
  "pilates roll up": {
    techniqueQuery: "pilates roll up technique spinal articulation",
  },
  "pilates single leg stretch": {
    techniqueQuery: "pilates single leg stretch technique neutral pelvis",
  },
  "pilates shoulder bridge": {
    techniqueQuery: "pilates shoulder bridge technique glute drive",
  },
  "pilates swan": {
    techniqueQuery: "pilates swan technique thoracic extension",
  },
  "yoga downward dog": {
    techniqueQuery: "downward dog technique alignment wrists hips",
  },
  "yoga cobra pose": {
    techniqueQuery: "cobra pose technique lumbar safe extension",
  },
  "yoga low lunge stretch": {
    techniqueQuery: "low lunge stretch technique hip flexor alignment",
  },
  "yoga pigeon stretch": {
    techniqueQuery: "pigeon stretch technique hip rotation safety",
  },
  "sun salutation flow": {
    techniqueQuery: "sun salutation flow technique beginner alignment",
  },
};
