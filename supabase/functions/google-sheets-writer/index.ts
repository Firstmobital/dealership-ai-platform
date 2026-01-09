// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { JWT } from "https://esm.sh/google-auth-library@9.14.0";
import { google } from "https://esm.sh/googleapis@131.0.0";

const SERVICE_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
const PRIVATE_KEY = (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "")
  .replace(/\\n/g, "\n");

if (!SERVICE_EMAIL || !PRIVATE_KEY) {
  throw new Error("Missing Google service account credentials");
}

const auth = new JWT({
  email: SERVICE_EMAIL,
  key: PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

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

    // Ensure header exists (idempotent)
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheet_id,
      range: `${sheet_tab}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          "Phone",
          "Replies",
          "Last Updated",
        ]],
      },
    }).catch(() => {
      // Ignore header duplication errors
    });

    // Read existing rows
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet_id,
      range: `${sheet_tab}!A:C`,
    });

    const rows = existing.data.values ?? [];
    const rowIndex = rows.findIndex((r) => r?.[0] === phone);

    const newLine = `[${timestamp}] ${message}`;

    if (rowIndex >= 1) {
      // Update existing row
      const prev = rows[rowIndex][1] ?? "";
      const updated = prev ? `${prev}\n${newLine}` : newLine;

      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheet_id,
        range: `${sheet_tab}!B${rowIndex + 1}:C${rowIndex + 1}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[updated, timestamp]],
        },
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheet_id,
        range: `${sheet_tab}!A:C`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [[phone, newLine, timestamp]],
        },
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("[google-sheets-writer] error", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500 },
    );
  }
});
