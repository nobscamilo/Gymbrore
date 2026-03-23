import Link from 'next/link';
import { ArrowRight, Info } from 'lucide-react';

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background text-foreground">
      {/* Background Glow Effect */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary rounded-full opacity-10 blur-[100px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="z-10 text-center max-w-2xl space-y-8 animate-fade-in-up">
        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter">
          GymBro<span className="text-primary">Sar</span>
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground font-light">
          Advanced AI Training based on <span className="text-foreground font-medium">Sports Medicine</span>.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Link
            href="/login"
            className="h-12 px-8 rounded-lg bg-primary text-primary-foreground font-bold text-lg flex items-center gap-2 hover:scale-105 transition-transform shadow-[0_0_20px_rgba(157,255,0,0.3)]"
          >
            Get Started <ArrowRight size={20} />
          </Link>
          <button className="h-12 px-8 rounded-lg border border-border bg-card/50 backdrop-blur-sm text-foreground hover:bg-card transition-colors flex items-center gap-2">
            <Info size={20} /> Learn More
          </button>
        </div>
      </div>

      <footer className="absolute bottom-8 text-sm text-muted-foreground">
        © 2026 GymBroSar. All rights reserved.
      </footer>
    </main>
  );
}
