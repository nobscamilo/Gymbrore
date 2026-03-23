"use client";

import { FormEvent, useEffect, useState } from "react";
import { Brain, Loader2, Save, Scale, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getUserProfile, updateUserProfile } from "@/lib/firebase/firestore";
import type { UserProfile } from "@/lib/types";

type ExperienceLevel = UserProfile["experienceLevel"];

type SettingsFormState = {
  displayName: string;
  weight: string;
  experienceLevel: ExperienceLevel;
  availableMinutesPerSession: string;
  injuries: string;
  nutritionAllergies: string;
};

const INITIAL_FORM: SettingsFormState = {
  displayName: "",
  weight: "",
  experienceLevel: "beginner",
  availableMinutesPerSession: "",
  injuries: "",
  nutritionAllergies: "",
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === "en";

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SettingsFormState>(INITIAL_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const text = isEnglish
    ? {
        title: "Profile Settings",
        subtitle: "Update your profile and training detail level.",
        name: "Display name",
        weight: "Current weight (kg)",
        level: "Knowledge level",
        minutes: "Default session time (minutes)",
        injuries: "Pain or limitations (optional)",
        injuriesPlaceholder: "Example: right shoulder discomfort in overhead press",
        allergies: "Allergies and intolerances (required)",
        allergiesPlaceholder: "Example: none / egg allergy / lactose intolerance / celiac disease",
        beginner: "Beginner",
        intermediate: "Intermediate",
        advanced: "Advanced",
        expert: "Expert",
        beginnerHelp: "Essential cues only for clean execution.",
        intermediateHelp: "Adds key muscle context and main cautions.",
        advancedHelp: "Adds deeper technical and muscle detail.",
        expertHelp: "Full rationale and maximal technical context.",
        save: "Save changes",
        saving: "Saving...",
        saved: "Profile updated successfully.",
        loadError: "Could not load your profile settings.",
        saveError: "Could not save profile changes.",
        signInRequired: "You must be signed in.",
        nameRequired: "Display name is required.",
        allergiesRequired: "Allergies/intolerances are required (write \"none\" if not applicable).",
        weightRequired: "Weight must be between 30 and 300 kg.",
        minutesRange: "Session time must be between 20 and 240 minutes.",
      }
    : {
        title: "Configuracion de Perfil",
        subtitle: "Actualiza tu perfil y el nivel de detalle de entrenamiento.",
        name: "Nombre a mostrar",
        weight: "Peso actual (kg)",
        level: "Nivel de conocimiento",
        minutes: "Tiempo por sesion por defecto (minutos)",
        injuries: "Dolor o limitaciones (opcional)",
        injuriesPlaceholder: "Ejemplo: molestia en hombro derecho en press por encima de la cabeza",
        allergies: "Alergias e intolerancias (obligatorio)",
        allergiesPlaceholder: "Ejemplo: ninguna / alergia al huevo / intolerancia a lactosa / celiaquia",
        beginner: "Principiante",
        intermediate: "Intermedio",
        advanced: "Avanzado",
        expert: "Experto",
        beginnerHelp: "Solo cues esenciales para ejecutar limpio.",
        intermediateHelp: "Agrega contexto muscular y precauciones clave.",
        advancedHelp: "Agrega mas detalle tecnico y muscular.",
        expertHelp: "Razon completa y maximo detalle tecnico.",
        save: "Guardar cambios",
        saving: "Guardando...",
        saved: "Perfil actualizado correctamente.",
        loadError: "No se pudo cargar la configuracion del perfil.",
        saveError: "No se pudieron guardar los cambios del perfil.",
        signInRequired: "Debes iniciar sesion.",
        nameRequired: "El nombre es obligatorio.",
        allergiesRequired: "Las alergias/intolerancias son obligatorias (escribe \"ninguna\" si no aplica).",
        weightRequired: "El peso debe estar entre 30 y 300 kg.",
        minutesRange: "El tiempo por sesion debe estar entre 20 y 240 minutos.",
      };

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!user) {
        if (isMounted) {
          setLoadingProfile(false);
        }
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);
        if (!profile) {
          if (isMounted) {
            setError(text.loadError);
          }
          return;
        }

        if (!isMounted) {
          return;
        }

        setForm({
          displayName: profile.displayName ?? "",
          weight: profile.weight ? String(profile.weight) : "",
          experienceLevel: profile.experienceLevel ?? "beginner",
          availableMinutesPerSession: profile.availableMinutesPerSession
            ? String(profile.availableMinutesPerSession)
            : "",
          injuries: profile.injuries ?? "",
          nutritionAllergies: profile.nutritionAllergies ?? "",
        });
      } catch (loadError) {
        console.error("Settings profile load failed:", loadError);
        if (isMounted) {
          setError(text.loadError);
        }
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [text.loadError, user]);

  const getLevelHint = (value: ExperienceLevel): string => {
    if (value === "beginner") {
      return text.beginnerHelp;
    }
    if (value === "intermediate") {
      return text.intermediateHelp;
    }
    if (value === "advanced") {
      return text.advancedHelp;
    }
    return text.expertHelp;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setError(text.signInRequired);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const normalizedName = form.displayName.trim();
      if (!normalizedName) {
        throw new Error(text.nameRequired);
      }

      const normalizedAllergies = form.nutritionAllergies.trim();
      if (!normalizedAllergies) {
        throw new Error(text.allergiesRequired);
      }

      const parsedWeight = Number(form.weight);
      if (!Number.isFinite(parsedWeight) || parsedWeight < 30 || parsedWeight > 300) {
        throw new Error(text.weightRequired);
      }

      const parsedMinutes = form.availableMinutesPerSession.trim().length > 0
        ? Number(form.availableMinutesPerSession)
        : undefined;

      if (
        parsedMinutes !== undefined &&
        (!Number.isFinite(parsedMinutes) || parsedMinutes < 20 || parsedMinutes > 240)
      ) {
        throw new Error(text.minutesRange);
      }

      await updateUserProfile(user.uid, {
        displayName: normalizedName,
        weight: parsedWeight,
        experienceLevel: form.experienceLevel,
        availableMinutesPerSession: parsedMinutes,
        injuries: form.injuries.trim() || undefined,
        nutritionAllergies: normalizedAllergies,
      });

      setNotice(text.saved);
    } catch (submitError) {
      console.error("Settings profile save failed:", submitError);
      setError(getErrorMessage(submitError, text.saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="max-w-3xl mx-auto glass-panel rounded-2xl p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <header className="glass-panel rounded-3xl p-6 md:p-7">
        <h1 className="text-3xl font-bold tracking-tight">{text.title}</h1>
        <p className="text-muted-foreground mt-1">{text.subtitle}</p>
      </header>

      {notice && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm px-4 py-3">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3">
          {error}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <form onSubmit={handleSubmit} className="glass-panel rounded-2xl p-5 md:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-muted-foreground inline-flex items-center gap-2">
                <UserIcon size={14} />
                {text.name}
              </span>
              <input
                value={form.displayName}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                className="w-full h-11 rounded-xl bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-muted-foreground inline-flex items-center gap-2">
                <Scale size={14} />
                {text.weight}
              </span>
              <input
                type="number"
                min={30}
                max={300}
                value={form.weight}
                onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))}
                className="w-full h-11 rounded-xl bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
                required
              />
            </label>
          </div>

          <label className="space-y-1 block">
            <span className="text-sm font-semibold text-muted-foreground inline-flex items-center gap-2">
              <Brain size={14} />
              {text.level}
            </span>
            <select
              value={form.experienceLevel}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, experienceLevel: event.target.value as ExperienceLevel }))
              }
              className="w-full h-11 rounded-xl bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
            >
              <option value="beginner">{text.beginner}</option>
              <option value="intermediate">{text.intermediate}</option>
              <option value="advanced">{text.advanced}</option>
              <option value="expert">{text.expert}</option>
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-sm font-semibold text-muted-foreground">{text.minutes}</span>
            <input
              type="number"
              min={20}
              max={240}
              value={form.availableMinutesPerSession}
              onChange={(event) => setForm((prev) => ({ ...prev, availableMinutesPerSession: event.target.value }))}
              className="w-full h-11 rounded-xl bg-input border border-border px-3 text-sm outline-none focus:ring-2 ring-primary"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-sm font-semibold text-muted-foreground">{text.injuries}</span>
            <textarea
              value={form.injuries}
              onChange={(event) => setForm((prev) => ({ ...prev, injuries: event.target.value }))}
              placeholder={text.injuriesPlaceholder}
              className="w-full h-24 rounded-xl bg-input border border-border px-3 py-2 text-sm outline-none focus:ring-2 ring-primary resize-none"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-sm font-semibold text-muted-foreground">{text.allergies}</span>
            <textarea
              value={form.nutritionAllergies}
              onChange={(event) => setForm((prev) => ({ ...prev, nutritionAllergies: event.target.value }))}
              placeholder={text.allergiesPlaceholder}
              className="w-full h-24 rounded-xl bg-input border border-border px-3 py-2 text-sm outline-none focus:ring-2 ring-primary resize-none"
              required
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {saving ? text.saving : text.save}
          </button>
        </form>

        <aside className="glass-panel rounded-2xl p-5 space-y-4 h-fit">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{text.level}</p>
          <p className="font-semibold text-primary">
            {form.experienceLevel === "beginner"
              ? text.beginner
              : form.experienceLevel === "intermediate"
                ? text.intermediate
                : form.experienceLevel === "advanced"
                  ? text.advanced
                  : text.expert}
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed">{getLevelHint(form.experienceLevel)}</p>

          <div className="pt-3 border-t border-border/70 space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{text.minutes}</p>
            <p className="text-sm font-semibold">
              {form.availableMinutesPerSession.trim().length > 0
                ? `${form.availableMinutesPerSession} min`
                : isEnglish
                  ? "Auto (AI decides)"
                  : "Auto (decide IA)"}
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
