import React from "react";

/**
 * Role gate for organization-level pages.
 * Allowed roles for wallet visibility: admin, owner, manager.
 *
 * IMPORTANT:
 * - You must pass the user's org role from your store (string | null).
 * - If role is missing, we treat it as NOT allowed (secure default).
 */

type Props = {
  role: string | null | undefined;
  allowed: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function RequireOrgRole({
  role,
  allowed,
  children,
  fallback,
}: Props) {
  const normalized = (role ?? "").toLowerCase().trim();
  const ok = allowed.map((r) => r.toLowerCase()).includes(normalized);

  if (!ok) {
    return (
      fallback ?? (
        <div className="rounded-xl border bg-white p-5 text-sm text-gray-600">
          You don’t have permission to view Wallet.
        </div>
      )
    );
  }

  return <>{children}</>;
}
