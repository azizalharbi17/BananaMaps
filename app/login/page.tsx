"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Banana {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bananas, setBananas] = useState<Banana[]>([]);

  useEffect(() => {
    setBananas(Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 20 + Math.random() * 30,
      delay: Math.random() * 12,
      duration: 10 + Math.random() * 14,
      opacity: 0.08 + Math.random() * 0.12,
    })));
  }, []);

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
      router.push("/app");
    }
  };

  return (
    <>
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          10% { opacity: var(--banana-opacity); }
          90% { opacity: var(--banana-opacity); }
          100% { transform: translateY(-120px) rotate(360deg); opacity: 0; }
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
      `}</style>

      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d0d0d",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        {bananas.map((b) => (
          <div key={b.id} style={{
            position: "fixed",
            left: `${b.left}%`,
            fontSize: `${b.size}px`,
            animation: `floatUp ${b.duration}s ${b.delay}s linear infinite`,
            pointerEvents: "none",
            zIndex: 0,
            ["--banana-opacity" as string]: b.opacity,
            opacity: 0,
          }}>🍌</div>
        ))}

        <div style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(26, 26, 26, 0.9)",
          border: "1px solid rgba(234, 179, 8, 0.12)",
          borderRadius: "16px",
          padding: "40px 32px",
          backdropFilter: "blur(20px)",
          position: "relative",
          zIndex: 1,
          animation: "fadeInUp 0.5s ease-out",
        }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🍌</div>
            <h1 style={{
              fontSize: "1.6rem",
              fontWeight: 700,
              color: "#EAB308",
              margin: "0 0 6px 0",
            }}>
              Banana<span style={{ color: "#ffffff" }}>Maps</span>
            </h1>
            <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
              Welcome back
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {error && (
              <div style={{
                padding: "12px 16px",
                borderRadius: "8px",
                background: "rgba(220, 38, 38, 0.12)",
                border: "1px solid rgba(220, 38, 38, 0.25)",
                color: "#fca5a5",
                fontSize: "0.83rem",
              }}>{error}</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(234,179,8,0.65)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Email</label>
              <input className="auth-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{
                padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(234,179,8,0.15)", background: "rgba(0,0,0,0.4)", color: "#f5f0e1", fontSize: "0.93rem", outline: "none", transition: "all 0.2s",
              }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(234,179,8,0.65)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Password</label>
              <input className="auth-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" style={{
                padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(234,179,8,0.15)", background: "rgba(0,0,0,0.4)", color: "#f5f0e1", fontSize: "0.93rem", outline: "none", transition: "all 0.2s",
              }} />
            </div>

            <button className="auth-btn" type="submit" disabled={loading} style={{
              padding: "14px", borderRadius: "8px", border: "none", background: "#EAB308", color: "#0d0d0d", fontSize: "0.95rem", fontWeight: 700, marginTop: "4px",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "all 0.2s",
            }}>
              {loading ? "Logging in..." : "Log In"}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.83rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="auth-link" style={{ color: "#EAB308", fontWeight: 600, textDecoration: "none" }}>Sign Up</Link>
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
