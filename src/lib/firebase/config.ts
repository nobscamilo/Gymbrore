import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Singleton pattern to avoid re-initialization
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

const useFirebaseEmulator =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "1" &&
  typeof window !== "undefined";

if (useFirebaseEmulator) {
  const globalFlagKey = "__gymbro_emulators_connected__";
  const globalScope = globalThis as typeof globalThis & Record<string, boolean | undefined>;
  const alreadyConnected = globalScope[globalFlagKey] === true;

  if (!alreadyConnected) {
    const authHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1";
    const authPort = Number(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT ?? "9099");
    const firestoreHost = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
    const firestorePort = Number(process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT ?? "8080");

    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    globalScope[globalFlagKey] = true;
  }
}

export default app;
