import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "firebase/firestore";
import { db } from "./config";
import { UserProfile } from "@/lib/types";

const stripUndefinedFields = <T extends Record<string, unknown>>(data: T): Partial<T> => {
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
    ) as Partial<T>;
};

const dedupeClinicalConditions = (value: UserProfile["clinicalConditions"]): UserProfile["clinicalConditions"] => {
    if (!Array.isArray(value)) {
        return value;
    }

    return Array.from(new Set(value));
};

const normalizeProfilePatch = (data: Partial<UserProfile>): Partial<UserProfile> => {
    const normalized = { ...data };

    if ("clinicalConditions" in normalized) {
        normalized.clinicalConditions = dedupeClinicalConditions(normalized.clinicalConditions);
    }

    if (typeof normalized.nutritionAllergies === "string") {
        normalized.nutritionAllergies = normalized.nutritionAllergies.trim();
    }

    return normalized;
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return null;
        }

        return docSnap.data() as UserProfile;
    } catch (error) {
        console.error("Error fetching profile:", error);
        throw error;
    }
};

export const createOrUpdateProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
    try {
        const docRef = doc(db, "users", uid);
        const safeData = stripUndefinedFields(normalizeProfilePatch(data) as Record<string, unknown>);

        await setDoc(
            docRef,
            {
                ...safeData,
                uid,
                updatedAt: serverTimestamp(),
                ...(safeData.createdAt ? {} : { createdAt: serverTimestamp() }),
            },
            { merge: true }
        );
    } catch (error) {
        console.error("Error creating/updating profile:", error);
        throw new Error("Unable to save profile. Please try again.");
    }
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
    try {
        const docRef = doc(db, "users", uid);
        const safeData = stripUndefinedFields(normalizeProfilePatch(data) as Record<string, unknown>);
        await setDoc(
            docRef,
            {
                ...safeData,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
    } catch (error) {
        console.error("Error updating profile:", error);
        throw new Error("Unable to update profile. Please try again.");
    }
};
