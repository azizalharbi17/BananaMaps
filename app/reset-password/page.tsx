"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bananas, setBananas] = useState<Banana[]>([]);

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
    <button type="button" onClick={toggle} style={{
      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
      background: "none", border: "none", color: "rgba(234,179,8,0.4)", cursor: "pointer",
      fontSize: 11, padding: 4, lineHeight: 1, fontWeight: 600, letterSpacing: "0.5px",
    }}>{show ? "Hide" : "Show"}</button>
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
        .home-logo:hover { opacity: 0.8; }
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

        <div style={{
          width: "100%", maxWidth: "420px", background: "rgba(26, 26, 26, 0.9)",
          border: "1px solid rgba(234, 179, 8, 0.12)", borderRadius: "16px", padding: "40px 32px",
          backdropFilter: "blur(20px)", position: "relative", zIndex: 1, animation: "fadeInUp 0.5s ease-out",
        }}>
          <Link href="/" className="home-logo" style={{ textDecoration: "none", display: "block", textAlign: "center", marginBottom: "32px", transition: "opacity 0.2s" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🍌</div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#EAB308", margin: "0 0 6px 0" }}>
              Banana<span style={{ color: "#ffffff" }}>Maps</span>
            </h1>
            <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>Set your new password</p>
          </Link>

          {success ? (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px" }}>✅</div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#EAB308", margin: "0 0 8px 0" }}>Password updated!</h2>
              <p style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: 0 }}>
                Redirecting you to the app...
              </p>
            </div>
          ) : (
            <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {error && (
                <div style={{
                  padding: "12px 16px", borderRadius: "8px", background: "rgba(220, 38, 38, 0.12)",
                  border: "1px solid rgba(220, 38, 38, 0.25)", color: "#fca5a5", fontSize: "0.83rem",
                }}>{error}</div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(234,179,8,0.65)", textTransform: "uppercase", letterSpacing: "0.6px" }}>New Password</label>
                <div style={{ position: "relative" }}>
                  <input className="auth-input" type={showPass ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" style={{
                    width: "100%", padding: "12px 44px 12px 16px", borderRadius: "8px", border: "1px solid rgba(234,179,8,0.15)", background: "rgba(0,0,0,0.4)", color: "#f5f0e1", fontSize: "0.93rem", outline: "none", transition: "all 0.2s", boxSizing: "border-box",
                  }} />
                  {eyeBtn(showPass, () => setShowPass(!showPass))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(234,179,8,0.65)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Confirm New Password</label>
                <div style={{ position: "relative" }}>
                  <input className="auth-input" type={showConfirm ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your new password" style={{
                    width: "100%", padding: "12px 44px 12px 16px", borderRadius: "8px", border: "1px solid rgba(234,179,8,0.15)", background: "rgba(0,0,0,0.4)", color: "#f5f0e1", fontSize: "0.93rem", outline: "none", transition: "all 0.2s", boxSizing: "border-box",
                  }} />
                  {eyeBtn(showConfirm, () => setShowConfirm(!showConfirm))}
                </div>
              </div>

              <button className="auth-btn" type="submit" disabled={loading} style={{
                padding: "14px", borderRadius: "8px", border: "none", background: "#EAB308", color: "#0d0d0d", fontSize: "0.95rem", fontWeight: 700, marginTop: "4px",
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "all 0.2s",
              }}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
