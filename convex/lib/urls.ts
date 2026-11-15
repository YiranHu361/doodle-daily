const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "cmpid",
  "guccounter",
  "taid",
  "mod",
]);

export function normaliseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const path = url.pathname.replace(/\/+$/, "") || "";
  const query = params.length ? "?" + new URLSearchParams(params).toString() : "";
  const port = url.port && url.port !== "80" && url.port !== "443" ? ":" + url.port : "";
  return `https://${host}${port}${path}${query}`;
}
