"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getUserProfile } from "@/lib/firebase/firestore";
import {
  getCatalogFilterOptions,
  getCuratedExerciseCatalog,
  getExerciseInsight,
  MuscleGroup,
  PainFlag,
  SupportedLanguage,
} from "@/lib/exerciseCatalog";

const LazyExerciseTechniquePanel = dynamic(() => import("@/components/ExerciseTechniquePanel"), {
    ssr: false,
    loading: () => (
        <div className="h-20 rounded-md border border-border/60 bg-background/40 animate-pulse" />
    ),
});

const LazyMuscleSilhouette = dynamic(() => import("@/components/MuscleSilhouette"), {
    ssr: false,
    loading: () => (
        <div className="h-48 rounded-md border border-border/60 bg-background/40 animate-pulse" />
    ),
});

const normalize = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export default function VideoLibraryPage() {
    const { user } = useAuth();
    const { language } = useLanguage();
    const selectedLanguage: SupportedLanguage = language === "en" ? "en" : "es";
    const [viewerExperienceLevel, setViewerExperienceLevel] = useState<"beginner" | "intermediate" | "advanced" | "expert">("beginner");
    const [query, setQuery] = useState("");
    const [queryDraft, setQueryDraft] = useState("");
    const [patternFilter, setPatternFilter] = useState("all");
    const [equipmentFilter, setEquipmentFilter] = useState("all");
    const [muscleFilter, setMuscleFilter] = useState<"all" | MuscleGroup>("all");
    const [painFilter, setPainFilter] = useState<"all" | PainFlag>("all");
    const [modalityFilter, setModalityFilter] = useState<"all" | "trx" | "pilates" | "yoga">("all");
    const [visibleCount, setVisibleCount] = useState(12);
    const [qaPrimaryMuscle, setQaPrimaryMuscle] = useState<MuscleGroup>("chest");
    const [qaSecondaryMuscle, setQaSecondaryMuscle] = useState<"none" | MuscleGroup>("shoulders");
    const [openTechniqueCards, setOpenTechniqueCards] = useState<Record<string, boolean>>({});
    const [showAnatomyQa, setShowAnatomyQa] = useState(false);
    const deferredQuery = useDeferredValue(query);

    const catalog = useMemo(() => {
        return getCuratedExerciseCatalog();
    }, []);

    const filterOptions = useMemo(() => getCatalogFilterOptions(selectedLanguage), [selectedLanguage]);
    const isEnglish = selectedLanguage === "en";
    const text = isEnglish
        ? {
            title: "Exercise Video Library",
            subtitle: "Curated movement library with clinical metadata, technique, and target-muscle details.",
            note: "Video index source: Complete Anatomy local directory.",
            search: "Search exercise",
            searchAction: "Search",
            clearSearch: "Clear",
            quickSearch: "Quick filters",
            modality: "Modality",
            pattern: "Pattern",
            equipment: "Equipment",
            muscle: "Muscle",
            pain: "Pain Flag",
            anatomyQaTitle: "Muscle-by-Muscle Review",
            anatomyQaSubtitle: "Use this QA view to verify which regions are highlighted before assigning or replacing exercises.",
            anatomyQaPrimary: "Primary highlight",
            anatomyQaSecondary: "Secondary highlight",
            anatomyQaNone: "None",
            anatomyQaExpand: "Open QA panel",
            anatomyQaCollapse: "Hide QA panel",
            anatomyQaHint: "If a movement highlights the wrong region here, the exercise metadata needs correction. This section is for checking that, not for decoration.",
            all: "All",
            showing: "Showing",
            of: "of",
            videos: "videos",
            loadMore: "Load more",
            noResults: "No videos match the current filters.",
            curated: "Curated",
            localVideo: "Local Video",
            youtubeOnly: "YouTube Curated",
            canonical: "Canonical name",
            viewTechnique: "View technique + muscle map",
            openPreviewHint: "Expand this section to load full technique guidance.",
        }
        : {
            title: "Biblioteca de Videos de Ejercicios",
            subtitle: "Libreria curada con metadatos clinicos, tecnica y detalle muscular por escrito.",
            note: "Fuente del indice: carpeta local de videos Complete Anatomy.",
            search: "Buscar ejercicio",
            searchAction: "Buscar",
            clearSearch: "Limpiar",
            quickSearch: "Filtros rapidos",
            modality: "Modalidad",
            pattern: "Patron",
            equipment: "Equipo",
            muscle: "Musculo",
            pain: "Bandera de dolor",
            anatomyQaTitle: "Revision Musculo por Musculo",
            anatomyQaSubtitle: "Usa esta vista de control para verificar que regiones se resaltan antes de asignar o sustituir ejercicios.",
            anatomyQaPrimary: "Resalte primario",
            anatomyQaSecondary: "Resalte secundario",
            anatomyQaNone: "Ninguno",
            anatomyQaExpand: "Abrir panel QA",
            anatomyQaCollapse: "Ocultar panel QA",
            anatomyQaHint: "Si un movimiento resalta la zona incorrecta aqui, la metadata del ejercicio necesita correccion. Esta seccion es para revisar eso, no para decorar.",
            all: "Todos",
            showing: "Mostrando",
            of: "de",
            videos: "videos",
            loadMore: "Cargar mas",
            noResults: "No hay videos que cumplan los filtros actuales.",
            curated: "Curado",
            localVideo: "Video Local",
            youtubeOnly: "YouTube Curado",
            canonical: "Nombre canonico",
            viewTechnique: "Ver tecnica + mapa muscular",
            openPreviewHint: "Expande esta seccion para cargar la guia tecnica completa.",
        };
    const quickLibraryTerms = isEnglish
        ? ["trx", "pilates", "yoga", "core", "mobility", "glutes"]
        : ["trx", "pilates", "yoga", "core", "movilidad", "gluteos"];

    const modalityOptions = useMemo(
        () => [
            { key: "all" as const, label: text.all },
            { key: "trx" as const, label: "TRX" },
            { key: "pilates" as const, label: "Pilates" },
            { key: "yoga" as const, label: "Yoga" },
        ],
        [text.all]
    );

    const filteredVideos = useMemo(() => {
        const normalized = normalize(deferredQuery);
        return catalog.filter((entry) => {
            const matchesQuery =
                !normalized ||
                normalize(entry.nameEn).includes(normalized) ||
                normalize(entry.nameEs).includes(normalized) ||
                entry.keywords.some((keyword) => normalize(keyword).includes(normalized));
            const normalizedEntryText = normalize(
                `${entry.nameEn} ${entry.nameEs} ${entry.keywords.join(" ")}`
            );
            const matchesModality =
                modalityFilter === "all" || normalizedEntryText.includes(modalityFilter);

            const matchesPattern = patternFilter === "all" || entry.movementPattern === patternFilter;
            const matchesEquipment = equipmentFilter === "all" || entry.equipment === equipmentFilter;
            const matchesMuscle =
                muscleFilter === "all" ||
                entry.primaryMuscles.includes(muscleFilter) ||
                entry.secondaryMuscles.includes(muscleFilter);
            const matchesPain = painFilter === "all" || entry.painFlags.includes(painFilter);

            return matchesQuery && matchesModality && matchesPattern && matchesEquipment && matchesMuscle && matchesPain;
        });
    }, [catalog, deferredQuery, modalityFilter, patternFilter, equipmentFilter, muscleFilter, painFilter]);

    const visibleItems = filteredVideos.slice(0, visibleCount);

    useEffect(() => {
        let isMounted = true;

        const loadLevel = async () => {
            if (!user) {
                return;
            }

            try {
                const profile = await getUserProfile(user.uid);
                if (!isMounted) {
                    return;
                }

                setViewerExperienceLevel(profile?.experienceLevel ?? "beginner");
            } catch (error) {
                console.error("Failed to load profile level for library:", error);
            }
        };

        loadLevel();

        return () => {
            isMounted = false;
        };
    }, [user]);

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in-up overflow-x-hidden">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{text.title}</h1>
                <p className="text-muted-foreground mt-1">
                    {text.subtitle}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                    {text.note}
                </p>
                <form
                    className="mt-3 flex flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setQuery(queryDraft.trim());
                        setVisibleCount(12);
                    }}
                >
                    <input
                        type="text"
                        value={queryDraft}
                        onChange={(event) => setQueryDraft(event.target.value)}
                        placeholder={text.search}
                        className="h-10 w-full max-w-md rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                    />
                    <button
                        type="submit"
                        className="h-10 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15"
                    >
                        {text.searchAction}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setQueryDraft("");
                            setQuery("");
                            setVisibleCount(12);
                        }}
                        className="h-10 px-4 rounded-lg border border-border bg-background/60 text-sm font-semibold hover:bg-background"
                    >
                        {text.clearSearch}
                    </button>
                </form>
                <div className="mt-3 space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{text.quickSearch}</p>
                    <div className="flex flex-wrap gap-2">
                        {quickLibraryTerms.map((term) => (
                            <button
                                key={`library-quick-${term}`}
                                type="button"
                                onClick={() => {
                                    setQueryDraft(term);
                                    setQuery(term);
                                    setVisibleCount(12);
                                }}
                                className="h-8 px-3 rounded-full border border-primary/35 bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/15"
                            >
                                {term}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.modality}</label>
                    <select
                        value={modalityFilter}
                        onChange={(event) => {
                            setModalityFilter(event.target.value as "all" | "trx" | "pilates" | "yoga");
                            setVisibleCount(12);
                        }}
                        className="w-full h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                    >
                        {modalityOptions.map((option) => (
                            <option key={`modality-${option.key}`} value={option.key}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.pattern}</label>
                    <select
                        value={patternFilter}
                        onChange={(event) => {
                            setPatternFilter(event.target.value);
                            setVisibleCount(12);
                        }}
                        className="w-full h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                    >
                        <option value="all">{text.all}</option>
                        {filterOptions.movementPatterns.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.equipment}</label>
                    <select
                        value={equipmentFilter}
                        onChange={(event) => {
                            setEquipmentFilter(event.target.value);
                            setVisibleCount(12);
                        }}
                        className="w-full h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                    >
                        <option value="all">{text.all}</option>
                        {filterOptions.equipmentTypes.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.muscle}</label>
                    <select
                        value={muscleFilter}
                        onChange={(event) => {
                            setMuscleFilter(event.target.value as "all" | MuscleGroup);
                            setVisibleCount(12);
                        }}
                        className="w-full h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                    >
                        <option value="all">{text.all}</option>
                        {filterOptions.muscles.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text.pain}</label>
                    <select
                        value={painFilter}
                        onChange={(event) => {
                            setPainFilter(event.target.value as "all" | PainFlag);
                            setVisibleCount(12);
                        }}
                        className="w-full h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                    >
                        <option value="all">{text.all}</option>
                        {filterOptions.painFlags.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </section>

            <section className="rounded-2xl border border-border/80 bg-card/45 p-4 md:p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-lg font-bold">{text.anatomyQaTitle}</h2>
                    <button
                        type="button"
                        onClick={() => setShowAnatomyQa((current) => !current)}
                        className="h-9 px-3 rounded-lg border border-border bg-background/65 text-xs font-semibold hover:bg-background"
                    >
                        {showAnatomyQa ? text.anatomyQaCollapse : text.anatomyQaExpand}
                    </button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{text.anatomyQaSubtitle}</p>

                {showAnatomyQa ? (
                    <div className="grid grid-cols-1 lg:grid-cols-[220px_220px_1fr] gap-4 items-start">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {text.anatomyQaPrimary}
                            </label>
                            <select
                                value={qaPrimaryMuscle}
                                onChange={(event) => setQaPrimaryMuscle(event.target.value as MuscleGroup)}
                                className="w-full h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            >
                                {filterOptions.muscles.map((option) => (
                                    <option key={`qa-primary-${option.value}`} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {text.anatomyQaSecondary}
                            </label>
                            <select
                                value={qaSecondaryMuscle}
                                onChange={(event) => setQaSecondaryMuscle(event.target.value as "none" | MuscleGroup)}
                                className="w-full h-10 rounded-lg bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                            >
                                <option value="none">{text.anatomyQaNone}</option>
                                {filterOptions.muscles.map((option) => (
                                    <option key={`qa-secondary-${option.value}`} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-background/35 p-3">
                            <LazyMuscleSilhouette
                                primaryMuscles={[qaPrimaryMuscle]}
                                secondaryMuscles={qaSecondaryMuscle === "none" ? [] : [qaSecondaryMuscle]}
                                language={selectedLanguage}
                            />
                        </div>
                    </div>
                ) : null}

                <p className="text-xs text-muted-foreground">{text.anatomyQaHint}</p>
            </section>

            <p className="text-xs text-muted-foreground">
                {text.showing} {Math.min(visibleItems.length, filteredVideos.length)} {text.of} {filteredVideos.length} {text.videos}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {visibleItems.map((item) => {
                    const insight = getExerciseInsight(item.nameEn, selectedLanguage);
                    const isTechniqueOpen = !!openTechniqueCards[item.id];
                    return (
                        <article key={item.id} className="exercise-card-lazy rounded-xl border border-border bg-card/50 p-4 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-bold">{insight.displayName}</h2>
                                <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-primary/15 text-primary">
                                    {text.curated}
                                </span>
                                <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
                                    insight.localUrl
                                        ? "bg-emerald-500/15 text-emerald-300"
                                        : "bg-amber-500/15 text-amber-300"
                                }`}>
                                    {insight.localUrl ? text.localVideo : text.youtubeOnly}
                                </span>
                            </div>

                            {selectedLanguage === "es" && (
                                <p className="text-xs text-muted-foreground">
                                    {text.canonical}: {item.nameEn}
                                </p>
                            )}

                            <details
                                className="rounded-md border border-border/70 bg-background/35 p-2"
                                onToggle={(event) => {
                                    const isOpen = (event.currentTarget as HTMLDetailsElement).open;
                                    setOpenTechniqueCards((prev) => (
                                        prev[item.id] === isOpen
                                            ? prev
                                            : { ...prev, [item.id]: isOpen }
                                    ));
                                }}
                            >
                                <summary className="cursor-pointer text-xs font-semibold text-primary">
                                    {text.viewTechnique}
                                </summary>
                                <div className="pt-2">
                                    {isTechniqueOpen ? (
                                        <LazyExerciseTechniquePanel
                                            exerciseName={item.nameEn}
                                            language={selectedLanguage}
                                            experienceLevel={viewerExperienceLevel}
                                            showVideo
                                            compact
                                        />
                                    ) : (
                                        <p className="text-[11px] text-muted-foreground">{text.openPreviewHint}</p>
                                    )}
                                </div>
                            </details>
                        </article>
                    );
                })}
            </div>

            {filteredVideos.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                    {text.noResults}
                </div>
            )}

            {visibleCount < filteredVideos.length && (
                <div className="flex justify-center">
                    <button
                        onClick={() => setVisibleCount((current) => current + 12)}
                        className="h-10 px-4 rounded-lg border border-border bg-card hover:bg-card/80 text-sm font-semibold"
                    >
                        {text.loadMore}
                    </button>
                </div>
            )}
        </div>
    );
}
