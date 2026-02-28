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

  // Signed URL cache (RLS-safe previews)
  const [signedUrlByAssetId, setSignedUrlByAssetId] = useState<Record<string, string>>({});
  const [loadingSignedUrlById, setLoadingSignedUrlById] = useState<Record<string, boolean>>({});

  // Pagination
  const pageSize = 25;
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filterType, setFilterType] = useState<"all" | "image" | "brochure">("all");
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  // Debounced search (server-side)
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const accept = useMemo(() => {
    return assetType === "image" ? "image/*" : "application/pdf";
  }, [assetType]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  const canGoPrev = page > 0;
  const canGoNext = (page + 1) * pageSize < totalCount;

  if (!orgId) {
    return (
      <div className="flex h-full min-h-[60vh] w-full items-center justify-center">
        <p className="text-sm text-slate-500">Select an organization to continue.</p>
      </div>
    );
  }

  async function getSignedUrl(asset: MediaAsset): Promise<string | null> {
    const cached = signedUrlByAssetId[asset.id];
    if (cached) return cached;

    if (loadingSignedUrlById[asset.id]) return null;

    setLoadingSignedUrlById((prev) => ({ ...prev, [asset.id]: true }));
    try {
      const res = await supabase.storage
        .from(asset.storage_bucket)
        .createSignedUrl(asset.storage_path, 60 * 10);

      if (res.error) {
        toast.error(res.error.message);
        return null;
      }

      const url = res.data?.signedUrl ?? null;
      if (!url) return null;

      setSignedUrlByAssetId((prev) => ({ ...prev, [asset.id]: url }));
      return url;
    } catch (err: any) {
      toast.error(err?.message || "Failed to create signed URL.");
      return null;
    } finally {
      setLoadingSignedUrlById((prev) => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
    }
  }

  // Prefetch signed URLs for visible image rows (current page)
  useEffect(() => {
    void (async () => {
      const images = assets.filter((a) => a.asset_type === "image");
      for (const a of images) {
        if (signedUrlByAssetId[a.id] || loadingSignedUrlById[a.id]) continue;
        await getSignedUrl(a);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  async function loadAssets() {
    setAssetsLoading(true);
    setAssetsError(null);

    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("media_assets")
      .select(
        "id, asset_type, model, variant, title, storage_bucket, storage_path, mime_type, filename, is_active, created_at",
        { count: "exact" }
      )
      .eq("organization_id", orgId);

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    if (filterType !== "all") {
      query = query.eq("asset_type", filterType);
    }

    const trimmed = debouncedSearch.trim();
    if (trimmed) {
      const q = `%${trimmed}%`;
      query = query.or(`model.ilike.${q},title.ilike.${q},filename.ilike.${q}`);
    }

    const res = await query.order("created_at", { ascending: false }).range(from, to);

    if (res.error) {
      setAssetsError(res.error.message);
      setAssets([]);
      setTotalCount(0);
      setAssetsLoading(false);
      return;
    }

    setAssets((res.data ?? []) as MediaAsset[]);
    setTotalCount(res.count ?? 0);
    setAssetsLoading(false);
  }

  // Reset page on org change
  useEffect(() => {
    setPage(0);
  }, [orgId]);

  // Reset page when filters change (so pagination stays valid)
  useEffect(() => {
    setPage(0);
  }, [filterType, activeOnly, debouncedSearch]);

  // Load whenever orgId, page, or filters change
  useEffect(() => {
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, page, filterType, activeOnly, debouncedSearch]);

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

      setPage(0);
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

  async function onSetActive(asset: MediaAsset, nextIsActive: boolean) {
    const toastId = toast.loading("Updating…");
    const res = await supabase
      .from("media_assets")
      .update({ is_active: nextIsActive })
      .eq("id", asset.id)
      .eq("organization_id", orgId);

    if (res.error) {
      toast.error(res.error.message, { id: toastId });
      return;
    }

    toast.success(nextIsActive ? "Activated." : "Deactivated.", { id: toastId });
    await loadAssets();
  }

  async function onOpen(asset: MediaAsset) {
    const url = await getSignedUrl(asset);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
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

      // If we just removed the last item on a non-zero page, move back a page.
      const remainingIfCurrentRemoved = Math.max(0, totalCount - 1);
      const lastValidPage = Math.max(0, Math.ceil(remainingIfCurrentRemoved / pageSize) - 1);
      if (page > lastValidPage) {
        setPage(lastValidPage);
        return;
      }

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
            ) : assets.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                No assets found.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-slate-600">
                        <th className="px-3 py-2 font-semibold">Preview</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Model / Variant</th>
                        <th className="px-3 py-2 font-semibold">Title</th>
                        <th className="px-3 py-2 font-semibold">Filename</th>
                        <th className="px-3 py-2 font-semibold">Active</th>
                        <th className="px-3 py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {assets.map((a) => {
                        const signedUrl = signedUrlByAssetId[a.id];
                        const isPreviewLoading = !!loadingSignedUrlById[a.id];

                        return (
                          <tr key={a.id} className="text-slate-700">
                            <td className="px-3 py-2">
                              {a.asset_type === "image" ? (
                                signedUrl ? (
                                  <img
                                    src={signedUrl}
                                    alt={a.title}
                                    className="h-10 w-10 rounded border border-slate-200 object-cover"
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-500">
                                    {isPreviewLoading ? "Loading…" : "—"}
                                  </div>
                                )
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                                  PDF
                                </div>
                              )}
                            </td>
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
                                  onClick={() => void onOpen(a)}
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onSetActive(a, false)}
                                  disabled={!a.is_active}
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Deactivate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onSetActive(a, true)}
                                  disabled={a.is_active}
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Activate
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={!canGoPrev || assetsLoading}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!canGoNext || assetsLoading}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Page <span className="font-semibold text-slate-700">{page + 1}</span> of{" "}
                  <span className="font-semibold text-slate-700">{totalPages}</span>
                </span>
                <span>
                  Total <span className="font-semibold text-slate-700">{totalCount}</span>
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}