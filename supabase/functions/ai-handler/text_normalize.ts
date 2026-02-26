export function normalizeForMatch(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle || needle.length < 3) return false;

  // Enforce word-boundary matching to avoid partial hits
  // e.g. "punch" should NOT match "puncher"
  const h = ` ${haystack} `;
  const n = ` ${needle} `;
  return h.includes(n);
}

