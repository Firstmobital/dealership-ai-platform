import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";

type AssetType = "image" | "brochure";

type MediaAsset = {
  id: string;
  asset_type: AssetType;
  model: string | null;
  variant: string | null;
  title: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  filename: string | null;
  is_active: boolean;
  created_at: string;
};

function slugifyModel(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitizeFilenamePreserveExt(originalName: string) {
  const parts = originalName.split(".");
  const hasExt = parts.length > 1;
  const ext = hasExt ? parts.pop()!.toLowerCase() : "";
  const base = parts.join(".");

  const safeBase = base
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^-|-$/g, "");

  const fallback = "file";
  const finalBase = safeBase.length ? safeBase : fallback;

  return ext ? `${finalBase}.${ext}` : finalBase;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const rounded = i === 0 ? v.toFixed(0) : v.toFixed(1);
  return `${rounded} ${units[i]}`;
}

export function MediaLibraryModule() {
  const { activeOrganization } = useOrganizationStore();

  const orgId = activeOrganization?.id;

  const [assetType, setAssetType] = useState<AssetType>("image");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<"all" | "image" | "brochure">("all");
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const accept = useMemo(() => {
    return assetType === "image" ? "image/*" : "application/pdf";
  }, [assetType]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();

    return assets.filter((a) => {
      if (activeOnly && !a.is_active) return false;
      if (filterType !== "all" && a.asset_type !== filterType) return false;
      if (!q) return true;

      const hay = `${a.model ?? ""} ${a.variant ?? ""} ${a.title ?? ""} ${a.filename ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [assets, activeOnly, filterType, search]);

  if (!orgId) {
    return (
      <div className="flex h-full min-h-[60vh] w-full items-center justify-center">
        <p className="text-sm text-slate-500">Select an organization to continue.</p>
      </div>
    );
  }

  async function loadAssets() {
    setAssetsLoading(true);
    setAssetsError(null);

    const res = await supabase
      .from("media_assets")
      .select(
        "id, asset_type, model, variant, title, storage_bucket, storage_path, mime_type, filename, is_active, created_at"
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (res.error) {
      setAssetsError(res.error.message);
      setAssets([]);
      setAssetsLoading(false);
      return;
    }

    setAssets((res.data ?? []) as MediaAsset[]);
    setAssetsLoading(false);
  }

  useEffect(() => {
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function doUpload(targetPath: string, uploadFile: File) {
    return await supabase.storage.from("media").upload(targetPath, uploadFile, {
      upsert: false,
      contentType: uploadFile.type,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (uploading) return;

    const trimmedModel = model.trim();
    const trimmedTitle = title.trim();

    if (!trimmedModel) {
      toast.error("Model is required.");
      return;
    }
    if (!trimmedTitle) {
      toast.error("Title is required.");
      return;
    }
    if (!file) {
      toast.error("File is required.");
      return;
    }

    if (assetType === "image") {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file.");
        return;
      }
    } else {
      if (file.type !== "application/pdf") {
        toast.error("Please select a PDF file.");
        return;
      }
    }

    const slugModel = slugifyModel(trimmedModel);
    if (!slugModel) {
      toast.error("Model contains no valid characters.");
      return;
    }

    const folder = assetType === "image" ? `cars/${slugModel}` : `brochures/${slugModel}`;

    const safeOriginal = sanitizeFilenamePreserveExt(file.name);
    const timePrefix = Date.now();

    const attemptPath = (suffix: string) => {
      const dotIdx = safeOriginal.lastIndexOf(".");
      const base = dotIdx >= 0 ? safeOriginal.slice(0, dotIdx) : safeOriginal;
      const ext = dotIdx >= 0 ? safeOriginal.slice(dotIdx) : "";
      const filenameSafe = `${timePrefix}-${base}-${suffix}${ext}`;
      return `${orgId}/${folder}/${filenameSafe}`;
    };

    setUploading(true);
    const toastId = toast.loading("Uploading…");

    try {
      let path = attemptPath(randomSuffix());
      let uploadRes = await doUpload(path, file);

      if (uploadRes.error && (uploadRes.error as any)?.status === 409) {
        path = attemptPath(randomSuffix());
        uploadRes = await doUpload(path, file);
      }

      if (uploadRes.error) {
        throw uploadRes.error;
      }

      const insertRes = await supabase.from("media_assets").insert({
        organization_id: orgId,
        asset_type: assetType,
        model: trimmedModel,
        variant: variant.trim() || null,
        title: trimmedTitle,
        storage_bucket: "media",
        storage_path: path,
        mime_type: file.type,
        filename: file.name,
        is_active: true,
      });

      if (insertRes.error) {
        throw insertRes.error;
      }

      toast.success("Uploaded successfully.", { id: toastId });

      // Reset
      setAssetType("image");
      setModel("");
      setVariant("");
      setTitle("");
      setFile(null);
      setFileInputKey((k) => k + 1);

      await loadAssets();
    } catch (err: any) {
      const message = err?.message || "Upload failed.";
      toast.error(message, { id: toastId });
    } finally {
      setUploading(false);
    }
  }

  async function onCopyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Path copied.");
    } catch {
      toast.error("Failed to copy.");
    }
  }

  async function onDeactivate(asset: MediaAsset) {
    const toastId = toast.loading("Updating…");
    const res = await supabase
      .from("media_assets")
      .update({ is_active: false })
      .eq("id", asset.id)
      .eq("organization_id", orgId);

    if (res.error) {
      toast.error(res.error.message, { id: toastId });
      return;
    }

    toast.success("Deactivated.", { id: toastId });
    await loadAssets();
  }

  async function onDelete(asset: MediaAsset) {
    const ok = window.confirm("Delete this asset? This will remove the database record.");
    if (!ok) return;

    const alsoDelete = window.confirm("Also delete file from storage?");

    const toastId = toast.loading("Deleting…");

    try {
      if (alsoDelete) {
        const del = await supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);
        if (del.error) {
          // Keep DB row intact if storage delete fails
          // (Most common cause is RLS / org membership / wrong path prefix)
          // Log raw error for debugging.
          // eslint-disable-next-line no-console
          console.error("Storage remove failed:", del.error);
          toast.error(
            `Storage delete blocked. Check you are a member of this organization and the file path starts with ${orgId}/ in bucket 'media'.`,
            { id: toastId }
          );
          return;
        }
      }

      const dbDel = await supabase
        .from("media_assets")
        .delete()
        .eq("id", asset.id)
        .eq("organization_id", orgId);

      if (dbDel.error) {
        throw dbDel.error;
      }

      toast.success("Deleted.", { id: toastId });
      await loadAssets();
    } catch (err: any) {
      const message = err?.message || "Delete failed.";
      toast.error(message, { id: toastId });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Media Library</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload car photos & brochures for WhatsApp sending.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Upload</h2>

          <form className="mt-4 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-700">Asset Type</label>
              <div className="mt-2 flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="assetType"
                    value="image"
                    checked={assetType === "image"}
                    onChange={() => setAssetType("image")}
                    disabled={uploading}
                  />
                  <span>Image</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="assetType"
                    value="brochure"
                    checked={assetType === "brochure"}
                    onChange={() => setAssetType("brochure")}
                    disabled={uploading}
                  />
                  <span>Brochure (PDF)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Model *</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={uploading}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300"
                placeholder="e.g. Fortuner"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Variant</label>
              <input
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                disabled={uploading}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300"
                placeholder="e.g. 4x4 AT"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300"
                placeholder="e.g. 2026 Fortuner brochure"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">File *</label>
              <input
                key={fileInputKey}
                type="file"
                accept={accept}
                disabled={uploading}
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setFile(next);
                }}
                className="mt-1 block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              {file ? (
                <p className="mt-2 text-xs text-slate-500">
                  Selected: <span className="font-medium text-slate-700">{file.name}</span> · {formatBytes(file.size)}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-400">
                {assetType === "image" ? "Images only" : "PDF only"}
              </p>
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Assets</h2>
              <p className="mt-1 text-xs text-slate-500">Org-scoped media assets.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadAssets()}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={assetsLoading}
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600">Type:</span>
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  filterType === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterType("image")}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  filterType === "image"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Images
              </button>
              <button
                type="button"
                onClick={() => setFilterType("brochure")}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  filterType === "brochure"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Brochures
              </button>

              <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                />
                Active only
              </label>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300"
              placeholder="Search by model or title…"
            />
          </div>

          <div className="mt-4">
            {assetsLoading ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Loading assets…
              </div>
            ) : assetsError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {assetsError}
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                No assets found.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-slate-600">
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Model / Variant</th>
                        <th className="px-3 py-2 font-semibold">Title</th>
                        <th className="px-3 py-2 font-semibold">Filename</th>
                        <th className="px-3 py-2 font-semibold">Active</th>
                        <th className="px-3 py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredAssets.map((a) => (
                        <tr key={a.id} className="text-slate-700">
                          <td className="px-3 py-2">
                            <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold">
                              {a.asset_type}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-900">{a.model ?? "—"}</div>
                            {a.variant ? (
                              <div className="text-[11px] text-slate-500">{a.variant}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <div className="max-w-[220px] truncate" title={a.title}>
                              {a.title}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="max-w-[220px] truncate" title={a.filename ?? ""}>
                              {a.filename ?? "—"}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {a.is_active ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                                Active
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void onCopyPath(a.storage_path)}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Copy Path
                              </button>
                              <button
                                type="button"
                                onClick={() => void onDeactivate(a)}
                                disabled={!a.is_active}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Deactivate
                              </button>
                              <button
                                type="button"
                                onClick={() => void onDelete(a)}
                                className="rounded-md border border-red-200 bg-white px-2 py-1 font-semibold text-red-700 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}