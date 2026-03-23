"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeGoogleRedirectSignIn, loginWithGoogle, loginWithEmail, registerWithEmail } from '@/lib/firebase/auth';
import { useAuth } from '@/context/AuthContext';
import { Mail, Key, Chrome, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redirectChecked, setRedirectChecked] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [acceptLegal, setAcceptLegal] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const resolveGoogleRedirect = async () => {
            const redirectResult = await completeGoogleRedirectSignIn();
            if (!isMounted) {
                return;
            }

            if (redirectResult?.success && redirectResult.user) {
                router.replace(redirectResult.isNewUser ? '/onboarding' : '/dashboard');
                return;
            }

            if (redirectResult && !redirectResult.success) {
                setError(redirectResult.error || 'Google login failed');
            }

            setRedirectChecked(true);
        };

        void resolveGoogleRedirect();

        return () => {
            isMounted = false;
        };
    }, [router]);

    useEffect(() => {
        if (authLoading || !redirectChecked) {
            return;
        }

        if (user) {
            router.replace('/dashboard');
        }
    }, [authLoading, redirectChecked, router, user]);

    const handleGoogleLogin = async () => {
        if (isRegistering && !acceptLegal) {
            setError('You must accept Terms and Privacy Policy to create an account.');
            return;
        }

        setLoading(true);
        setError(null);
        const forceRedirect = typeof window !== 'undefined'
            && /iphone|ipad|ipod|android|webview|wv|fban|fbav|instagram|line|whatsapp/i.test(window.navigator.userAgent);
        const result = await loginWithGoogle({ forceRedirect });

        if (result.success) {
            if (result.redirected) {
                return;
            }
            router.push(result.isNewUser ? '/onboarding' : '/dashboard');
        } else {
            setError(result.error || 'Login failed');
            setLoading(false);
        }
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Please fill in all fields');
            return;
        }

        if (isRegistering && !acceptLegal) {
            setError('You must accept Terms and Privacy Policy to create an account.');
            return;
        }

        setLoading(true);
        setError(null);

        const action = isRegistering ? registerWithEmail : loginWithEmail;
        const result = await action(email, password);

        if (result.success) {
            router.push('/dashboard');
        } else {
            setError(result.error || 'Authentication failed');
            setLoading(false);
        }
    };

    if (authLoading || !redirectChecked) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="animate-spin text-primary" size={28} />
            </main>
        );
    }

    return (
        <main className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
            {/* Dynamic Background */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-secondary via-background to-background z-0" />

            {/* Glass Card */}
            <div className="z-10 w-full max-w-md bg-card/80 backdrop-blur-xl border border-border rounded-xl p-8 shadow-2xl animate-fade-in-up">

                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold mb-2 tracking-tight">
                        GymBro<span className="text-primary">Sar</span>
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {isRegistering ? 'Create your athlete account' : 'Welcome back, athlete'}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm flex items-center gap-2">
                        <span className="font-bold">!</span> {error}
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        data-testid="login-google"
                        className="w-full h-12 bg-white hover:bg-gray-100 text-black font-semibold rounded-lg flex items-center justify-center gap-3 transition-colors"
                    >
                        {loading ? <Loader2 className="animate-spin text-black" /> : <Chrome size={20} />}
                        Continue with Google
                    </button>

                    <div className="relative my-6 text-center">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border" />
                        </div>
                        <span className="relative bg-card px-2 text-xs uppercase text-muted-foreground">
                            Or continue with email
                        </span>
                    </div>

                    <form onSubmit={handleEmailSubmit} className="space-y-4">
                        <div className="relative group">
                            <Mail className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                            <input
                                type="email"
                                placeholder="Email address"
                                data-testid="login-email"
                                className="w-full h-12 bg-input border border-transparent focus:border-primary rounded-lg pl-10 pr-4 outline-none transition-all text-sm placeholder:text-muted-foreground text-foreground"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="relative group">
                            <Key className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                            <input
                                type="password"
                                placeholder="Password"
                                data-testid="login-password"
                                className="w-full h-12 bg-input border border-transparent focus:border-primary rounded-lg pl-10 pr-4 outline-none transition-all text-sm placeholder:text-muted-foreground text-foreground"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            data-testid="login-submit"
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg flex items-center justify-center gap-2 mt-2 transition-all"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : (
                                <>
                                    {isRegistering ? 'Sign Up' : 'Sign In'}
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>

                        {isRegistering && (
                            <label className="flex items-start gap-2 text-xs text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={acceptLegal}
                                    data-testid="login-accept-legal"
                                    onChange={(e) => setAcceptLegal(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 accent-primary"
                                />
                                <span>
                                    I accept the <Link href="/legal/terms" target="_blank" className="text-primary hover:underline">Terms</Link> and <Link href="/legal/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>.
                                </span>
                            </label>
                        )}
                    </form>

                    <div className="text-center mt-6 text-sm">
                        <span className="text-muted-foreground">
                            {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
                        </span>
                        <button
                            onClick={() => {
                                setIsRegistering(!isRegistering);
                                setAcceptLegal(false);
                            }}
                            data-testid="login-toggle-mode"
                            className="text-primary hover:underline font-medium"
                        >
                            {isRegistering ? 'Sign in' : 'Sign up'}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}
