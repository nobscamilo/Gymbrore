"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onIdTokenChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/config";

interface AuthContextType {
    user: User | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // using onIdTokenChanged is more robust for token refreshes than onAuthStateChanged
        const unsubscribe = onIdTokenChanged(auth, (authUser) => {
            setUser(authUser);
            setLoading(false);

            // Optional: Refresh simple client-side cookies here if needed for middleware
        });

        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
