export default function PrivacyPage() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto lite-panel rounded-2xl p-6 md:p-8 space-y-5">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy (GDPR Baseline)</h1>
          <p className="text-sm text-muted-foreground">Version 2026-03-06</p>
        </header>

        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-base">Data We Process</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account identifiers (email, uid, display name).</li>
            <li>Health and performance profile data entered by the user.</li>
            <li>Generated training/nutrition plans and safety telemetry.</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-base">Purpose of Processing</h2>
          <p>
            We process data to provide personalized training and nutrition guidance, enforce clinical hard-stop safety
            rules, and monitor technical performance.
          </p>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-base">Legal Basis (GDPR)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Explicit user consent captured during onboarding.</li>
            <li>Service delivery requested by the user.</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-base">Data Subject Rights</h2>
          <p>
            Users can request access, correction, portability, and deletion of their data, and can withdraw consent for
            future processing.
          </p>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-semibold text-base">Retention and Security</h2>
          <p>
            Data is stored in Firebase infrastructure with authenticated access controls. Retention periods and DPA/SCC
            documentation should be finalized before EU production launch.
          </p>
        </section>
      </div>
    </main>
  );
}
