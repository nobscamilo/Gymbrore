import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto lite-panel rounded-2xl p-6 md:p-8 space-y-5">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Terms and Conditions</h1>
          <p className="text-sm text-muted-foreground">Version 2026-03-06</p>
        </header>

        <section className="space-y-2 text-sm">
          <p>
            GymBroSar provides AI-assisted training and nutrition guidance for educational and adherence support.
          </p>
          <p>
            This service does not provide medical diagnosis, emergency triage, or medication prescription.
          </p>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-base">Clinical Disclaimer</h2>
          <p>
            By using this service, you acknowledge that recommendations are generated algorithmically and must be
            reviewed by a licensed clinician when there is chronic disease, acute symptoms, or hard-stop safety flags.
          </p>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-base">User Responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide truthful health and profile information.</li>
            <li>Do not use this app as a substitute for emergency medical care.</li>
            <li>Stop following any plan flagged as high-risk until professional review.</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-base">European Launch Baseline</h2>
          <p>
            This product uses explicit opt-in consent for Terms, Privacy, and health disclaimer acceptance and stores a
            consent timestamp and policy version in the user profile.
          </p>
          <p>
            For production launch in the EU, legal counsel should validate country-specific requirements before go-live.
          </p>
        </section>

        <p className="text-sm">
          Read the <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
