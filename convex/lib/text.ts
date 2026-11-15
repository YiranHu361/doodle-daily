const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function stripHtml(html: string): string {
  const once = decodeEntities(
    html
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  );
  return once
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const space = slice.lastIndexOf(" ");
  return (space > max * 0.6 ? slice.slice(0, space) : slice).replace(/[\s,;:.-]+$/, "") + "…";
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function sentenceCount(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])["'’”)]*\s+(?=[A-Z0-9"'“‘(])/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}
