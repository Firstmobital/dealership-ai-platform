// supabase/functions/ai-handler/workflow/required_entities_mapping.ts

/**
 * Deterministic mapping between workflow directive `required_entities` values and
 * workflow slot keys.
 *
 * HARD GUARANTEE:
 * - vehicle_model must map ONLY to vehicle_model (never fuel_type or anything else).
 */
export function mapRequiredEntityToSlotKey(entity: string): string {
  const k = String(entity || "").trim().toLowerCase();
  if (k === "fuel" || k === "fuel_type") return "fuel_type";
  if (k === "model" || k === "vehicle_model") return "vehicle_model";
  if (k === "variant" || k === "vehicle_variant") return "vehicle_variant";
  if (k === "city") return "city";
  if (k === "transmission") return "transmission";
  return k;
}

export function isNonEmptySlotValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/** Mirrors the `allPresent` check in main_handler.ts workflow auto-skip loop. */
export function areRequiredEntitiesPresent(
  requiredEntities: string[],
  slots: Record<string, unknown>
): boolean {
  const required = Array.isArray(requiredEntities) ? requiredEntities : [];
  if (!required.length) return false;

  const s = slots && typeof slots === "object" ? slots : {};

  return required
    .map(mapRequiredEntityToSlotKey)
    .filter(Boolean)
    .every((slotKey) => isNonEmptySlotValue((s as Record<string, unknown>)[slotKey]));
}
