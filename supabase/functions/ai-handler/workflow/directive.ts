// supabase/functions/ai-handler/workflow/directive.ts
// Engine-enforced workflow directives: the engine decides, LLM only renders.

export type SaySchema = {
  allow_numbers: boolean;
  max_questions: number;
  forbidden_phrases?: string[];
};

export type WorkflowDirective =
  | {
      action: "ask";
      question: string;
      required_entities: string[];
      step_order: number;
    }
  | {
      // Phase 1: hidden workflow guidance (never sent verbatim to customer)
      action: "guide";
      guide_text: string;
      step_order: number;
    }
  | {
      action: "say";
      message_seed: string;
      schema: SaySchema;
      step_order: number;
    }
  | {
      action: "send_media";
      media_key: string;
      caption_seed?: string;
      step_order: number;
    }
  | {
      action: "escalate";
      reason: string;
      step_order: number;
    };

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function readActionFirstString(params: {
  actionValue: unknown;
  legacyTopLevelValue: unknown;
  fallback?: string;
}): string {
  // Runtime source of truth: action.*
  // Deprecated compat fallback: top-level step mirrors.
  if (typeof params.actionValue === "string") return params.actionValue;
  if (typeof params.legacyTopLevelValue === "string") return params.legacyTopLevelValue;
  return params.fallback ?? "";
}

function readInstructionText(step: unknown): string {
  const s = asRecord(step);
  const action = asRecord(s.action);

  return readActionFirstString({
    actionValue: action.instruction_text,
    legacyTopLevelValue: s.instruction_text,
    fallback: "",
  }).trim();
}

function readAiAction(step: unknown): string {
  const s = asRecord(step);
  const action = asRecord(s.action);

  const raw = readActionFirstString({
    actionValue: action.ai_action,
    legacyTopLevelValue: s.ai_action ?? s.aiAction,
    fallback: "instruction",
  });
  const t = String(raw).trim();
  return t || "instruction";
}

function parseSendMediaMeta(step: unknown): {
  media_key: string | null;
  caption_seed?: string;
} {
  const s = asRecord(step);
  const action = asRecord(s.action);

  // Canonical storage: action.metadata.send_media
  const meta = {
    ...asRecord(s.metadata),
    ...asRecord(action.metadata),
  };

  const mediaRaw = meta.send_media;
  const media_key =
    typeof mediaRaw === "string" && mediaRaw.trim().length > 0
      ? mediaRaw.trim()
      : null;

  const captionRaw = meta.caption_seed;
  const caption_seed =
    typeof captionRaw === "string" && captionRaw.trim().length > 0
      ? captionRaw.trim()
      : undefined;

  return { media_key, ...(caption_seed ? { caption_seed } : {}) };
}

function parseRequiredEntities(step: unknown): string[] {
  const s = asRecord(step);
  const action = asRecord(s.action);

  // Canonical contract (Phase 4): prefer action.expected_user_input/metadata.
  const actionMeta = asRecord(action.metadata);
  const legacyMeta = asRecord(s.metadata);

  const fromMeta = Array.isArray(actionMeta.required_entities)
    ? actionMeta.required_entities
    : Array.isArray(legacyMeta.required_entities)
      ? legacyMeta.required_entities
      : null;
  if (fromMeta && fromMeta.length) return fromMeta.map((x: unknown) => String(x));

  const rawExp = readActionFirstString({
    actionValue: action.expected_user_input,
    legacyTopLevelValue: s.expected_user_input,
    fallback: "",
  }).trim();
  if (!rawExp) return [];
  return rawExp
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
}

function parseSaySchema(step: unknown): SaySchema {
  const s = asRecord(step);
  const action = asRecord(s.action);

  // Canonical contract (Phase 4): prefer action.metadata, fallback to legacy metadata.
  const meta = {
    ...asRecord(s.metadata),
    ...asRecord(action.metadata),
  };

  const allow_numbers =
    typeof meta.allow_numbers === "boolean" ? meta.allow_numbers : false;
  const max_questions =
    typeof meta.max_questions === "number" && meta.max_questions >= 0
      ? meta.max_questions
      : 0;
  const forbidden_phrases: string[] = Array.isArray(meta.forbidden_phrases)
    ? meta.forbidden_phrases.map((x: unknown) => String(x)).filter(Boolean)
    : ["contact dealer", "contact dealership"];

  return { allow_numbers, max_questions, forbidden_phrases };
}

export function buildDirective(
  step: unknown,
  entities: Record<string, unknown>
): WorkflowDirective {
  const s = asRecord(step);
  const stepOrder = Number(s.step_order ?? s.stepOrder ?? 0) || 0;

  const instruction = readInstructionText(step);
  const aiAction = readAiAction(step);

  // Phase 8: workflow-driven media action (explicit metadata)
  // - only when action.metadata.send_media is present
  // - does not change any existing ai_action semantics
  const mediaMeta = parseSendMediaMeta(step);
  if (mediaMeta.media_key) {
    return {
      action: "send_media",
      media_key: mediaMeta.media_key,
      ...(mediaMeta.caption_seed ? { caption_seed: mediaMeta.caption_seed } : {}),
      step_order: stepOrder,
    };
  }

  // Phase 1: treat instruction-like / missing action as hidden guidance.
  // IMPORTANT: Never convert these into a customer-facing "say" seed.
  const aiActionNorm = aiAction.toLowerCase();
  if (aiActionNorm === "instruction" || aiActionNorm === "guide" || !aiActionNorm) {
    return {
      action: "guide",
      guide_text: instruction,
      step_order: stepOrder,
    };
  }

  if (aiActionNorm === "ask_question") {
    const required = parseRequiredEntities(step);
    const missing = required.filter((k) => !entities?.[k]);

    if (missing.length || required.length === 0) {
      return {
        action: "ask",
        question: instruction || "Could you please share a bit more detail?",
        required_entities: missing.length ? missing : required,
        step_order: stepOrder,
      };
    }

    return {
      action: "say",
      message_seed: "",
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  if (aiActionNorm === "end") {
    // Preserve legacy behavior: end steps were implemented as a final SAY.
    return {
      action: "say",
      message_seed: instruction,
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  if (aiActionNorm === "escalate") {
    return {
      action: "escalate",
      reason: instruction || "manual review",
      step_order: stepOrder,
    };
  }

  if (aiActionNorm === "branch") {
    // Preserve existing behavior for now (Phase 1: do not redesign branching).
    return {
      action: "say",
      message_seed: instruction,
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  // Phase 1 safety: fallback/default becomes GUIDE, not SAY.
  return {
    action: "guide",
    guide_text: instruction,
    step_order: stepOrder,
  };
}
