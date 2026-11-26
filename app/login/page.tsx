"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import Wordmark from "../components/Wordmark";
import { useRouter } from "next/navigation";
import { safeNext as safeNextOn } from "@/lib/safeNext";

/**
 * Only same-origin relative paths may be used as a post-login destination:
 * must start with "/" and not with "//" (or "/\", which browsers treat alike).
 */
function safeNext(raw: string | null): string | null {
  if (typeof window === "undefined") return null;
  return safeNextOn(raw, window.location.origin);
}

// ?next=<relative path> — where to go after a successful sign-in (default /app).
// Read through useSyncExternalStore so the server render (and hydration) sees
// null and the client value arrives without a setState-in-effect.
const noopSubscribe = () => () => {};
const readNext = () => safeNext(new URLSearchParams(window.location.search).get("next"));
const useNextParam = () => useSyncExternalStore(noopSubscribe, readNext, () => null);

// Theme B "Studio" auth recipe (spec §5): flat --surface card, Inter inherited
// from body, accent only on the primary button and the focus ring.
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text2)" };
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const errorStyle: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 7, background: "rgba(229,72,77,0.1)",
  border: "1px solid rgba(229,72,77,0.35)", color: "#F3A7AA", fontSize: 12.5, lineHeight: 1.5,
};
const footnoteStyle: React.CSSProperties = { textAlign: "center", fontSize: 12.5, color: "var(--text2)", margin: 0 };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const next = useNextParam();

  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (loginError) {
      setError(loginError.message);
    } else {
      router.push(next ?? "/app");
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
    }
  };

  const eyeBtn = (
    <button type="button" className="auth-eye" onClick={() => setShowPass(!showPass)}>
      {showPass ? "Hide" : "Show"}
    </button>
  );

  return (
    <>
      <style>{`
        .auth-input {
          width: 100%; box-sizing: border-box; height: 36px; padding: 0 12px;
          border-radius: 7px; border: 1px solid var(--border); background: var(--bg);
          color: var(--text); font: inherit; font-size: 13px; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .auth-input::placeholder { color: var(--text3); }
        .auth-input:focus { border-color: var(--banana); box-shadow: 0 0 0 3px rgba(245,200,66,0.25); }
        .auth-input-eye { padding-right: 56px; }
        .auth-eye {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; padding: 4px; line-height: 1; font: inherit;
          font-size: 11px; font-weight: 600; color: var(--text2); cursor: pointer; transition: color 0.15s;
        }
        .auth-eye:hover { color: var(--text); }
        .auth-btn {
          height: 36px; padding: 0 14px; border-radius: 7px; border: 1px solid var(--banana);
          background: var(--banana); color: var(--banana-ink); font: inherit; font-size: 13px; font-weight: 700;
          cursor: pointer; transition: background-color 0.15s, border-color 0.15s;
        }
        .auth-btn:hover:not(:disabled) { background: #FFD35A; border-color: #FFD35A; }
        .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-ghost {
          display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 14px;
          border-radius: 7px; border: 1px solid var(--border2); background: transparent; color: var(--text);
          font: inherit; font-size: 12.5px; font-weight: 600; text-decoration: none; cursor: pointer; transition: border-color 0.15s;
        }
        .auth-ghost:hover { border-color: var(--text3); }
        .auth-btn:focus-visible, .auth-ghost:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--banana); }
        .auth-link { color: var(--text); font-weight: 600; text-decoration: none; }
        .auth-link:hover { text-decoration: underline; }
        .auth-text-btn {
          background: none; border: none; padding: 0; font: inherit; font-size: 12px; font-weight: 500;
          color: var(--text2); cursor: pointer; transition: color 0.15s;
        }
        .auth-text-btn:hover { color: var(--text); text-decoration: underline; }
        .home-logo { transition: opacity 0.15s; }
        .home-logo:hover { opacity: 0.85; }
        .auth-legal { display: flex; justify-content: center; gap: 8px; margin: 18px 0 0; font-size: 12px; color: var(--text2); }
        .auth-legal a { color: var(--text2); text-decoration: none; transition: color 0.15s; }
        .auth-legal a:hover { color: var(--text); text-decoration: underline; }
      `}</style>

      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg)", padding: 24,
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{
            width: "100%", boxSizing: "border-box", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: 10, padding: "36px 32px",
          }}>
            <Link href="/" className="home-logo" style={{ textDecoration: "none", color: "inherit", display: "block", textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 10 }}>🍌</div>
              <h1 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.3px", lineHeight: 1.2, margin: 0 }}>
                <Wordmark suffix="Maps" />
              </h1>
              <p style={{ fontSize: 13, color: "var(--text2)", margin: "6px 0 0" }}>
                {resetMode ? "Reset your password" : "Welcome back"}
              </p>
            </Link>

            {resetSent ? (
              <div style={{ textAlign: "center", padding: "4px 0" }}>
                <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 12 }}>✉️</div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 6px 0" }}>Check your email</h2>
                <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6, margin: "0 0 20px 0" }}>
                  We sent a password reset link to <strong style={{ color: "var(--text)", fontWeight: 600 }}>{email}</strong>.
                </p>
                <button type="button" className="auth-ghost" onClick={() => { setResetMode(false); setResetSent(false); }}>
                  ← Back to Log In
                </button>
              </div>
            ) : resetMode ? (
              <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {error && (
                  <div role="alert" style={errorStyle}>{error}</div>
                )}

                <div style={fieldStyle}>
                  <label htmlFor="reset-email" style={labelStyle}>Email</label>
                  <input id="reset-email" className="auth-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>

                <button className="auth-btn" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>

                <p style={footnoteStyle}>
                  <button type="button" className="auth-text-btn" onClick={() => { setResetMode(false); setError(""); }}>
                    ← Back to Log In
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {error && (
                  <div role="alert" style={errorStyle}>{error}</div>
                )}

                <div style={fieldStyle}>
                  <label htmlFor="login-email" style={labelStyle}>Email</label>
                  <input id="login-email" className="auth-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>

                <div style={fieldStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label htmlFor="login-password" style={labelStyle}>Password</label>
                    <button type="button" className="auth-text-btn" onClick={() => { setResetMode(true); setError(""); }}>
                      Forgot password?
                    </button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input id="login-password" className="auth-input auth-input-eye" type={showPass ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
                    {eyeBtn}
                  </div>
                </div>

                <button className="auth-btn" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                  {loading ? "Logging in..." : "Log In"}
                </button>

                <p style={footnoteStyle}>
                  Don&apos;t have an account?{" "}
                  <Link href={signupHref} className="auth-link">Sign Up</Link>
                </p>
              </form>
            )}
          </div>

          <p className="auth-legal">
            <Link href="/terms">Terms</Link>
            <span aria-hidden>·</span>
            <Link href="/privacy">Privacy</Link>
          </p>
        </div>
      </div>
    </>
  );
}
