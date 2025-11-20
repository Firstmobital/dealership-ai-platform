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
      // error already in store
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/80 p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 text-accent">
            <Mail size={20} />
          </div>
          <h1 className="text-xl font-semibold text-white">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            We will send you a link to create a new password.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}
          {sent && !error && (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              If the email exists, a reset link has been sent.
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
              placeholder="you@dealership.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <div className="mt-4 text-xs text-slate-400">
          <Link to="/auth/login" className="inline-flex items-center gap-1 text-accent hover:underline">
            <ArrowLeft size={14} />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
