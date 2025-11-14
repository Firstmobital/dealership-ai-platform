// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return Array(1536).fill(0);
  }
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: text
    })
  });
  const json = await response.json();
  return json?.data?.[0]?.embedding ?? Array(1536).fill(0);
}

function chunkText(text: string, chunkSize = 500): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (current.join(' ').length > chunkSize) {
      chunks.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { article_id } = await req.json();
  if (!article_id) {
    return new Response(JSON.stringify({ error: 'article_id required' }), { status: 400 });
  }

  const { data: article } = await supabase.from('knowledge_articles').select('*').eq('id', article_id).maybeSingle();
  if (!article) {
    return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
  }

  const chunks = chunkText(article.content);
  const records = [];
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk);
    records.push({ article_id, chunk, embedding });
  }

  await supabase.from('knowledge_chunks').insert(records);

  return new Response(JSON.stringify({ success: true, chunks: records.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
