// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY');
    // Return zero vector so function still "works" even if key missing
    return Array(1536).fill(0);
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // IMPORTANT: this model outputs 1536-dim vectors
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI embeddings error:', errorText);
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const json = await response.json();
  const embedding = json?.data?.[0]?.embedding;

  if (!Array.isArray(embedding)) {
    console.error('Invalid embedding shape from OpenAI:', json);
    throw new Error('Invalid embedding from OpenAI');
  }

  return embedding;
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
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(
        JSON.stringify({ error: 'Supabase environment not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const { article_id } = await req.json();

    if (!article_id) {
      return new Response(
        JSON.stringify({ error: 'article_id required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { data: article, error: articleError } = await supabase
      .from('knowledge_articles')
      .select('*')
      .eq('id', article_id)
      .maybeSingle();

    if (articleError) {
      console.error('Error fetching article:', articleError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch article' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!article) {
      return new Response(
        JSON.stringify({ error: 'Article not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const chunks = chunkText(article.content);
    const records: any[] = [];

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk);
      records.push({ article_id, chunk, embedding });
    }

    const { error: insertError } = await supabase
      .from('knowledge_chunks')
      .insert(records);

    if (insertError) {
      console.error('Error inserting chunks:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to insert chunks' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, chunks: records.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Unhandled error in embed-article:', err);
    return new Response(
      JSON.stringify({ error: 'Unhandled error in embed-article' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
