"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ExternalLink, PlayCircle } from "lucide-react";
import { getExerciseInsight, SupportedLanguage } from "@/lib/exerciseCatalog";
import type { UserProfile } from "@/lib/types";

const LazyMuscleSilhouette = dynamic(() => import("@/components/MuscleSilhouette"), {
  ssr: false,
  loading: () => (
    <div className="h-48 rounded-md border border-border/60 bg-background/35 animate-pulse" />
  ),
});

type ExerciseTechniquePanelProps = {
  exerciseName: string;
  language: SupportedLanguage;
  experienceLevel?: UserProfile["experienceLevel"];
  showVideo?: boolean;
  compact?: boolean;
};

export default function ExerciseTechniquePanel({
  exerciseName,
  language,
  experienceLevel = "beginner",
  showVideo = true,
  compact = false,
}: ExerciseTechniquePanelProps) {
  const insight = getExerciseInsight(exerciseName, language);
  const [showInlineVideo, setShowInlineVideo] = useState(false);
  const [showMuscleMap, setShowMuscleMap] = useState(false);
  const isEnglish = language === "en";
  const showDetailedDetails = experienceLevel !== "beginner";

  const text = isEnglish
    ? {
        technique: "Technique",
        primaryActive: "Primary Muscles (Active)",
        secondaryPassive: "Secondary Muscles (Passive)",
        cautions: "Clinical Cautions",
        noSecondary: "No secondary muscles detected.",
        noCautions: "No specific pain flags detected.",
        localVideo: "Local Video",
        showVideo: "Show video",
        hideVideo: "Hide video",
        external: "YouTube Technique Search",
        pattern: "Pattern",
        equipment: "Equipment",
        level: "Level",
        analysis: "Clinical Analysis",
        basicMode: "Basic mode: pattern metadata and cautions are simplified for beginner level.",
        anatomy: "Muscle Map",
        showAnatomy: "Show muscle map",
        hideAnatomy: "Hide muscle map",
      }
    : {
        technique: "Tecnica",
        primaryActive: "Musculos Primarios (Activos)",
        secondaryPassive: "Musculos Secundarios (Pasivos)",
        cautions: "Precauciones Clinicas",
        noSecondary: "No se detectaron musculos secundarios relevantes.",
        noCautions: "No se detectaron banderas de dolor especificas.",
        localVideo: "Video Local",
        showVideo: "Mostrar video",
        hideVideo: "Ocultar video",
        external: "Buscar Tecnica en YouTube",
        pattern: "Patron",
        equipment: "Equipo",
        level: "Nivel",
        analysis: "Analisis Clinico",
        basicMode: "Modo basico: se simplifican metadatos del patron y precauciones para nivel principiante.",
        anatomy: "Mapa Muscular",
        showAnatomy: "Mostrar mapa muscular",
        hideAnatomy: "Ocultar mapa muscular",
      };

  return (
    <section className="rounded-lg border border-border bg-card/40 p-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="text-[11px] px-2 py-1 rounded-full bg-background border border-border font-semibold">
          {text.equipment}: {insight.equipmentLabel}
        </span>
        {showDetailedDetails && (
          <>
            <span className="text-[11px] px-2 py-1 rounded-full bg-primary/15 text-primary font-semibold">
              {text.pattern}: {insight.movementPatternLabel}
            </span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-background border border-border font-semibold">
              {text.level}: {insight.difficultyLabel}
            </span>
          </>
        )}
      </div>

      {showVideo && insight.localUrl && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowInlineVideo((current) => !current)}
            className="h-8 px-3 rounded-lg border border-border bg-background/70 text-xs font-semibold flex items-center gap-1 hover:bg-background"
          >
            <PlayCircle size={13} />
            {showInlineVideo ? text.hideVideo : text.showVideo}
          </button>
          {showInlineVideo && (
            <video
              className="w-full rounded-lg border border-border bg-black/30"
              controls
              preload="none"
              src={insight.localUrl}
            />
          )}
        </div>
      )}

      <div className="flex justify-between items-center gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          {text.anatomy}
        </p>
        <button
          type="button"
          onClick={() => setShowMuscleMap((current) => !current)}
          className="h-8 px-3 rounded-lg border border-border bg-background/70 text-xs font-semibold hover:bg-background"
        >
          {showMuscleMap ? text.hideAnatomy : text.showAnatomy}
        </button>
      </div>

      <div className={`grid ${compact ? "grid-cols-1" : "grid-cols-1"} gap-3`}>
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
              {text.analysis}
            </p>
            <p className="text-xs text-foreground/90">{insight.analysisSummary}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
              {text.technique}
            </p>
            <ul className="text-xs space-y-1 text-foreground/90 list-disc pl-4">
              {insight.techniqueCues.map((cue, index) => (
                <li key={`${exerciseName}-cue-${index}`}>{cue}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
              {text.primaryActive}
            </p>
            <p className="text-xs text-foreground/90">{insight.primaryMuscleLabels.join(", ")}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
              {text.secondaryPassive}
            </p>
            <p className="text-xs text-foreground/90">
              {insight.secondaryMuscleLabels.length > 0
                ? insight.secondaryMuscleLabels.join(", ")
                : text.noSecondary}
            </p>
          </div>

          {!showDetailedDetails && (
            <p className="text-[11px] text-muted-foreground">{text.basicMode}</p>
          )}

          {showDetailedDetails && (
            <>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                  {text.cautions}
                </p>
                {insight.painFlagLabels.length > 0 ? (
                  <ul className="text-xs space-y-1 text-foreground/90 list-disc pl-4">
                    {insight.painFlagLabels.map((caution, index) => (
                      <li key={`${exerciseName}-caution-${index}`}>{caution}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-foreground/90">{text.noCautions}</p>
                )}
              </div>
            </>
          )}

          {showMuscleMap && (
            <LazyMuscleSilhouette
              primaryMuscles={insight.primaryMuscles}
              secondaryMuscles={insight.secondaryMuscles}
              language={language}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {insight.localUrl && (
          <a
            href={insight.localUrl}
            target="_blank"
            rel="noreferrer"
            className="h-8 px-3 rounded-lg border border-border bg-background/70 text-xs font-semibold flex items-center gap-1 hover:bg-background"
          >
            <PlayCircle size={13} />
            {text.localVideo}
          </a>
        )}
        <a
          href={insight.youtubeTechniqueUrl}
          target="_blank"
          rel="noreferrer"
          className="h-8 px-3 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-semibold flex items-center gap-1 hover:bg-primary/15"
        >
          {text.external}
          <ExternalLink size={12} />
        </a>
      </div>
    </section>
  );
}
