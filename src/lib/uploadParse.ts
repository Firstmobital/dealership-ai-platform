import * as XLSX from "xlsx";
import Papa from "papaparse";
import { detectPhoneKey, normalizePhoneToE164India } from "./importTableFile";

export type IngestedRow = {
  phone: string;
  raw_row: Record<string, string>;
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function parseUploadFile(
  file: File
): Promise<{ rows: IngestedRow[]; headers: string[] }> {
  let rows: Record<string, string>[] = [];

  if (file.name.endsWith(".csv")) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    rows = parsed.data;
  } else {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet);
  }

  if (!rows.length) throw new Error("No rows found");

  const headers = Object.keys(rows[0]).map(normalizeHeader);
  const phoneKey = detectPhoneKey(headers);
  if (!phoneKey) {
    throw new Error("No phone/mobile column found");
  }

  const out: IngestedRow[] = [];

  for (const r of rows) {
    const normalized: Record<string, string> = {};
    Object.keys(r).forEach((k) => {
      normalized[normalizeHeader(k)] = String(r[k] ?? "").trim();
    });

    const phone = normalizePhoneToE164India(normalized[phoneKey]);
    if (!phone) continue;

    out.push({
      phone,
      raw_row: normalized,
    });
  }

  if (!out.length) throw new Error("No valid phone numbers found");

  return { rows: out, headers };
}
