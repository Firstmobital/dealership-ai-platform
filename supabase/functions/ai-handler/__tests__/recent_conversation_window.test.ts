// supabase/functions/ai-handler/__tests__/recent_conversation_window.test.ts
import { assertEquals, assert } from "./test_harness.ts";
import { buildRecentConversationBlock } from "../main_handler.ts";

type Row = {
  conversation_id: string;
  organization_id?: string;
  sender: string | null;
  text: string | null;
  message_type: string | null;
  created_at: string | null;
};

function lines(block: string): string[] {
  return String(block || "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
}

Deno.test("recent window: only same conversation_id + organization_id are included", () => {
  const rows: Row[] = [
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "customer",
      text: "hi",
      message_type: "text",
      created_at: "2026-03-06T10:00:00.000Z",
    },
    {
      conversation_id: "convB",
      organization_id: "org1",
      sender: "customer",
      text: "other conversation",
      message_type: "text",
      created_at: "2026-03-06T10:00:01.000Z",
    },
    {
      conversation_id: "convA",
      organization_id: "org2",
      sender: "customer",
      text: "wrong org",
      message_type: "text",
      created_at: "2026-03-06T10:00:02.000Z",
    },
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "bot",
      text: "hello",
      message_type: "text",
      created_at: "2026-03-06T10:00:03.000Z",
    },
  ];

  const block = buildRecentConversationBlock({
    messages: rows,
    organizationId: "org1",
    conversationId: "convA",
    maxMessages: 8,
    maxTextLen: 200,
  });

  assert(block.includes("Customer: hi"));
  assert(block.includes("Assistant: hello"));
  assertEquals(block.includes("other conversation"), false);
  assertEquals(block.includes("wrong org"), false);
});

Deno.test("recent window: max 8 messages included (takes last N)", () => {
  const rows: Row[] = [];
  for (let i = 1; i <= 12; i += 1) {
    rows.push({
      conversation_id: "convA",
      organization_id: "org1",
      sender: i % 2 === 0 ? "bot" : "customer",
      text: `m${i}`,
      message_type: "text",
      created_at: `2026-03-06T10:00:${String(i).padStart(2, "0")}.000Z`,
    });
  }

  const block = buildRecentConversationBlock({
    messages: rows,
    organizationId: "org1",
    conversationId: "convA",
    maxMessages: 8,
    maxTextLen: 200,
  });

  const ls = lines(block);
  // first line is header
  assertEquals(ls[0], "Recent conversation:");
  // should have 1 header + 8 messages
  assertEquals(ls.length, 1 + 8);
  // should keep the last 8: m5..m12
  assert(block.includes("m5"));
  assertEquals(block.includes("m4"), false);
  assert(block.includes("m12"));
});

Deno.test("recent window: chronological ordering is preserved", () => {
  const rows: Row[] = [
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "customer",
      text: "first",
      message_type: "text",
      created_at: "2026-03-06T10:00:00.000Z",
    },
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "bot",
      text: "second",
      message_type: "text",
      created_at: "2026-03-06T10:00:01.000Z",
    },
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "customer",
      text: "third",
      message_type: "text",
      created_at: "2026-03-06T10:00:02.000Z",
    },
  ];

  const block = buildRecentConversationBlock({
    messages: rows,
    organizationId: "org1",
    conversationId: "convA",
    maxMessages: 8,
    maxTextLen: 200,
  });

  const ls = lines(block);
  assertEquals(ls[1], "Customer: first");
  assertEquals(ls[2], "Assistant: second");
  assertEquals(ls[3], "Customer: third");
});

Deno.test("recent window: media-only message is converted to short marker", () => {
  const rows: Row[] = [
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "customer",
      text: null,
      message_type: "image",
      created_at: "2026-03-06T10:00:00.000Z",
    },
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "bot",
      text: null,
      message_type: "document",
      created_at: "2026-03-06T10:00:01.000Z",
    },
  ];

  const block = buildRecentConversationBlock({
    messages: rows,
    organizationId: "org1",
    conversationId: "convA",
    maxMessages: 8,
    maxTextLen: 200,
  });

  assert(block.includes("Customer: [image]"));
  assert(block.includes("Assistant: [document]"));
  // Ensure no metadata leakage (this helper should not inject anything else)
  assertEquals(/https?:\/\//i.test(block), false);
});

Deno.test("recent window: empty/null text messages are skipped safely", () => {
  const rows: Row[] = [
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "customer",
      text: "   ",
      message_type: "text",
      created_at: "2026-03-06T10:00:00.000Z",
    },
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "customer",
      text: null,
      message_type: null,
      created_at: "2026-03-06T10:00:01.000Z",
    },
    {
      conversation_id: "convA",
      organization_id: "org1",
      sender: "bot",
      text: "ok",
      message_type: "text",
      created_at: "2026-03-06T10:00:02.000Z",
    },
  ];

  const block = buildRecentConversationBlock({
    messages: rows,
    organizationId: "org1",
    conversationId: "convA",
    maxMessages: 8,
    maxTextLen: 200,
  });

  const ls = lines(block);
  // header + 1 valid message
  assertEquals(ls.length, 2);
  assertEquals(ls[1], "Assistant: ok");
});
