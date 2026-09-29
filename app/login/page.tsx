"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!configured) {
      setError("Supabase is not configured yet. Add the environment variables before signing in.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    router.push("/");
  }

  return <main className="login-shell"><div className="login-art"><div className="login-brand"><div className="brand-mark"><span>Q</span></div><span>Queuewise</span></div><div className="login-art-copy"><span className="eyebrow">AXIS DRIVING SCHOOL</span><h1>Keep every visit moving.</h1><p>One calm, connected workspace for your kiosk, counters, and waiting room display.</p></div><div className="login-art-footer"><span><ShieldCheck size={15} /> Secure staff workspace</span><span>Built for the floor</span></div></div><section className="login-panel"><div className="login-panel-inner"><div className="login-icon"><LockKeyhole size={19} /></div><p className="eyebrow">STAFF ACCESS</p><h2>Welcome back.</h2><p className="login-description">Sign in to manage today&apos;s queue.</p><form onSubmit={signIn}><label className="login-field"><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@school.com" /></label><label className="login-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="Enter your password" /></label>{error && <p className="login-error">{error}</p>}<button className="primary-button login-button" disabled={loading}>{loading ? "Signing in..." : "Sign in"}<ArrowRight size={16} /></button></form><a className="forgot-link" href="mailto:support@example.com">Need help signing in?</a></div></section></main>;
}
