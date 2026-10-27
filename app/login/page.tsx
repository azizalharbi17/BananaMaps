"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeNext as safeNextOn } from "@/lib/safeNext";

interface Banana {
  id: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  rotate: number;
  opacity: number;
}

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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bananas, setBananas] = useState<Banana[]>([]);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const next = useNextParam();

  useEffect(() => {
    setBananas(Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 18 + Math.random() * 32,
      delay: Math.random() * 6,
      duration: 4 + Math.random() * 5,
      rotate: Math.random() * 360,
      opacity: 0.06 + Math.random() * 0.1,
    })));
  }, []);

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
    <button type="button" onClick={() => setShowPass(!showPass)} style={{
      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
      background: "none", border: "none", color: "rgba(234,179,8,0.4)", cursor: "pointer",
      fontSize: 11, padding: 4, lineHeight: 1, fontWeight: 600, letterSpacing: "0.5px",
    }}>{showPass ? "Hide" : "Show"}</button>
  );

  return (
    <>
      <style>{`
        @keyframes bobble {
          0%, 100% { transform: translateY(0px) rotate(var(--rot)) scale(1); }
          50% { transform: translateY(-20px) rotate(calc(var(--rot) + 15deg)) scale(1.15); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-input:focus {
          border-color: rgba(234, 179, 8, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.1);
        }
        .auth-input::placeholder { color: rgba(245, 240, 225, 0.25); }
        .auth-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(234, 179, 8, 0.3);
        }
        .auth-link:hover { text-decoration: underline; }
        .home-logo:hover { opacity: 0.8; }
        .forgot-link:hover { color: #EAB308 !important; }
        .auth-legal { display: flex; justify-content: center; gap: 8px; margin: 18px 0 0; font-size: 0.75rem; color: rgba(255,255,255,0.3); }
        .auth-legal a { color: rgba(255,255,255,0.45); text-decoration: none; }
        .auth-legal a:hover { color: #EAB308; }
      `}</style>

      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0d0d0d", padding: "24px", position: "relative", overflow: "hidden",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <div style={{
          position: "fixed", width: 700, height: 700, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,200,66,0.06) 0%, transparent 70%)",
          top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 0,
        }} />

        {bananas.map((b) => (
          <div key={b.id} style={{
            position: "fixed", left: `${b.left}%`, top: `${b.top}%`, fontSize: `${b.size}px`,
            opacity: b.opacity, animation: `bobble ${b.duration}s ${b.delay}s ease-in-out infinite`,
            pointerEvents: "none", zIndex: 0, ["--rot" as string]: `${b.rotate}deg`,
          }}>🍌</div>
        ))}

        <div style={{ width: "100%", maxWidth: "420px", position: "relative", zIndex: 1 }}>
          <div style={{
            width: "100%", background: "rgba(26, 26, 26, 0.9)",
            border: "1px solid rgba(234, 179, 8, 0.12)", borderRadius: "16px", padding: "40px 32px",
            backdropFilter: "blur(20px)", animation: "fadeInUp 0.5s ease-out",
          }}>
            <Link href="/" className="home-logo" style={{ textDecoration: "none", display: "block", textAlign: "center", marginBottom: "32px", transition: "opacity 0.2s" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🍌</div>
              <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#EAB308", margin: "0 0 6px 0" }}>
                Banana<span style={{ color: "#ffffff" }}>Maps</span>
              </h1>
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                {resetMode ? "Reset your password" : "Welcome back"}
              </p>
            </Link>

            {resetSent ? (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ fontSize: "2rem", marginBottom: "12px" }}>✉️</div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#EAB308", margin: "0 0 8px 0" }}>Check your email</h2>
                <p style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: "0 0 24px 0" }}>
                  We sent a password reset link to <strong style={{ color: "#f5f0e1" }}>{email}</strong>.
                </p>
                <button onClick={() => { setResetMode(false); setResetSent(false); }} style={{
                  background: "rgba(234, 179, 8, 0.12)", border: "1px solid rgba(234, 179, 8, 0.25)",
                  borderRadius: "8px", padding: "10px 28px", color: "#EAB308", fontSize: "0.88rem",
                  fontWeight: 600, cursor: "pointer",
                }}>← Back to Log In</button>
              </div>
            ) : resetMode ? (
              <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                {error && (
                  <div role="alert" style={{
                    padding: "12px 16px", borderRadius: "8px", background: "rgba(220, 38, 38, 0.12)",
                    border: "1px solid rgba(220, 38, 38, 0.25)", color: "#fca5a5", fontSize: "0.83rem",
                  }}>{error}</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="reset-email" style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(234,179,8,0.65)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Email</label>
                  <input id="reset-email" className="auth-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{
                    padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(234,179,8,0.15)", background: "rgba(0,0,0,0.4)", color: "#f5f0e1", fontSize: "0.93rem", outline: "none", transition: "all 0.2s",
                  }} />
                </div>

                <button className="auth-btn" type="submit" disabled={loading} style={{
                  padding: "14px", borderRadius: "8px", border: "none", background: "#EAB308", color: "#0d0d0d", fontSize: "0.95rem", fontWeight: 700, marginTop: "4px",
                  cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "all 0.2s",
                }}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>

                <p style={{ textAlign: "center", fontSize: "0.83rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  <button type="button" onClick={() => { setResetMode(false); setError(""); }} className="forgot-link" style={{
                    background: "none", border: "none", color: "rgba(234,179,8,0.6)", cursor: "pointer", fontSize: "0.83rem", fontWeight: 600,
                  }}>← Back to Log In</button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                {error && (
                  <div role="alert" style={{
                    padding: "12px 16px", borderRadius: "8px", background: "rgba(220, 38, 38, 0.12)",
                    border: "1px solid rgba(220, 38, 38, 0.25)", color: "#fca5a5", fontSize: "0.83rem",
                  }}>{error}</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="login-email" style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(234,179,8,0.65)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Email</label>
                  <input id="login-email" className="auth-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{
                    padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(234,179,8,0.15)", background: "rgba(0,0,0,0.4)", color: "#f5f0e1", fontSize: "0.93rem", outline: "none", transition: "all 0.2s",
                  }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label htmlFor="login-password" style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(234,179,8,0.65)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Password</label>
                    <button type="button" onClick={() => { setResetMode(true); setError(""); }} className="forgot-link" style={{
                      background: "none", border: "none", color: "rgba(234,179,8,0.4)", cursor: "pointer", fontSize: "0.7rem", fontWeight: 500,
                    }}>Forgot password?</button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input id="login-password" className="auth-input" type={showPass ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" style={{
                      width: "100%", padding: "12px 44px 12px 16px", borderRadius: "8px", border: "1px solid rgba(234,179,8,0.15)", background: "rgba(0,0,0,0.4)", color: "#f5f0e1", fontSize: "0.93rem", outline: "none", transition: "all 0.2s", boxSizing: "border-box",
                    }} />
                    {eyeBtn}
                  </div>
                </div>

                <button className="auth-btn" type="submit" disabled={loading} style={{
                  padding: "14px", borderRadius: "8px", border: "none", background: "#EAB308", color: "#0d0d0d", fontSize: "0.95rem", fontWeight: 700, marginTop: "4px",
                  cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "all 0.2s",
                }}>
                  {loading ? "Logging in..." : "Log In"}
                </button>

                <p style={{ textAlign: "center", fontSize: "0.83rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  Don&apos;t have an account?{" "}
                  <Link href={signupHref} className="auth-link" style={{ color: "#EAB308", fontWeight: 600, textDecoration: "none" }}>Sign Up</Link>
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
