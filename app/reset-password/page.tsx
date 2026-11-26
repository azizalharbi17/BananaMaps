"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import Wordmark from "../components/Wordmark";
import { useRouter } from "next/navigation";

// Theme B "Studio" auth recipe (spec §5): flat --surface card, Inter inherited
// from body, accent only on the primary button and the focus ring.
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text2)" };
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const errorStyle: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 7, background: "rgba(229,72,77,0.1)",
  border: "1px solid rgba(229,72,77,0.35)", color: "#F3A7AA", fontSize: 12.5, lineHeight: 1.5,
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
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

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/app"), 2000);
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
        .auth-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--banana); }
        .home-logo { transition: opacity 0.15s; }
        .home-logo:hover { opacity: 0.85; }
      `}</style>

      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg)", padding: 24,
      }}>
        <div style={{
          width: "100%", maxWidth: 420, boxSizing: "border-box", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: 10, padding: "36px 32px",
        }}>
          <Link href="/" className="home-logo" style={{ textDecoration: "none", color: "inherit", display: "block", textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 10 }}>🍌</div>
            <h1 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.3px", lineHeight: 1.2, margin: 0 }}>
              <Wordmark suffix="Maps" />
            </h1>
            <p style={{ fontSize: 13, color: "var(--text2)", margin: "6px 0 0" }}>Set your new password</p>
          </Link>

          {success ? (
            <div style={{ textAlign: "center", padding: "4px 0" }}>
              <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 6px 0" }}>Password updated!</h2>
              <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6, margin: 0 }}>
                Redirecting you to the app...
              </p>
            </div>
          ) : (
            <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div role="alert" style={errorStyle}>{error}</div>
              )}

              <div style={fieldStyle}>
                <label htmlFor="reset-new-password" style={labelStyle}>New password</label>
                <div style={{ position: "relative" }}>
                  <input id="reset-new-password" className="auth-input auth-input-eye" type={showPass ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
                  {eyeBtn(showPass, () => setShowPass(!showPass))}
                </div>
              </div>

              <div style={fieldStyle}>
                <label htmlFor="reset-confirm-password" style={labelStyle}>Confirm new password</label>
                <div style={{ position: "relative" }}>
                  <input id="reset-confirm-password" className="auth-input auth-input-eye" type={showConfirm ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your new password" />
                  {eyeBtn(showConfirm, () => setShowConfirm(!showConfirm))}
                </div>
              </div>

              <button className="auth-btn" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
