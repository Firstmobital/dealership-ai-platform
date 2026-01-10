// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

/* ============================================================
   ENV
============================================================ */

const SERVICE_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
const PRIVATE_KEY_PEM = (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "")
  .replace(/\\n/g, "\n");

if (!SERVICE_EMAIL || !PRIVATE_KEY_PEM) {
  throw new Error("Missing Google service account credentials");
}

/* ============================================================
   HELPERS: BASE64 + PEM → DER
============================================================ */

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  // Regular base64
  const b64 = btoa(String.fromCharCode(...bytes));
  // Convert to base64url
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlEncodeJson(obj: Record<string, unknown>): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

function pemToDer(pem: string): ArrayBuffer {
  // Remove PEM armor + whitespace
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  return bytes.buffer;
}

/* ============================================================
   GOOGLE AUTH (EDGE SAFE): Service Account JWT → Access Token
============================================================ */

async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };

  const claimSet = {
    iss: SERVICE_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsignedJwt = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(claimSet)}`;

  // ✅ Convert PEM text → DER bytes for pkcs8 import
  const der = pemToDer(PRIVATE_KEY_PEM);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  );

  const jwt = `${unsignedJwt}.${base64UrlEncodeBytes(new Uint8Array(sigBuf))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Google token error ${res.status}: ${JSON.stringify(data)}`);
  }

  if (!data.access_token) {
    throw new Error("Failed to obtain Google access token (missing access_token)");
  }

  return data.access_token;
}

/* ============================================================
   GOOGLE SHEETS REST HELPERS
============================================================ */

async function gsFetch(
  token: string,
  url: string,
  options: RequestInit = {},
) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-json response
  }

  if (!res.ok) {
    throw new Error(`Sheets API error ${res.status}: ${text}`);
  }

  return json;
}

async function ensureSheetTabExists(
  token: string,
  spreadsheetId: string,
  sheetTab: string,
) {
  // Try a lightweight read; if tab missing, create it
  try {
    await gsFetch(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTab)}!A1`,
    );
    return;
  } catch {
    // Create tab
    await gsFetch(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: { title: sheetTab },
              },
            },
          ],
        }),
      },
    );
  }
}

/* ============================================================
   SERVER
============================================================ */

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const {
      spreadsheet_id,
      sheet_tab,
      phone,
      message,
      timestamp,
    } = await req.json();

    if (!spreadsheet_id || !sheet_tab || !phone || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 },
      );
    }

    const ts = timestamp ?? new Date().toISOString();

    const token = await getGoogleAccessToken();

    /* 1️⃣ Ensure tab exists */
    await ensureSheetTabExists(token, spreadsheet_id, sheet_tab);

    /* 2️⃣ Ensure header exists (idempotent) */
    const header = await gsFetch(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(sheet_tab)}!A1:C1`,
    );

    if (!header?.values || header.values.length === 0) {
      await gsFetch(
        token,
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(sheet_tab)}!A1:C1?valueInputOption=RAW`,
        {
          method: "PUT",
          body: JSON.stringify({
            values: [["Phone", "Replies", "Last Updated"]],
          }),
        },
      );
    }

    /* 3️⃣ Read existing rows */
    const existing = await gsFetch(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(sheet_tab)}!A:C`,
    );

    const rows: any[] = existing?.values ?? [];
    const rowIndex = rows.findIndex((r) => r?.[0] === phone);

    const newLine = message;

    /* 4️⃣ Update or append */
    if (rowIndex >= 1) {
      const prev = rows[rowIndex][1] ?? "";
      const updated = prev ? `${prev}\n${newLine}` : newLine;

      await gsFetch(
        token,
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(sheet_tab)}!B${rowIndex + 1}:C${rowIndex + 1}?valueInputOption=RAW`,
        {
          method: "PUT",
          body: JSON.stringify({
            values: [[updated, ts]],
          }),
        },
      );
    } else {
      await gsFetch(
        token,
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(sheet_tab)}!A:C:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          body: JSON.stringify({
            values: [[phone, newLine, ts]],
          }),
        },
      );
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("[google-sheet-log-reply] error", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 },
    );
  }
});
