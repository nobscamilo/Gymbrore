# GymBroSar

Next.js + Firebase web app for AI-assisted training plans.

## Prerequisites

- Node.js 22 or 24 (recommended: 22)
- Firebase project
- Firestore database created in that project
- Gemini API key (for AI plan generation)

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
# Preferred
GEMINI_API_KEY=...
# Backward compatible alias
GOOGLE_GENAI_API_KEY=...
# Optional (defaults to gemini-2.0-flash)
GOOGLE_GENAI_MODEL=gemini-2.0-flash
```

3. Start development server:

```bash
npm run dev
```

## Critical Firebase requirement

The app will not work correctly until Firestore exists for the selected project.

- In Firebase Console, create a Firestore database `(default)` in Native mode.
- Deploy rules:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Current rules limit user documents to their own UID under `users/{uid}`.

## Production hardening for AI key

Do not rely on local `.env.local` for production deployments.

Use Firebase Secret Manager:

```bash
firebase functions:secrets:set GOOGLE_GENAI_API_KEY --project gymbrosar
```

If you also want explicit `GEMINI_API_KEY` support in other runtimes, set it too:

```bash
firebase functions:secrets:set GEMINI_API_KEY --project gymbrosar
```

Optional model override:

```bash
firebase functions:secrets:set GOOGLE_GENAI_MODEL --project gymbrosar
```

Then redeploy hosting/functions.

## Lint and build

```bash
npm run lint
npm run build
```

## E2E tests (Playwright + Firebase emulators)

This project includes end-to-end tests that run against local Firebase Auth + Firestore emulators.

1. Install Playwright browser:

```bash
npm run test:e2e:install
```

2. Ensure Java is available for Firestore emulator.
If your machine has no Java runtime, install a local one automatically (macOS arm64 helper):

```bash
npm run test:e2e:java
```

3. Run E2E suite:

```bash
npm run test:e2e
```

Useful variants:

```bash
npm run test:e2e:headed
```

E2E notes:

- The suite includes:
  - email/password auth + onboarding + plan/session flow
  - mobile (iPhone viewport) auth flow using Google button
- For emulator stability, Google auth is mocked only in E2E mode via:
  - `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1`
  - `NEXT_PUBLIC_E2E_MOCK_GOOGLE_LOGIN=1`

## Notes

- If Gemini fails or API key is missing, the app now falls back to a template training plan instead of crashing.
- Onboarding and plan flows now fail fast with visible UI errors instead of silent redirects.
- The dashboard includes a daily pain check-in that can adapt the selected session and explain clinical reasoning.
- Users can switch app language between Spanish and English.
- Users can add exercises from a searchable exercise database.
- Session duration is estimated per training day.
- Daily sessions can be adapted to available time (for example, 60 minutes) with explicit viability warnings if below ideal.

## Local video library setup

Videos are served from `public/exercise-videos` and indexed with:

```bash
npm run videos:index
```

Default source used by the indexer:

`/Users/juansarmiento/Desktop/CompleteAnatomyVideos/videos/exercises`

Optional custom source:

```bash
EXERCISE_VIDEO_SOURCE_DIR=/absolute/path/to/videos npm run videos:index
```

Then open `/dashboard/library`.

## Weekly auto refresh (Cloud Scheduler + dedicated function)

A dedicated scheduled function `weeklyAutoRefreshPlans` checks user profiles and refreshes stale plans (`>= 7 days`) when `autoWeeklyRefresh=true`.

Deploy:

```bash
firebase deploy --only hosting,functions:scheduler --project gymbrosar
```
