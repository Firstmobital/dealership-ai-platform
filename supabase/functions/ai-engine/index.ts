// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

async function generateResponse(prompt: string, instructions: any) {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    return `AI response placeholder for: ${prompt}`;
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAIApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: prompt,
      metadata: instructions
    })
  });
  const json = await response.json();
  return json?.output?.[0]?.content?.[0]?.text ?? 'Unable to generate response.';
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { conversation_id } = await req.json();
  if (!conversation_id) {
    return new Response(JSON.stringify({ error: 'conversation_id missing' }), { status: 400 });
  }

  const { data: conversation } = await supabase
    .from('conversations')
    .select('*, contacts(*), organizations(*), bot_personality:organization_id(*), bot_instructions:organization_id(*)')
    .eq('id', conversation_id)
    .single();

  if (!conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true });

  const history = (messages ?? []).map((message) => `${message.sender}: ${message.text ?? ''}`).join('\n');

  const personality = conversation.bot_personality;
  const instructions = conversation.bot_instructions?.rules ?? {};

  const kbResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/match_knowledge_chunks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      query_embedding: Array(1536).fill(0),
      match_count: 3,
      match_threshold: 0.8
    })
  });
  const knowledge = await kbResponse.json();

  const prompt = `You are an AI assistant for ${conversation.organizations.name}. Tone: ${personality?.tone ?? 'Professional'}.
Customer: ${conversation.contacts?.name ?? conversation.contacts?.phone}.
Conversation history:\n${history}\nRelevant knowledge:\n${JSON.stringify(knowledge)}\nRespond helpfully.`;

  const aiResponse = await generateResponse(prompt, instructions);

  const { data: message } = await supabase
    .from('messages')
    .insert({
      conversation_id,
      sender: 'bot',
      message_type: 'text',
      text: aiResponse
    })
    .select()
    .single();

  await supabase.from('conversations').update({ last_message_at: message?.created_at }).eq('id', conversation_id);

  return new Response(JSON.stringify({ success: true, response: aiResponse }), { headers: { 'Content-Type': 'application/json' } });
});
