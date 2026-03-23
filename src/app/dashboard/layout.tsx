"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { CalendarDays, Languages, LayoutDashboard, Library, Loader2, LogOut, Settings, Target, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getUserProfile, updateUserProfile } from "@/lib/firebase/firestore";
import { logoutUser } from "@/lib/firebase/auth";

type NavItem = {
    href: string;
    labelKey: "overview" | "session" | "plan" | "nutrition" | "library" | "settings";
    icon: ComponentType<{ size?: number }>;
};

const navItems: NavItem[] = [
    { href: "/dashboard", labelKey: "overview", icon: LayoutDashboard },
    { href: "/dashboard/session", labelKey: "session", icon: Target },
    { href: "/dashboard/plan", labelKey: "plan", icon: CalendarDays },
    { href: "/dashboard/nutrition", labelKey: "nutrition", icon: UtensilsCrossed },
    { href: "/dashboard/library", labelKey: "library", icon: Library },
    { href: "/dashboard/settings", labelKey: "settings", icon: Settings },
];

const isActiveRoute = (pathname: string, href: string): boolean => {
    if (href === "/dashboard") {
        return pathname === "/dashboard";
    }

    return pathname.startsWith(href);
};

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();
    const { language, setLanguage } = useLanguage();
    const router = useRouter();
    const pathname = usePathname();
    const [profileLoading, setProfileLoading] = useState(true);

    const labels = language === "en"
        ? {
            overview: "Overview",
            session: "Session",
            plan: "Plan",
            nutrition: "Nutrition",
            library: "Video Library",
            settings: "Profile",
            signOut: "Sign Out",
            subtitle: "Sports Medicine AI Training",
            language: "Language",
            english: "English",
            spanish: "Spanish",
        }
        : {
            overview: "Resumen",
            session: "Sesion",
            plan: "Plan",
            nutrition: "Nutricion",
            library: "Videos",
            settings: "Perfil",
            signOut: "Cerrar sesion",
            subtitle: "Entrenamiento IA Medicina Deportiva",
            language: "Idioma",
            english: "Ingles",
            spanish: "Espanol",
        };

    useEffect(() => {
        let isMounted = true;

        const checkProfile = async () => {
            if (!user) {
                router.replace("/login");
                if (isMounted) {
                    setProfileLoading(false);
                }
                return;
            }

            try {
                const profile = await getUserProfile(user.uid);

                if (
                    !profile ||
                    !profile.age ||
                    !profile.weight ||
                    !profile.equipment ||
                    !profile.legalTermsAccepted ||
                    !profile.legalPrivacyAccepted ||
                    !profile.legalHealthDisclaimerAccepted
                ) {
                    router.replace("/onboarding");
                    return;
                }

                setLanguage(profile.preferredLanguage === "en" ? "en" : "es");
            } catch (error) {
                console.error("Profile check failed:", error);
                router.replace("/onboarding");
            } finally {
                if (isMounted) {
                    setProfileLoading(false);
                }
            }
        };

        if (!loading) {
            checkProfile();
        }

        return () => {
            isMounted = false;
        };
    }, [user, loading, router, setLanguage]);

    const handleLogout = async () => {
        await logoutUser();
        router.replace("/login");
    };

    const handleLanguageToggle = async () => {
        if (!user) {
            return;
        }

        const nextLanguage = language === "en" ? "es" : "en";
        setLanguage(nextLanguage);

        try {
            await updateUserProfile(user.uid, {
                preferredLanguage: nextLanguage,
            });
        } catch (error) {
            console.error("Failed to persist language preference:", error);
        }
    };

    if (loading || profileLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
                <Loader2 className="animate-spin text-[hsl(var(--primary))]" size={48} />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="min-h-screen app-shell">
            <div className="flex min-h-screen">
                <aside className="hidden md:flex w-72 shrink-0 p-6 flex-col">
                    <div className="mb-8">
                        <h2 className="font-heading text-2xl font-bold tracking-tight">
                            GymBro<span className="title-gradient">Sar</span>
                        </h2>
                        <p className="text-sm text-muted-foreground/90 mt-1">
                            {labels.subtitle}
                        </p>
                    </div>

                    <nav className="space-y-2 glass-panel rounded-2xl p-3">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActiveRoute(pathname, item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`h-11 px-4 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all ${
                                        active
                                            ? "bg-gradient-to-r from-primary/30 via-primary/20 to-cyan-400/15 border border-primary/45 text-primary shadow-[0_8px_26px_-18px_rgba(20,184,166,0.9)]"
                                            : "border border-transparent hover:bg-background/50 hover:border-border/80 text-foreground/90"
                                    }`}
                                >
                                    <Icon size={16} />
                                    {labels[item.labelKey]}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-4 glass-panel rounded-2xl p-3">
                        <button
                            onClick={handleLanguageToggle}
                            className="w-full h-10 rounded-xl border border-border/80 bg-background/45 hover:bg-background/60 transition-colors text-sm font-semibold flex items-center justify-center gap-2"
                        >
                            <Languages size={14} />
                            {labels.language}: {language === "en" ? labels.english : labels.spanish}
                        </button>
                    </div>

                    <div className="mt-auto pt-4">
                        <button
                            onClick={handleLogout}
                            className="w-full h-10 rounded-xl bg-card/70 border border-border/80 hover:bg-destructive/15 hover:text-destructive hover:border-destructive/45 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                        >
                            <LogOut size={16} />
                            {labels.signOut}
                        </button>
                    </div>
                </aside>

                <div className="flex-1 flex flex-col min-w-0">
                    <header className="md:hidden sticky top-0 z-30 bg-background/75 backdrop-blur-xl border-b border-border/70 px-4 py-3">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-heading text-lg font-bold tracking-tight">
                                GymBro<span className="title-gradient">Sar</span>
                            </h2>
                            <button
                                onClick={handleLogout}
                                className="h-9 px-3 rounded-xl bg-card/65 border border-border/80 flex items-center gap-2 text-xs font-semibold"
                            >
                                <LogOut size={14} />
                                {labels.signOut}
                            </button>
                        </div>

                        <nav className="grid grid-cols-2 min-[430px]:grid-cols-3 gap-2 glass-panel rounded-xl p-2">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                const active = isActiveRoute(pathname, item.href);

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`h-12 rounded-lg border flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold leading-tight transition-all ${
                                            active
                                                ? "bg-gradient-to-r from-primary/25 to-cyan-400/15 border-primary/40 text-primary"
                                                : "bg-background/35 border-border/75 text-foreground/80"
                                        }`}
                                    >
                                        <Icon size={14} />
                                        <span className="truncate max-w-[90%]">{labels[item.labelKey]}</span>
                                    </Link>
                                );
                            })}
                        </nav>

                        <button
                            onClick={handleLanguageToggle}
                            className="mt-2 w-full h-9 rounded-xl border border-border/80 bg-card/50 hover:bg-card/70 transition-colors flex items-center justify-center gap-2 text-xs font-semibold"
                        >
                            <Languages size={12} />
                            {labels.language}: {language === "en" ? labels.english : labels.spanish}
                        </button>
                    </header>

                    <main className="flex-1 p-4 md:p-8 overflow-x-hidden">{children}</main>
                </div>
            </div>
        </div>
    );
}
