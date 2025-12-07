// src/modules/auth/UpdatePasswordPage.tsx
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
    // Ensure recovered session from reset link
    initialize().catch(console.error);
  }, [initialize]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return;
    try {
      await updatePassword(password);
      navigate("/auth/login", { replace: true });
    } catch {
      // handled in store
    }
  };

  const passwordMismatch = !!(password && confirm && password !== confirm);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/80 p-8 shadow-xl shadow-black/40">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 text-accent">
            <Lock size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">
              Set a new password
            </h1>
            <p className="text-xs text-slate-400">
              This will update your Techwheels login.
            </p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              New password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Confirm password
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
          </div>

          {passwordMismatch && (
            <p className="text-xs text-red-400">
              Passwords do not match.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || passwordMismatch}
            className="mt-2 flex w-full items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {loading ? "Updating…" : "Update password"}
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

