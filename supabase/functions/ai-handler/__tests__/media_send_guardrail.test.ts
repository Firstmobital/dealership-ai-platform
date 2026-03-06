// supabase/functions/ai-handler/__tests__/media_send_guardrail.test.ts
import { assertEquals } from "./test_harness.ts";

function computeMediaSent(mediaTelemetry: { sent_images: number; sent_brochure: boolean }): boolean {
  return (mediaTelemetry.sent_images > 0) || (mediaTelemetry.sent_brochure === true);
}

function applyMediaNoFalseClaimGuard(params: {
  userText: string;
  aiText: string;
  wantsMedia: { wantImages: boolean; wantBrochure: boolean };
  mediaTelemetry: { requested: boolean; sent_images: number; sent_brochure: boolean };
  mediaModel: string | null;
}): string {
  const mediaSent = computeMediaSent({
    sent_images: params.mediaTelemetry.sent_images,
    sent_brochure: params.mediaTelemetry.sent_brochure,
  });

  let aiResponseText = params.aiText;

  if (params.mediaTelemetry.requested && !mediaSent) {
    const modelKnownNow = typeof params.mediaModel === "string" && params.mediaModel.trim().length > 0;

    if (!modelKnownNow) {
      aiResponseText = params.wantsMedia.wantBrochure
        ? "Please tell me which Tata model brochure you want."
        : "Please tell me which Tata model you want photos for.";
    } else {
      aiResponseText = params.wantsMedia.wantBrochure
        ? "I don't have that brochure uploaded yet. I can still share specifications or details."
        : "I don't have those images uploaded yet. I can still share specifications or details.";
    }
  }

  return aiResponseText;
}

function containsDisallowedMediaImpliedSendPhrases(text: string): boolean {
  const t = String(text || "").toLowerCase();

  // Narrow set: only phrases that strongly imply send actually happened.
  const patterns: RegExp[] = [
    /\bsending\b/i,
    /\bsent\b/i,
    /\bshared\b/i,
    /\battached\b/i,
    /\bhere\s+is\s+the\s+brochure\b/i,
    /\bhere\s+are\s+the\s+images\b/i,
  ];

  return patterns.some((re) => re.test(t));
}

Deno.test("guardrail: brochure requested, sent_brochure=false => response must not imply brochure was sent", () => {
  const out = applyMediaNoFalseClaimGuard({
    userText: "Send brochure",
    aiText: "Here is the brochure.",
    wantsMedia: { wantImages: false, wantBrochure: true },
    mediaTelemetry: { requested: true, sent_images: 0, sent_brochure: false },
    mediaModel: "nexon",
  });

  assertEquals(containsDisallowedMediaImpliedSendPhrases(out), false);
});

Deno.test("guardrail: images requested, sent_images=0 => response must not imply images were sent", () => {
  const out = applyMediaNoFalseClaimGuard({
    userText: "Send interior photos",
    aiText: "Sending interior photos now.",
    wantsMedia: { wantImages: true, wantBrochure: false },
    mediaTelemetry: { requested: true, sent_images: 0, sent_brochure: false },
    mediaModel: "harrier",
  });

  assertEquals(containsDisallowedMediaImpliedSendPhrases(out), false);
});

Deno.test("guardrail: brochure requested, sent_brochure=true => confirmation phrases allowed", () => {
  const out = applyMediaNoFalseClaimGuard({
    userText: "Send brochure",
    aiText: "Here is the brochure.",
    wantsMedia: { wantImages: false, wantBrochure: true },
    mediaTelemetry: { requested: true, sent_images: 0, sent_brochure: true },
    mediaModel: "nexon",
  });

  assertEquals(containsDisallowedMediaImpliedSendPhrases(out), true);
});
