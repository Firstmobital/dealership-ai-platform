// supabase/functions/_shared/kbChunking.ts
// Shared KB chunking helpers used by multiple edge functions.
// Goal: preserve retrieval quality by avoiding splitting structured variant/price-sheet entries mid-block.

export type ChunkingMode = "variant_sheet" | "word";

export type ChunkingResult = {
  mode: ChunkingMode;
  chunks: string[];
};

const DEFAULT_MAX_WORDS = 180;
const DEFAULT_OVERLAP_WORDS = 30;
const DEFAULT_MAX_CHUNKS = 200;

// Guardrails to avoid over-triggering variant-sheet mode on normal narrative articles.
function normalize(s: string) {
  return (s || "").toLowerCase();
}

function splitLines(text: string): string[] {
  // Preserve original newlines in chunks by only splitting for analysis.
  // Support \r\n / \n.
  return (text || "").split(/\r?\n/);
}

function countStrongPricingFieldLines(lines: string[]): number {
  const pricingField = /^(\s*)(ex-?showroom|on\s*road|insurance|rto|registration|road\s*tax|tcs|handling|hypothecation|fastag)\b\s*[:\-–]/i;
  return lines.filter((l) => pricingField.test(l)).length;
}

function isVariantSheetHeuristic(params: { title?: string | null; keywords?: string[] | null; content: string }): boolean {
  const title = params.title || "";
  const keywords = params.keywords || [];
  const content = params.content || "";

  const lines = splitLines(content);

  // 1) Primary: 3+ lines starting with Variant:
  const variantLine = /^\s*variant\s*:/i;
  const variantCount = lines.filter((l) => variantLine.test(l)).length;
  if (variantCount >= 3) return true;

  // 2) Secondary: repeated pricing field labels across multiple lines.
  // Require both: enough labelled lines AND the document is fairly line-structured.
  const pricingLines = countStrongPricingFieldLines(lines);
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  const lineStructured = nonEmptyLines.length >= 10; // avoid short narrative docs
  if (lineStructured && pricingLines >= 8) return true;

  // 3) Title/keywords signals (but only if content also has some pricing structure)
  const sig = /(variants?|on\s*road|ex-?showroom|price\s*sheet|pricing)/i;
  const titleHit = sig.test(title);
  const keywordHit = keywords.some((k) => sig.test(String(k || "")));
  if ((titleHit || keywordHit) && (pricingLines >= 4 || variantCount >= 1)) return true;

  return false;
}

function chunkByWordsPreserveNewlines(
  text: string,
  maxWords = DEFAULT_MAX_WORDS,
  overlapWords = DEFAULT_OVERLAP_WORDS,
  maxChunks = DEFAULT_MAX_CHUNKS,
): string[] {
  // IMPORTANT: do NOT flatten whitespace/newlines. Use a word tokenizer that keeps exact source
  // by chunking on word boundaries calculated from a whitespace regex.
  const src = text || "";
  const tokens = src.match(/\S+/g) || [];
  if (!tokens.length) return [];

  // Build a parallel list of token start indices so we can slice the original text while preserving formatting.
  const tokenStartIndices: number[] = [];
  {
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) tokenStartIndices.push(m.index);
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < tokens.length && chunks.length < maxChunks) {
    const end = Math.min(start + maxWords, tokens.length);

    const startIdx = tokenStartIndices[start];
    const endIdxExclusive = end >= tokens.length
      ? src.length
      : tokenStartIndices[end];

    const slice = src.slice(startIdx, endIdxExclusive).trim();
    if (slice) chunks.push(slice);

    if (end >= tokens.length) break;
    start = Math.max(0, end - overlapWords);
  }

  return chunks;
}

function splitIntoVariantBlocks(content: string): string[] {
  const lines = splitLines(content);
  const blocks: string[] = [];
  const variantLine = /^\s*variant\s*:/i;

  let current: string[] = [];
  for (const line of lines) {
    if (variantLine.test(line)) {
      // Flush any accumulated preface or previous variant block.
      if (current.length) blocks.push(current.join("\n").trimEnd());
      current = [line];
    } else {
      // Keep content before the first Variant: as a preface block.
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n").trimEnd());

  return blocks
    .map((b) => b.trim())
    .filter(Boolean);
}

function packBlocksIntoChunks(params: {
  blocks: string[];
  maxWords?: number;
  maxChunks?: number;
}): string[] {
  const blocks = params.blocks || [];
  const maxWords = params.maxWords ?? DEFAULT_MAX_WORDS;
  const maxChunks = params.maxChunks ?? DEFAULT_MAX_CHUNKS;

  const chunks: string[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;

  const wordCount = (s: string) => (s.match(/\S+/g) || []).length;

  const flush = () => {
    if (!buffer.length) return;
    chunks.push(buffer.join("\n\n").trim());
    buffer = [];
    bufferWords = 0;
  };

  for (const b of blocks) {
    if (chunks.length >= maxChunks) break;

    const wc = wordCount(b);

    // Try to keep 1 entry per chunk.
    // If entry is short enough, allow packing with previous (2-3 entries) as long as word cap is respected.
    const canPack = buffer.length > 0 && (bufferWords + wc) <= maxWords && buffer.length < 3;

    if (wc > maxWords) {
      // Unusually long single entry: flush existing and split inside the entry.
      flush();
      const parts = chunkByWordsPreserveNewlines(b, maxWords, DEFAULT_OVERLAP_WORDS, Math.max(1, maxChunks - chunks.length));
      for (const p of parts) {
        if (chunks.length >= maxChunks) break;
        chunks.push(p);
      }
      continue;
    }

    if (canPack) {
      buffer.push(b);
      bufferWords += wc;
      continue;
    }

    // Start a new chunk for this entry
    flush();
    buffer.push(b);
    bufferWords = wc;
  }

  if (chunks.length < maxChunks) flush();

  return chunks.slice(0, maxChunks);
}

export function chunkKnowledgeArticle(params: {
  content: string;
  title?: string | null;
  keywords?: string[] | null;
  maxWords?: number;
  overlapWords?: number;
  maxChunks?: number;
  // Optional: set false to skip runtime sanity checks.
  sanityCheck?: boolean;
}): ChunkingResult {
  const content = params.content || "";
  const title = params.title ?? null;
  const keywords = params.keywords ?? null;

  const maxWords = params.maxWords ?? DEFAULT_MAX_WORDS;
  const overlapWords = params.overlapWords ?? DEFAULT_OVERLAP_WORDS;
  const maxChunks = params.maxChunks ?? DEFAULT_MAX_CHUNKS;

  const variantSheet = isVariantSheetHeuristic({ title, keywords, content });

  let mode: ChunkingMode = "word";
  let chunks: string[] = [];

  if (variantSheet) {
    const blocks = splitIntoVariantBlocks(content);

    // If heuristic matched but we can't form blocks (should be rare), fall back.
    if (blocks.length >= 1) {
      mode = "variant_sheet";
      chunks = packBlocksIntoChunks({ blocks, maxWords, maxChunks });
    }
  }

  if (mode === "word") {
    chunks = chunkByWordsPreserveNewlines(content, maxWords, overlapWords, maxChunks);
  }

  if (params.sanityCheck !== false) {
    const ok = sanityCheckChunks({ mode, chunks });
    if (!ok) {
      // Never crash ingestion: fall back to word chunking.
      mode = "word";
      chunks = chunkByWordsPreserveNewlines(content, maxWords, overlapWords, maxChunks);
    }
  }

  return { mode, chunks };
}

export function sanityCheckChunks(result: ChunkingResult): boolean {
  const { mode, chunks } = result;
  if (!chunks?.length) return true;

  // Check formatting/newlines preserved: at least one chunk should contain a line break if source is structured.
  // In word mode (narrative), may not necessarily contain line breaks; so only assert for variant_sheet.
  if (mode === "variant_sheet") {
    const hasAnyNewline = chunks.some((c) => c.includes("\n"));
    if (!hasAnyNewline) {
      console.warn("KB_CHUNK_SANITY_FAIL: variant_sheet chunks lost newlines");
      return false;
    }

    // Allow a preface chunk that may not include Variant:. Require that at least one chunk has Variant:.
    const hasSomeVariant = chunks.some((c) => /^.*\bvariant\s*:/im.test(c));
    if (!hasSomeVariant) {
      console.warn("KB_CHUNK_SANITY_FAIL: variant_sheet chunks missing 'Variant:' entirely");
      return false;
    }

    for (const c of chunks) {
      // No chunk should begin with a trailing pricing field label without Variant context.
      // This catches the exact retrieval failure mode described.
      const startsWithTrailingField = /^\s*(price|ex-?showroom|on\s*road|insurance|rto|registration)\b\s*[:\-–]/i.test(c);
      if (startsWithTrailingField && !/\bvariant\s*:/i.test(c)) {
        console.warn("KB_CHUNK_SANITY_FAIL: chunk begins with pricing field but has no Variant header");
        return false;
      }
    }
  }

  return true;
}
