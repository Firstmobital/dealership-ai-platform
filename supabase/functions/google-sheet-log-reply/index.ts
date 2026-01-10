// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { JWT } from "https://esm.sh/google-auth-library@9.14.0";
import { google } from "https://esm.sh/googleapis@131.0.0";

/* ============================================================
   ENV
============================================================ */

const SERVICE_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
const PRIVATE_KEY = (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "")
  .replace(/\\n/g, "\n");

if (!SERVICE_EMAIL || !PRIVATE_KEY) {
  throw new Error("Missing Google service account credentials");
}

/* ============================================================
   GOOGLE CLIENT
============================================================ */

const auth = new JWT({
  email: SERVICE_EMAIL,
  key: PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

/* ============================================================
   HELPERS
============================================================ */

async function ensureSheetTabExists(
  spreadsheetId: string,
  sheetTab: string,
) {
  try {
    // Attempt a lightweight read
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTab}!A1`,
    });
    return;
  } catch (err: any) {
    const msg = String(err?.message || "");

    // Only create tab if it truly does not exist
    if (
      msg.includes("Unable to parse range") ||
      msg.includes("Requested entity was not found")
    ) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetTab,
                },
              },
            },
          ],
        },
      });
      return;
    }

    // Any other error should bubble up
    throw err;
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

    const body = await req.json();

    const {
      spreadsheet_id,
      sheet_tab,
      phone,
      message,
      timestamp,
    } = body;

    if (!spreadsheet_id || !sheet_tab || !phone || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 },
      );
    }

    const ts = timestamp ?? new Date().toISOString();

    /* ============================================================
       1️⃣ ENSURE TAB EXISTS (AUTO-CREATE)
    ============================================================ */

    await ensureSheetTabExists(spreadsheet_id, sheet_tab);

    /* ============================================================
       2️⃣ ENSURE HEADER EXISTS (IDEMPOTENT)
    ============================================================ */

    const headerCheck = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet_id,
      range: `${sheet_tab}!A1:C1`,
    });

    if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheet_id,
        range: `${sheet_tab}!A1:C1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Phone", "Replies", "Last Updated"]],
        },
      });
    }

    /* ============================================================
       3️⃣ READ EXISTING ROWS
    ============================================================ */

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet_id,
      range: `${sheet_tab}!A:C`,
    });

    const rows = existing.data.values ?? [];
    const rowIndex = rows.findIndex((r) => r?.[0] === phone);

    const newLine = `[${ts}] ${message}`;

    /* ============================================================
       4️⃣ UPDATE OR APPEND ROW
    ============================================================ */

    if (rowIndex >= 1) {
      // Existing phone → append reply
      const prev = rows[rowIndex][1] ?? "";
      const updatedReplies = prev
        ? `${prev}\n${newLine}`
        : newLine;

      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheet_id,
        range: `${sheet_tab}!B${rowIndex + 1}:C${rowIndex + 1}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[updatedReplies, ts]],
        },
      });
    } else {
      // New phone → new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheet_id,
        range: `${sheet_tab}!A:C`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [[phone, newLine, ts]],
        },
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("[google-sheet-log-reply] error", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500 },
    );
  }
});
