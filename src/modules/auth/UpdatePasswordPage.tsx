import { FormEvent, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuthStore } from "../../state/useAuthStore";

export function UpdatePasswordPage() {
  const { updatePassword, initialize, loading, error } = useAuthStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Ensure we have the recovered session
    initialize().catch(console.error);
  }, [initialize]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      alert("Passwords do not match.");
      return;
    }

    try {
      await updatePassword(password);
      navigate("/auth/login", { replace: true });
    } catch {
      // error already stored
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/80 p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 text-accent">
            <Lock size={20} />
          </div>
          <h1 className="text-xl font-semibold text-white">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Enter a strong password you have not used before.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              New password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
              placeholder="At least 6 characters"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Confirm password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
              placeholder="Repeat password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-slate-400">
          <Link to="/auth/login" className="text-accent hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
