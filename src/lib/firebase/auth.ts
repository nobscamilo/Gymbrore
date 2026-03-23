import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    getAdditionalUserInfo,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    AuthError,
    User,
} from "firebase/auth";
import { auth } from "./config";

const googleProvider = new GoogleAuthProvider();
const MOCK_GOOGLE_EMAIL_KEY = "__gymbro_mock_google_email__";
const MOCK_GOOGLE_PASSWORD = "MockGoogle!2026";

export type AuthResponse = {
    success: boolean;
    user?: User;
    redirected?: boolean;
    isNewUser?: boolean;
    error?: string;
};

// Map Firebase errors to user-friendly messages
const mapAuthError = (error: AuthError): string => {
    switch (error.code) {
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/user-disabled':
            return 'This account has been disabled.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Invalid email or password.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists.';
        case 'auth/weak-password':
            return 'Password should be at least 6 characters.';
        case 'auth/popup-closed-by-user':
            return 'Sign in was cancelled.';
        case 'auth/popup-blocked':
            return 'Popup was blocked by your browser. Retrying with redirect.';
        case 'auth/operation-not-supported-in-this-environment':
            return 'Google popup is not supported in this browser. Retrying with redirect.';
        case 'auth/unauthorized-domain':
            return 'This domain is not authorized in Firebase Authentication settings.';
        default:
            console.error("Auth Error:", error.code, error.message);
            return 'An unexpected error occurred. Please try again.';
    }
};

const shouldFallbackToRedirect = (error: AuthError): boolean => {
    return error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment";
};

type GoogleLoginOptions = {
    forceRedirect?: boolean;
};

const shouldUseMockGoogleLogin = (): boolean => {
    return (
        process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "1" &&
        process.env.NEXT_PUBLIC_E2E_MOCK_GOOGLE_LOGIN === "1"
    );
};

const getMockGoogleEmail = (): string => {
    const fallbackEmail = `google.mock.${Date.now()}@gymbro.test`;
    if (typeof window === "undefined") {
        return fallbackEmail;
    }

    try {
        const existing = window.sessionStorage.getItem(MOCK_GOOGLE_EMAIL_KEY);
        if (existing) {
            return existing;
        }

        const generated = `google.mock.${Date.now()}${Math.floor(Math.random() * 1000)}@gymbro.test`;
        window.sessionStorage.setItem(MOCK_GOOGLE_EMAIL_KEY, generated);
        return generated;
    } catch {
        return fallbackEmail;
    }
};

const loginWithMockGoogle = async (): Promise<AuthResponse> => {
    const email = getMockGoogleEmail();

    try {
        const signedIn = await signInWithEmailAndPassword(auth, email, MOCK_GOOGLE_PASSWORD);
        return { success: true, user: signedIn.user, isNewUser: false };
    } catch (error) {
        const authError = error as AuthError;
        const shouldCreate =
            authError.code === "auth/user-not-found" || authError.code === "auth/invalid-credential";

        if (!shouldCreate) {
            return { success: false, error: mapAuthError(authError) };
        }
    }

    try {
        const created = await createUserWithEmailAndPassword(auth, email, MOCK_GOOGLE_PASSWORD);
        return { success: true, user: created.user, isNewUser: true };
    } catch (createError) {
        return { success: false, error: mapAuthError(createError as AuthError) };
    }
};

export const loginWithGoogle = async (options?: GoogleLoginOptions): Promise<AuthResponse> => {
    const forceRedirect = options?.forceRedirect ?? false;

    if (shouldUseMockGoogleLogin()) {
        return loginWithMockGoogle();
    }

    try {
        if (forceRedirect) {
            await signInWithRedirect(auth, googleProvider);
            return { success: true, redirected: true };
        }

        const result = await signInWithPopup(auth, googleProvider);
        const info = getAdditionalUserInfo(result);
        return { success: true, user: result.user, isNewUser: Boolean(info?.isNewUser) };
    } catch (error) {
        const authError = error as AuthError;
        if (shouldFallbackToRedirect(authError)) {
            try {
                await signInWithRedirect(auth, googleProvider);
                return { success: true, redirected: true };
            } catch (redirectError) {
                return { success: false, error: mapAuthError(redirectError as AuthError) };
            }
        }

        return { success: false, error: mapAuthError(authError) };
    }
};

export const completeGoogleRedirectSignIn = async (): Promise<AuthResponse | null> => {
    try {
        const result = await getRedirectResult(auth);
        if (!result) {
            return null;
        }

        const info = getAdditionalUserInfo(result);
        return { success: true, user: result.user, isNewUser: Boolean(info?.isNewUser) };
    } catch (error) {
        return { success: false, error: mapAuthError(error as AuthError) };
    }
};

export const loginWithEmail = async (email: string, password: string): Promise<AuthResponse> => {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: result.user };
    } catch (error) {
        return { success: false, error: mapAuthError(error as AuthError) };
    }
};

export const registerWithEmail = async (email: string, password: string): Promise<AuthResponse> => {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        return { success: true, user: result.user };
    } catch (error) {
        return { success: false, error: mapAuthError(error as AuthError) };
    }
};

export const logoutUser = async (): Promise<AuthResponse> => {
    try {
        await firebaseSignOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
};
