"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type AppLanguage = "es" | "en";

type LanguageContextValue = {
    language: AppLanguage;
    setLanguage: (language: AppLanguage) => void;
};

const STORAGE_KEY = "gymbrosar_language";

const LanguageContext = createContext<LanguageContextValue>({
    language: "es",
    setLanguage: () => {},
});

export const useLanguage = () => useContext(LanguageContext);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<AppLanguage>(() => {
        if (typeof window === "undefined") {
            return "es";
        }

        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            return saved === "en" || saved === "es" ? saved : "es";
        } catch (storageError) {
            console.warn("Language storage unavailable, using fallback language.", storageError);
            return "es";
        }
    });

    const setLanguage = (nextLanguage: AppLanguage) => {
        setLanguageState(nextLanguage);
        if (typeof window !== "undefined") {
            try {
                window.localStorage.setItem(STORAGE_KEY, nextLanguage);
            } catch (storageError) {
                console.warn("Could not persist language preference.", storageError);
            }
        }
    };

    const value = useMemo(() => ({ language, setLanguage }), [language]);

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
