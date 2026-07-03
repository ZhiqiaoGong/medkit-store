"use client";

import { type FormEvent, useEffect, useState } from "react";
import { saveSession } from "@/lib/session";

interface AuthDialogProps {
  apiBaseUrl: string;
  open: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, email: string) => void;
}

type AuthMode = "login" | "register";

export function AuthDialog({
  apiBaseUrl,
  open,
  onClose,
  onAuthenticated,
}: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !result.token) {
        throw new Error(result.error ?? "Unable to sign in");
      }

      saveSession(result.token, email);
      onAuthenticated(result.token, email);
      setPassword("");
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to sign in",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
  }

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="auth-title"
        aria-modal="true"
        className="auth-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          aria-label="Close sign in dialog"
          className="auth-close"
          type="button"
          onClick={onClose}
        >
          ×
        </button>
        <span className="eyebrow">Your MedKit account</span>
        <h2 id="auth-title">
          {mode === "login" ? "Welcome back." : "Create your account."}
        </h2>
        <p>
          {mode === "login"
            ? "Sign in to reserve inventory and continue to secure checkout."
            : "Create an account to save this order and check out securely."}
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              autoFocus
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : 1}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          className="auth-switch"
          type="button"
          onClick={() => switchMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </section>
    </div>
  );
}
