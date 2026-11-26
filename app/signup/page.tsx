"use client";

import { useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import Wordmark from "../components/Wordmark";
import { safeNext as safeNextOn } from "@/lib/safeNext";

/**
 * Only same-origin relative paths may be used as a post-auth destination:
 * must start with "/" and not with "//" (or "/\", which browsers treat alike).
 */
function safeNext(raw: string | null): string | null {
  if (typeof window === "undefined") return null;
  return safeNextOn(raw, window.location.origin);
}

// ?next=<relative path> — where to land after the email confirmation link.
// Read through useSyncExternalStore so the server render (and hydration) sees
// null and the client value arrives without a setState-in-effect.
const noopSubscribe = () => () => {};
const readNext = () => safeNext(new URLSearchParams(window.location.search).get("next"));
const useNextParam = () => useSyncExternalStore(noopSubscribe, readNext, () => null);

// Theme B "Studio" auth recipe (spec §5): flat --surface card, Inter inherited
// from body, accent only on the primary button, the checked box and the focus ring.
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text2)" };
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const errorStyle: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 7, background: "rgba(229,72,77,0.1)",
  border: "1px solid rgba(229,72,77,0.35)", color: "#F3A7AA", fontSize: 12.5, lineHeight: 1.5,
};
const footnoteStyle: React.CSSProperties = { textAlign: "center", fontSize: 12.5, color: "var(--text2)", margin: 0 };

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const next = useNextParam();

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callback.toString(),
        // Recorded on the auth user so the developer portal can show when the
        // legal agreement was accepted (read back as user_metadata.accepted_terms_at).
        data: { accepted_terms_at: new Date().toISOString() },
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
    } else {
      setSuccess(true);
    }
  };

  const eyeBtn = (show: boolean, toggle: () => void) => (
    <button type="button" className="auth-eye" onClick={toggle}>
      {show ? "Hide" : "Show"}
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
        .home-logo { transition: opacity 0.15s; }
        .home-logo:hover { opacity: 0.85; }
        .auth-agree { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 12.5px; line-height: 1.5; color: var(--text2); }
        .auth-agree input { appearance: auto; width: 15px; height: 15px; margin: 2px 0 0; flex-shrink: 0; accent-color: var(--banana); cursor: pointer; }
        .auth-agree a { color: var(--text); font-weight: 600; text-decoration: none; }
        .auth-agree a:hover { text-decoration: underline; }
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
              <p style={{ fontSize: 13, color: "var(--text2)", margin: "6px 0 0" }}>Create your account</p>
            </Link>

            {success ? (
              <div style={{ textAlign: "center", padding: "4px 0" }}>
                <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 12 }}>✉️</div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 6px 0" }}>Check your email</h2>
                <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6, margin: "0 0 20px 0" }}>
                  We sent a confirmation link to <strong style={{ color: "var(--text)", fontWeight: 600 }}>{email}</strong>. Click it to activate your account.
                </p>
                <Link href={loginHref} className="auth-ghost">Go to Log In →</Link>
              </div>
            ) : (
              <form onSubmit={handleSignUp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {error && (
                  <div role="alert" style={errorStyle}>{error}</div>
                )}

                <div style={fieldStyle}>
                  <label htmlFor="signup-email" style={labelStyle}>Email</label>
                  <input id="signup-email" className="auth-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>

                <div style={fieldStyle}>
                  <label htmlFor="signup-password" style={labelStyle}>Password</label>
                  <div style={{ position: "relative" }}>
                    <input id="signup-password" className="auth-input auth-input-eye" type={showPass ? "text" : "password"} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
                    {eyeBtn(showPass, () => setShowPass(!showPass))}
                  </div>
                </div>

                <div style={fieldStyle}>
                  <label htmlFor="signup-confirm" style={labelStyle}>Confirm password</label>
                  <div style={{ position: "relative" }}>
                    <input id="signup-confirm" className="auth-input auth-input-eye" type={showConfirm ? "text" : "password"} required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" />
                    {eyeBtn(showConfirm, () => setShowConfirm(!showConfirm))}
                  </div>
                </div>

                <label className="auth-agree">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    aria-required="true"
                  />
                  <span>
                    I agree to the{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                    {" "}and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                  </span>
                </label>

                <button className="auth-btn" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                  {loading ? "Creating account..." : "Sign Up"}
                </button>

                <p style={footnoteStyle}>
                  Already have an account?{" "}
                  <Link href={loginHref} className="auth-link">Log In</Link>
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
