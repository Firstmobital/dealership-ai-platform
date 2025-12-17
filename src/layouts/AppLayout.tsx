import { Outlet } from "react-router-dom";
import { Sidebar } from "./components/sidebar/Sidebar";
import { Topbar } from "./components/common/Topbar";

export function AppLayout() {
  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />

        {/* Modules handle their own scroll */}
        <main className="flex-1 overflow-auto px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
