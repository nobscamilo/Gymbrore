"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { createOrUpdateProfile, updateUserProfile } from '@/lib/firebase/firestore';
import { UserProfile } from '@/lib/types';
import { generateTrainingPlan } from '@/app/actions/generateRoutine';
import { Loader2, ArrowRight, Ruler, Weight, User as UserIcon } from 'lucide-react';

type OnboardingFormData = {
    displayName: string;
    preferredLanguage: "es" | "en";
    age: string;
    weight: string;
    height: string;
    goal: UserProfile["goal"];
    trainingDays: string;
    equipment: UserProfile["equipment"];
    experienceLevel: UserProfile["experienceLevel"];
    injuries: string;
    nutritionAllergies: string;
    planStartDate: string;
    autoWeeklyRefresh: boolean;
    availableMinutesPerSession: string;
    acceptTerms: boolean;
    acceptPrivacy: boolean;
    acceptHealthDisclaimer: boolean;
};

const goalOptions: UserProfile["goal"][] = ["hypertrophy", "strength", "weight_loss", "endurance", "maintenance"];
const LEGAL_VERSION = "2026-03-06";
const getMonthKey = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    return `${year}-${month}`;
};

export default function OnboardingPage() {
    const { user } = useAuth();
    const { setLanguage } = useLanguage();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState<OnboardingFormData>({
        displayName: '',
        preferredLanguage: 'es',
        age: '',
        weight: '',
        height: '',
        goal: 'hypertrophy',
        trainingDays: '3',
        equipment: 'gym',
        experienceLevel: 'beginner',
        injuries: '',
        nutritionAllergies: '',
        planStartDate: new Date().toISOString().slice(0, 10),
        autoWeeklyRefresh: true,
        availableMinutesPerSession: '',
        acceptTerms: false,
        acceptPrivacy: false,
        acceptHealthDisclaimer: false,
    });

    const isEnglish = formData.preferredLanguage === 'en';
    const text = isEnglish
        ? {
            title: 'Setup your Profile',
            subtitle: 'Help us tailor the AI training program to your sports medicine needs.',
            sectionIdentity: 'Identity',
            sectionTraining: 'Training Profile',
            sectionPrefs: 'Plan Preferences',
            yourName: 'Your Name',
            yourNamePlaceholder: 'Example: Juan Camilo',
            language: 'Language',
            age: 'Age',
            weight: 'Weight (kg)',
            height: 'Height (cm)',
            trainingDays: 'Training Days / Week',
            experience: 'Experience Level',
            equipment: 'Equipment',
            injuries: 'Injuries or Limitations',
            injuriesPlaceholder: "Describe any injuries (e.g., left shoulder pain, lower back sensitivity).",
            allergies: 'Allergies and intolerances (required)',
            allergiesPlaceholder: 'Example: no allergies / egg allergy / lactose intolerance / celiac disease',
            startWhen: 'When do you want to start?',
            weeklyAuto: 'Weekly Auto Refresh',
            autoEnabled: 'Enabled (recommended)',
            autoDisabled: 'Disabled',
            autoHint: 'If enabled, your plan refreshes automatically after 7 days.',
            timeAvailable: 'Time available per session (optional)',
            timePlaceholder: 'Example: 60',
            timeHint: 'Leave empty to let AI choose the ideal duration for your objective.',
            goal: 'Primary Goal',
            complete: 'Complete Setup',
            beginner: 'Beginner (0-1 years)',
            intermediate: 'Intermediate (1-3 years)',
            advanced: 'Advanced (3+ years)',
            gym: 'Full Gym Access',
            dumbbells: 'Dumbbells Only',
            bodyweight: 'Bodyweight Only',
            mustName: 'Please provide your name.',
            allergiesRequired: 'Please record allergies/intolerances (write \"none\" if not applicable).',
            mustSigned: 'You must be signed in to complete onboarding.',
            noEmail: 'Your account does not have an email associated.',
            saveError: 'Error creating profile',
            legalSection: 'Legal & Data Protection',
            legalRequired: 'You must accept Terms, Privacy Policy, and Health Disclaimer to continue.',
            acceptTerms: 'I accept the Terms and Conditions',
            acceptPrivacy: 'I accept the Privacy Policy and GDPR data processing terms',
            acceptHealthDisclaimer: 'I understand this app provides AI support and does not replace medical diagnosis',
            legalHint: 'For EU launch: explicit consent is logged with timestamp and policy version.',
            openTerms: 'Read Terms',
            openPrivacy: 'Read Privacy',
        }
        : {
            title: 'Configura tu Perfil',
            subtitle: 'Ayudanos a personalizar el plan IA segun tu contexto de medicina deportiva.',
            sectionIdentity: 'Identidad',
            sectionTraining: 'Perfil de Entrenamiento',
            sectionPrefs: 'Preferencias del Plan',
            yourName: 'Tu Nombre',
            yourNamePlaceholder: 'Ejemplo: Juan Camilo',
            language: 'Idioma',
            age: 'Edad',
            weight: 'Peso (kg)',
            height: 'Estatura (cm)',
            trainingDays: 'Dias de entrenamiento / semana',
            experience: 'Nivel de Experiencia',
            equipment: 'Equipamiento',
            injuries: 'Lesiones o Limitaciones',
            injuriesPlaceholder: 'Describe cualquier lesion o molestia relevante para ajustar el plan.',
            allergies: 'Alergias e intolerancias (obligatorio)',
            allergiesPlaceholder: 'Ejemplo: sin alergias / alergia al huevo / intolerancia a lactosa / celiaquia',
            startWhen: 'Cuando deseas iniciar?',
            weeklyAuto: 'Actualizacion Auto Semanal',
            autoEnabled: 'Activa (recomendado)',
            autoDisabled: 'Inactiva',
            autoHint: 'Si esta activa, tu plan se actualiza automaticamente cada 7 dias.',
            timeAvailable: 'Tiempo disponible por sesion (opcional)',
            timePlaceholder: 'Ejemplo: 60',
            timeHint: 'Dejalo vacio para que la IA defina la duracion ideal segun tu objetivo.',
            goal: 'Objetivo Principal',
            complete: 'Completar Configuracion',
            beginner: 'Principiante (0-1 anos)',
            intermediate: 'Intermedio (1-3 anos)',
            advanced: 'Avanzado (3+ anos)',
            gym: 'Acceso completo a gimnasio',
            dumbbells: 'Solo mancuernas',
            bodyweight: 'Solo peso corporal',
            mustName: 'Por favor ingresa tu nombre.',
            allergiesRequired: 'Debes registrar alergias/intolerancias (escribe \"ninguna\" si no aplica).',
            mustSigned: 'Debes iniciar sesion para completar el onboarding.',
            noEmail: 'Tu cuenta no tiene correo asociado.',
            saveError: 'Error al crear el perfil',
            legalSection: 'Legal y Proteccion de Datos',
            legalRequired: 'Debes aceptar Terminos, Politica de Privacidad y Disclaimer de Salud para continuar.',
            acceptTerms: 'Acepto los Terminos y Condiciones',
            acceptPrivacy: 'Acepto la Politica de Privacidad y el tratamiento de datos (RGPD)',
            acceptHealthDisclaimer: 'Entiendo que esta app ofrece soporte IA y no reemplaza diagnostico medico',
            legalHint: 'Para lanzamiento en Europa: el consentimiento explicito se registra con fecha y version de politica.',
            openTerms: 'Ver Terminos',
            openPrivacy: 'Ver Privacidad',
        };

    useEffect(() => {
        if (!user) {
            router.replace('/login');
        }
    }, [router, user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            setError(text.mustSigned);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            if (!user.email) {
                throw new Error(text.noEmail);
            }

            if (!formData.displayName.trim()) {
                throw new Error(text.mustName);
            }

            if (!formData.nutritionAllergies.trim()) {
                throw new Error(text.allergiesRequired);
            }

            if (!formData.acceptTerms || !formData.acceptPrivacy || !formData.acceptHealthDisclaimer) {
                throw new Error(text.legalRequired);
            }

            const legalAcceptedAt = new Date().toISOString();
            const monthKey = getMonthKey();

            await createOrUpdateProfile(user.uid, {
                email: user.email,
                displayName: formData.displayName.trim(),
                preferredLanguage: formData.preferredLanguage,
                legalTermsAccepted: true,
                legalPrivacyAccepted: true,
                legalHealthDisclaimerAccepted: true,
                legalAcceptedAt,
                legalVersion: LEGAL_VERSION,
                age: Number(formData.age),
                weight: Number(formData.weight),
                height: Number(formData.height),
                goal: formData.goal,
                trainingDays: Number(formData.trainingDays),
                equipment: formData.equipment,
                experienceLevel: formData.experienceLevel,
                injuries: formData.injuries || undefined,
                nutritionAllergies: formData.nutritionAllergies.trim(),
                nutritionWeightCheckMonth: monthKey,
                nutritionWeightCheckAt: legalAcceptedAt,
                planStartDate: formData.planStartDate,
                autoWeeklyRefresh: formData.autoWeeklyRefresh,
                dailySessionLogs: "{}",
                availableMinutesPerSession: formData.availableMinutesPerSession
                    ? Number(formData.availableMinutesPerSession)
                    : undefined,
            });

            const profileForGeneration = {
                age: Number(formData.age),
                weight: Number(formData.weight),
                height: Number(formData.height),
                goal: formData.goal,
                equipment: formData.equipment,
                experienceLevel: formData.experienceLevel,
                injuries: formData.injuries || undefined,
                trainingDays: Number(formData.trainingDays),
                planStartDate: formData.planStartDate,
                availableMinutesPerSession: formData.availableMinutesPerSession
                    ? Number(formData.availableMinutesPerSession)
                    : undefined,
                preferredLanguage: formData.preferredLanguage,
            };

            let autoPlanFailed = false;
            try {
                const initialPlan = await generateTrainingPlan(profileForGeneration);
                if (!Array.isArray(initialPlan) || initialPlan.length === 0) {
                    throw new Error("Initial plan was empty.");
                }

                const generatedAt = new Date().toISOString();
                await updateUserProfile(user.uid, {
                    currentPlan: JSON.stringify(initialPlan),
                    currentPlanGeneratedAt: generatedAt,
                    currentPlanAcceptedAt: "",
                    dailyAdjustments: "{}",
                    dailySessionLogs: "{}",
                });
            } catch (planError) {
                console.error('Initial plan generation failed after onboarding:', planError);
                autoPlanFailed = true;
            }

            setLanguage(formData.preferredLanguage);
            router.replace(autoPlanFailed ? '/dashboard/plan?autoplan=failed' : '/dashboard/plan');
        } catch (submitError) {
            console.error('Onboarding profile save failed:', submitError);
            setError(submitError instanceof Error ? submitError.message : text.saveError);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen p-4 md:p-6">
            <div className="w-full max-w-4xl mx-auto animate-fade-in-up space-y-6">
                <header className="glass-panel rounded-3xl p-6 md:p-7">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{text.title}</h1>
                    <p className="text-muted-foreground mt-2">{text.subtitle}</p>
                </header>

                {error && (
                    <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="glass-panel rounded-2xl p-5 md:p-7 space-y-6">
                    <section className="space-y-4">
                        <h2 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{text.sectionIdentity}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{text.yourName}</label>
                                <input
                                    type="text"
                                    required
                                    data-testid="onb-display-name"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground placeholder:text-muted-foreground"
                                    placeholder={text.yourNamePlaceholder}
                                    value={formData.displayName}
                                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{text.language}</label>
                                <select
                                    data-testid="onb-language"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground"
                                    value={formData.preferredLanguage}
                                    onChange={(e) => setFormData({ ...formData, preferredLanguage: e.target.value as "es" | "en" })}
                                >
                                    <option value="es">Espanol</option>
                                    <option value="en">English</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4 pt-2 border-t border-border/70">
                        <h2 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{text.sectionTraining}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2 group">
                                <label className="text-sm font-medium flex items-center gap-2 text-muted-foreground group-focus-within:text-primary transition-colors">
                                    <UserIcon size={16} /> {text.age}
                                </label>
                                <input
                                    type="number" required min="10" max="100"
                                    data-testid="onb-age"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground"
                                    value={formData.age}
                                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-sm font-medium flex items-center gap-2 text-muted-foreground group-focus-within:text-primary transition-colors">
                                    <Weight size={16} /> {text.weight}
                                </label>
                                <input
                                    type="number" required min="30" max="300"
                                    data-testid="onb-weight"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground"
                                    value={formData.weight}
                                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-sm font-medium flex items-center gap-2 text-muted-foreground group-focus-within:text-primary transition-colors">
                                    <Ruler size={16} /> {text.height}
                                </label>
                                <input
                                    type="number" required min="100" max="250"
                                    data-testid="onb-height"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground"
                                    value={formData.height}
                                    onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{text.trainingDays}</label>
                                <select
                                    data-testid="onb-training-days"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground"
                                    value={formData.trainingDays}
                                    onChange={(e) => setFormData({ ...formData, trainingDays: e.target.value })}
                                >
                                    {[1, 2, 3, 4, 5, 6, 7].map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{text.experience}</label>
                                <select
                                    data-testid="onb-experience"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground"
                                    value={formData.experienceLevel}
                                    onChange={(e) => setFormData({ ...formData, experienceLevel: e.target.value as UserProfile["experienceLevel"] })}
                                >
                                    <option value="beginner">{text.beginner}</option>
                                    <option value="intermediate">{text.intermediate}</option>
                                    <option value="advanced">{text.advanced}</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{text.equipment}</label>
                                <select
                                    data-testid="onb-equipment"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground"
                                    value={formData.equipment}
                                    onChange={(e) => setFormData({ ...formData, equipment: e.target.value as UserProfile["equipment"] })}
                                >
                                    <option value="gym">{text.gym}</option>
                                    <option value="dumbbells">{text.dumbbells}</option>
                                    <option value="bodyweight">{text.bodyweight}</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2 group">
                            <label className="text-sm font-medium flex items-center gap-2 text-muted-foreground group-focus-within:text-primary transition-colors">
                                {text.injuries}
                            </label>
                            <textarea
                                className="w-full h-24 bg-input rounded-xl border border-border px-4 py-3 outline-none focus:ring-2 ring-primary transition-all text-foreground placeholder:text-muted-foreground resize-none"
                                placeholder={text.injuriesPlaceholder}
                                value={formData.injuries}
                                onChange={(e) => setFormData({ ...formData, injuries: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2 group">
                            <label className="text-sm font-medium flex items-center gap-2 text-muted-foreground group-focus-within:text-primary transition-colors">
                                {text.allergies}
                            </label>
                            <textarea
                                required
                                data-testid="onb-allergies"
                                className="w-full h-24 bg-input rounded-xl border border-border px-4 py-3 outline-none focus:ring-2 ring-primary transition-all text-foreground placeholder:text-muted-foreground resize-none"
                                placeholder={text.allergiesPlaceholder}
                                value={formData.nutritionAllergies}
                                onChange={(e) => setFormData({ ...formData, nutritionAllergies: e.target.value })}
                            />
                        </div>
                    </section>

                    <section className="space-y-4 pt-2 border-t border-border/70">
                        <h2 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{text.sectionPrefs}</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{text.startWhen}</label>
                                <input
                                    type="date"
                                    required
                                    data-testid="onb-start-date"
                                    className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground"
                                    value={formData.planStartDate}
                                    onChange={(e) => setFormData({ ...formData, planStartDate: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{text.weeklyAuto}</label>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, autoWeeklyRefresh: !formData.autoWeeklyRefresh })}
                                    className={`w-full h-11 rounded-xl border transition-colors text-sm font-semibold ${
                                        formData.autoWeeklyRefresh
                                            ? 'bg-primary/20 border-primary/40 text-primary'
                                            : 'bg-input border-border text-muted-foreground'
                                    }`}
                                >
                                    {formData.autoWeeklyRefresh ? text.autoEnabled : text.autoDisabled}
                                </button>
                                <p className="text-xs text-muted-foreground">{text.autoHint}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{text.timeAvailable}</label>
                            <input
                                type="number"
                                min={20}
                                max={240}
                                data-testid="onb-session-minutes"
                                className="w-full h-11 bg-input rounded-xl border border-border px-4 outline-none focus:ring-2 ring-primary transition-all text-foreground placeholder:text-muted-foreground"
                                placeholder={text.timePlaceholder}
                                value={formData.availableMinutesPerSession}
                                onChange={(e) => setFormData({ ...formData, availableMinutesPerSession: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">{text.timeHint}</p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium text-muted-foreground">{text.goal}</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {goalOptions.map((g) => (
                                    <button
                                        key={g}
                                        type="button"
                                        data-testid={`onb-goal-${g}`}
                                        onClick={() => setFormData({ ...formData, goal: g })}
                                        className={`h-12 rounded-xl border text-sm font-bold transition-all capitalize flex items-center justify-center ${
                                            formData.goal === g
                                                ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_15px_rgba(20,184,166,0.35)]'
                                                : 'bg-input border-border text-muted-foreground hover:border-primary hover:text-foreground'
                                        }`}
                                    >
                                        {g.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3 pt-2 border-t border-border/70">
                        <h2 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{text.legalSection}</h2>
                        <label className="flex items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={formData.acceptTerms}
                                data-testid="onb-accept-terms"
                                onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })}
                                className="mt-1 h-4 w-4 accent-primary"
                            />
                            <span>{text.acceptTerms} (<Link href="/legal/terms" target="_blank" className="text-primary hover:underline">{text.openTerms}</Link>)</span>
                        </label>

                        <label className="flex items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={formData.acceptPrivacy}
                                data-testid="onb-accept-privacy"
                                onChange={(e) => setFormData({ ...formData, acceptPrivacy: e.target.checked })}
                                className="mt-1 h-4 w-4 accent-primary"
                            />
                            <span>{text.acceptPrivacy} (<Link href="/legal/privacy" target="_blank" className="text-primary hover:underline">{text.openPrivacy}</Link>)</span>
                        </label>

                        <label className="flex items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={formData.acceptHealthDisclaimer}
                                data-testid="onb-accept-health"
                                onChange={(e) => setFormData({ ...formData, acceptHealthDisclaimer: e.target.checked })}
                                className="mt-1 h-4 w-4 accent-primary"
                            />
                            <span>{text.acceptHealthDisclaimer}</span>
                        </label>
                        <p className="text-xs text-muted-foreground">{text.legalHint}</p>
                    </section>

                    <button
                        type="submit"
                        disabled={loading}
                        data-testid="onb-submit"
                        className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 mt-2 hover:scale-[1.01] transition-transform shadow-lg"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : (
                            <>
                                {text.complete} <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </main>
    );
}
