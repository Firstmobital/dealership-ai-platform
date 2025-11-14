import { OrganizationSwitcher } from './OrganizationSwitcher';
import { useAuthStore } from '../../state/useAuthStore';

export function Topbar() {
  const { user, signOut } = useAuthStore();

  return (
    <header className="flex items-center justify-between border-b border-white/5 bg-slate-900/80 px-6 py-4 backdrop-blur">
      <OrganizationSwitcher />
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-white">{user?.email ?? 'Guest Agent'}</p>
          <p className="text-xs text-slate-400">Dealership AI Admin</p>
        </div>
        <button
          onClick={() => signOut().catch(console.error)}
          className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-300 transition hover:border-accent hover:text-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
