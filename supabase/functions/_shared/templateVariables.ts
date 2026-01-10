// src/lib/templateVariables.ts

export type TemplateVarSchema = {
    header_variable_count: number;
    header_variable_indices: number[] | null;
    body_variable_count: number;
    body_variable_indices: number[] | null;
  };
  
  export type ParsedTemplateVariables = {
    header: Record<number, string>;
    body: Record<number, string>;
  };
  
  /* ============================================================
     CSV VARIABLE PARSING
  ============================================================ */
  export function parseCsvVariables(
    row: Record<string, string>,
  ): ParsedTemplateVariables {
    const header: Record<number, string> = {};
    const body: Record<number, string> = {};
  
    for (const [key, value] of Object.entries(row)) {
      if (!value) continue;
  
      // header_1, header_2
      if (key.startsWith("header_")) {
        const idx = Number(key.replace("header_", ""));
        if (!Number.isNaN(idx)) header[idx] = value;
        continue;
      }
  
      // body_1, body_2
      if (key.startsWith("body_")) {
        const idx = Number(key.replace("body_", ""));
        if (!Number.isNaN(idx)) body[idx] = value;
        continue;
      }
  
      // legacy numeric → body
      if (/^\d+$/.test(key)) {
        const idx = Number(key);
        body[idx] = value;
      }
    }
  
    return { header, body };
  }
  
  /* ============================================================
     VALIDATION
  ============================================================ */
  export function validateTemplateVariables(
    vars: ParsedTemplateVariables,
    schema: TemplateVarSchema,
  ): { ok: boolean; error?: string } {
    // Header validation
    if (schema.header_variable_count > 0) {
      if (!schema.header_variable_indices) {
        return { ok: false, error: "Header variable schema missing" };
      }
  
      for (const idx of schema.header_variable_indices) {
        if (!vars.header[idx]) {
          return {
            ok: false,
            error: `Missing header variable {{${idx}}}`,
          };
        }
      }
    }
  
    // Body validation
    if (schema.body_variable_count > 0) {
      if (!schema.body_variable_indices) {
        return { ok: false, error: "Body variable schema missing" };
      }
  
      for (const idx of schema.body_variable_indices) {
        if (!vars.body[idx]) {
          return {
            ok: false,
            error: `Missing body variable {{${idx}}}`,
          };
        }
      }
    }
  
    return { ok: true };
  }
  
  /* ============================================================
     WHATSAPP COMPONENT BUILDER
  ============================================================ */
  export function buildWhatsappComponents(
    vars: ParsedTemplateVariables,
    schema: TemplateVarSchema,
  ) {
    const components: any[] = [];
  
    if (schema.header_variable_count > 0) {
      components.push({
        type: "header",
        parameters: schema.header_variable_indices!.map((idx) => ({
          type: "text",
          text: vars.header[idx],
        })),
      });
    }
  
    if (schema.body_variable_count > 0) {
      components.push({
        type: "body",
        parameters: schema.body_variable_indices!.map((idx) => ({
          type: "text",
          text: vars.body[idx],
        })),
      });
    }
  
    return components;
  }
  