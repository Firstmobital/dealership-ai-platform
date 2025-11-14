import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/sidebar/Sidebar';
import { Topbar } from '../components/common/Topbar';

export function AppLayout() {
  return (
    <div className="flex h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-slate-900/40 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
