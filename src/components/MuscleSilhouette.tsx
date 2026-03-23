"use client";

import NextImage from "next/image";
import { useEffect, useState } from "react";
import { MuscleGroup, SupportedLanguage } from "@/lib/exerciseCatalog";
import { getMuscleMaskPath } from "@/data/muscleMaskCatalog";

type BodyView = "front" | "back";

type RectShape = {
  muscle: MuscleGroup;
  view: BodyView;
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
};

type EllipseShape = {
  muscle: MuscleGroup;
  view: BodyView;
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

type RegionShape = RectShape | EllipseShape;

type MuscleSilhouetteProps = {
  primaryMuscles: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  language: SupportedLanguage;
  className?: string;
  referenceImagePath?: string;
  frontReferenceImagePath?: string;
  backReferenceImagePath?: string;
};

const SHAPES: RegionShape[] = [
  { muscle: "chest", view: "front", kind: "ellipse", cx: 46, cy: 72, rx: 13, ry: 9 },
  { muscle: "chest", view: "front", kind: "ellipse", cx: 74, cy: 72, rx: 13, ry: 9 },
  { muscle: "shoulders", view: "front", kind: "ellipse", cx: 26, cy: 66, rx: 8, ry: 9 },
  { muscle: "shoulders", view: "front", kind: "ellipse", cx: 94, cy: 66, rx: 8, ry: 9 },
  { muscle: "shoulders", view: "back", kind: "ellipse", cx: 26, cy: 66, rx: 8, ry: 9 },
  { muscle: "shoulders", view: "back", kind: "ellipse", cx: 94, cy: 66, rx: 8, ry: 9 },
  { muscle: "biceps", view: "front", kind: "ellipse", cx: 21, cy: 92, rx: 7, ry: 13 },
  { muscle: "biceps", view: "front", kind: "ellipse", cx: 99, cy: 92, rx: 7, ry: 13 },
  { muscle: "triceps", view: "back", kind: "ellipse", cx: 21, cy: 92, rx: 7, ry: 13 },
  { muscle: "triceps", view: "back", kind: "ellipse", cx: 99, cy: 92, rx: 7, ry: 13 },
  { muscle: "forearms", view: "front", kind: "ellipse", cx: 18, cy: 122, rx: 6, ry: 14 },
  { muscle: "forearms", view: "front", kind: "ellipse", cx: 102, cy: 122, rx: 6, ry: 14 },
  { muscle: "forearms", view: "back", kind: "ellipse", cx: 18, cy: 122, rx: 6, ry: 14 },
  { muscle: "forearms", view: "back", kind: "ellipse", cx: 102, cy: 122, rx: 6, ry: 14 },
  { muscle: "core", view: "front", kind: "ellipse", cx: 60, cy: 106, rx: 16, ry: 23 },
  { muscle: "core", view: "back", kind: "ellipse", cx: 60, cy: 110, rx: 15, ry: 21 },
  { muscle: "back", view: "back", kind: "ellipse", cx: 50, cy: 96, rx: 10, ry: 25 },
  { muscle: "back", view: "back", kind: "ellipse", cx: 70, cy: 96, rx: 10, ry: 25 },
  { muscle: "glutes", view: "back", kind: "ellipse", cx: 50, cy: 138, rx: 11, ry: 9 },
  { muscle: "glutes", view: "back", kind: "ellipse", cx: 70, cy: 138, rx: 11, ry: 9 },
  { muscle: "hip_flexors", view: "front", kind: "ellipse", cx: 50, cy: 136, rx: 8, ry: 7 },
  { muscle: "hip_flexors", view: "front", kind: "ellipse", cx: 70, cy: 136, rx: 8, ry: 7 },
  { muscle: "quads", view: "front", kind: "ellipse", cx: 50, cy: 167, rx: 9, ry: 23 },
  { muscle: "quads", view: "front", kind: "ellipse", cx: 70, cy: 167, rx: 9, ry: 23 },
  { muscle: "hamstrings", view: "back", kind: "ellipse", cx: 50, cy: 167, rx: 9, ry: 23 },
  { muscle: "hamstrings", view: "back", kind: "ellipse", cx: 70, cy: 167, rx: 9, ry: 23 },
  { muscle: "calves", view: "front", kind: "ellipse", cx: 51, cy: 208, rx: 7, ry: 16 },
  { muscle: "calves", view: "front", kind: "ellipse", cx: 69, cy: 208, rx: 7, ry: 16 },
  { muscle: "calves", view: "back", kind: "ellipse", cx: 51, cy: 208, rx: 7, ry: 16 },
  { muscle: "calves", view: "back", kind: "ellipse", cx: 69, cy: 208, rx: 7, ry: 16 },
];

const BASE_LABELS: Record<SupportedLanguage, { front: string; back: string }> = {
  en: { front: "Front", back: "Back" },
  es: { front: "Frente", back: "Espalda" },
};

const LEGEND_LABELS: Record<SupportedLanguage, { primary: string; secondary: string }> = {
  en: { primary: "Primary", secondary: "Secondary" },
  es: { primary: "Primario", secondary: "Secundario" },
};

const renderShape = (shape: RegionShape, fill: string) => {
  if (shape.kind === "rect") {
    return (
      <rect
        key={`${shape.view}-${shape.muscle}-${shape.x}-${shape.y}`}
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        rx={4}
        fill={fill}
      />
    );
  }

  return (
    <ellipse
      key={`${shape.view}-${shape.muscle}-${shape.cx}-${shape.cy}`}
      cx={shape.cx}
      cy={shape.cy}
      rx={shape.rx}
      ry={shape.ry}
      fill={fill}
    />
  );
};

const baseSilhouette = (
  <>
    <circle cx="60" cy="20" r="12" fill="#1f2937" />
    <rect x="42" y="34" width="36" height="104" rx="14" fill="#1f2937" />
    <rect x="14" y="56" width="14" height="86" rx="7" fill="#1f2937" />
    <rect x="92" y="56" width="14" height="86" rx="7" fill="#1f2937" />
    <rect x="44" y="138" width="14" height="94" rx="7" fill="#1f2937" />
    <rect x="62" y="138" width="14" height="94" rx="7" fill="#1f2937" />
  </>
);

const hasMaskForMuscle = (view: BodyView, muscle: MuscleGroup): boolean => {
  return Boolean(getMuscleMaskPath(view, muscle));
};

const renderMaskLayer = (view: BodyView, muscle: MuscleGroup, fill: string) => {
  const maskPath = getMuscleMaskPath(view, muscle);
  if (!maskPath) {
    return null;
  }

  return (
    <span
      key={`mask-${view}-${muscle}`}
      aria-hidden="true"
      className="absolute inset-0 select-none pointer-events-none"
      style={{
        backgroundColor: fill,
        WebkitMaskImage: `url(${maskPath})`,
        WebkitMaskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${maskPath})`,
        maskSize: "100% 100%",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  );
};

export default function MuscleSilhouette({
  primaryMuscles,
  secondaryMuscles = [],
  language,
  className,
  referenceImagePath,
  frontReferenceImagePath,
  backReferenceImagePath,
}: MuscleSilhouetteProps) {
  const primaryList = Array.from(new Set(primaryMuscles));
  const secondaryList = Array.from(new Set(secondaryMuscles)).filter((muscle) => !primaryList.includes(muscle));
  const frontReferencePath =
    frontReferenceImagePath ?? referenceImagePath ?? "/anatomy/muscle-reference-front.png";
  const backReferencePath =
    backReferenceImagePath ?? referenceImagePath ?? "/anatomy/muscle-reference-back.png";
  const resolvedReferencePaths: Record<BodyView, string> = {
    front: frontReferencePath,
    back: backReferencePath,
  };
  const [referenceAvailable, setReferenceAvailable] = useState<Record<BodyView, boolean>>({
    front: true,
    back: true,
  });
  const [maskSupported, setMaskSupported] = useState(true);
  const primary = new Set(primaryList);
  const secondary = new Set(secondaryList);
  const labels = BASE_LABELS[language];
  const legend = LEGEND_LABELS[language];

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.CSS?.supports !== "function") {
      setMaskSupported(false);
      return;
    }

    const standard = window.CSS.supports("mask-image", "url('/anatomy/masks/front/chest.png')");
    const webkit = window.CSS.supports("-webkit-mask-image", "url('/anatomy/masks/front/chest.png')");
    setMaskSupported(Boolean(standard || webkit));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (["front", "back"] as const).forEach((view) => {
      const referencePath = view === "front" ? frontReferencePath : backReferencePath;
      const image = new Image();
      image.onload = () => {
        if (!cancelled) {
          setReferenceAvailable((current) => ({ ...current, [view]: true }));
        }
      };
      image.onerror = () => {
        if (!cancelled) {
          setReferenceAvailable((current) => ({ ...current, [view]: false }));
        }
      };
      image.src = referencePath;
    });

    return () => {
      cancelled = true;
    };
  }, [backReferencePath, frontReferencePath]);

  const colorForMuscle = (muscle: MuscleGroup): string => {
    if (primary.has(muscle)) {
      return "rgba(220, 38, 38, 0.72)";
    }
    if (secondary.has(muscle)) {
      return "rgba(220, 38, 38, 0.38)";
    }
    return "transparent";
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-3 mb-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="w-3 h-3 rounded-sm bg-[rgba(220,38,38,0.72)] border border-[rgba(220,38,38,0.9)]" />
          {legend.primary}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="w-3 h-3 rounded-sm bg-[rgba(220,38,38,0.38)] border border-[rgba(220,38,38,0.7)]" />
          {legend.secondary}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["front", "back"] as const).map((view) => {
          const hasReferenceImage = referenceAvailable[view];
          const activeMuscles = Array.from(new Set([...primaryList, ...secondaryList]));
          const fallbackMuscles = maskSupported
            ? activeMuscles.filter((muscle) => !hasMaskForMuscle(view, muscle))
            : activeMuscles;
          const fallbackMuscleSet = new Set(fallbackMuscles);
          const secondaryMaskLayers = maskSupported
            ? secondaryList
                .filter((muscle) => hasMaskForMuscle(view, muscle))
                .map((muscle) => renderMaskLayer(view, muscle, colorForMuscle(muscle)))
            : [];
          const primaryMaskLayers = maskSupported
            ? primaryList
                .filter((muscle) => hasMaskForMuscle(view, muscle))
                .map((muscle) => renderMaskLayer(view, muscle, colorForMuscle(muscle)))
            : [];

          return (
            <figure key={view} className="min-w-0 rounded-lg border border-border bg-background/40 p-2">
              <div className="relative aspect-[215/384] overflow-hidden rounded-md bg-slate-100/40">
                {hasReferenceImage ? (
                  <NextImage
                    src={resolvedReferencePaths[view]}
                    alt=""
                    fill
                    aria-hidden="true"
                    sizes="(max-width: 768px) 38vw, 140px"
                    className="select-none pointer-events-none object-fill"
                    style={{
                      filter: "grayscale(100%) contrast(1.06) brightness(1.02)",
                      opacity: 0.97,
                    }}
                  />
                ) : null}

                <div className="absolute inset-0">
                  {secondaryMaskLayers}
                  {primaryMaskLayers}
                </div>

                <svg viewBox="0 0 120 240" className="relative h-full w-full">
                  {!hasReferenceImage ? baseSilhouette : null}
                  {SHAPES.filter((shape) => shape.view === view)
                    .filter((shape) => fallbackMuscleSet.has(shape.muscle))
                    .map((shape) => renderShape(shape, colorForMuscle(shape.muscle)))}
                </svg>
              </div>
              <figcaption className="text-[10px] text-center text-muted-foreground mt-1 uppercase tracking-wide">
                {view === "front" ? labels.front : labels.back}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
