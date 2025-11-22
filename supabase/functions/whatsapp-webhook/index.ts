// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

serve(async (req) => {
  const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
  const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

  const payload = await req.json();
  const message = payload?.messages?.[0];
  if (!message) {
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', message.conversation_id)
    .maybeSingle();

  if (!conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
  }

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender: 'customer',
    message_type: 'text',
    text: message.text,
    media_url: message.media_url ?? null
  });

  await fetch(`${PROJECT_URL}/functions/v1/ai-engine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ conversation_id: conversation.id }),
  });

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
});
