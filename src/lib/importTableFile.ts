// src/lib/importTableFile.ts
// CSV + Excel (.xlsx/.xls) import helpers

import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ImportedRow = Record<string, string>;

function normalizeHeaderKey(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function detectPhoneKey(headers: string[]) {
  const aliases = new Set([
    "phone",
    "mobile",
    "mobile_no",
    "mobile_number",
    "contact",
    "contact_no",
    "contact_number",
    "whatsapp",
    "whatsapp_number",
    "whatsapp_no",
  ]);

  const normalized = headers.map((h) => ({ raw: h, n: normalizeHeaderKey(h) }));

  const hit = normalized.find((h) => aliases.has(h.n));
  if (hit) return hit.raw;

  const fuzzy = normalized.find(
    (h) => h.n.includes("phone") || h.n.includes("mobile"),
  );
  return fuzzy?.raw ?? null;
}

// India-first E.164 normalization
export function normalizePhoneToE164India(raw: string): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+") && digits.length >= 10) {
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return `+${digits}`;
  }

  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;

  if (digits.length === 11 && digits.startsWith("0")) {
    const d10 = digits.slice(1);
    if (d10.length === 10) return `+91${d10}`;
  }

  return null;
}

function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export async function importTableFile(
  file: File,
): Promise<{ rows: ImportedRow[]; headers: string[] }> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = (parsed.data ?? []).map((r) => {
      const out: ImportedRow = {};
      for (const [k, v] of Object.entries(r ?? {})) {
        if (!k) continue;
        out[k] = stringifyCell(v);
      }
      return out;
    });

    const headers = Object.keys(rows[0] ?? {});
    return { rows, headers };
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { rows: [], headers: [] };
    const ws = wb.Sheets[sheetName];

    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
    });

    const rows = (json ?? []).map((r) => {
      const out: ImportedRow = {};
      for (const [k, v] of Object.entries(r ?? {})) {
        if (!k) continue;
        out[k] = stringifyCell(v);
      }
      return out;
    });

    const headers = Object.keys(rows[0] ?? {});
    return { rows, headers };
  }

  return { rows: [], headers: [] };
}
