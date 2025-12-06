// src/modules/auth/ResetPasswordPage.tsx
import { FormEvent, useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../state/useAuthStore";

export function ResetPasswordPage() {
  const { sendResetPassword, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await sendResetPassword(email);
      setSent(true);
    } catch {
      // handled in store
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 p-8 shadow-xl shadow-black/40">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 text-accent">
            <Mail size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">
              Reset your password
            </h1>
            <p className="text-xs text-slate-400">
              We&apos;ll send a secure link to your email.
            </p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-3 text-sm text-slate-300">
            <p>
              If an account exists for <span className="font-mono">{email}</span>, a reset
              link has been sent.
            </p>
            <p className="text-xs text-slate-400">
              Check your inbox and follow the instructions to set a new password.
            </p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div className="mt-4 text-xs text-slate-400">
          <Link
            to="/auth/login"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            <ArrowLeft size={14} />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
