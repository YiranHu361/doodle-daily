const DEFAULT_CONVEX_URL = "https://resilient-ostrich-674.convex.cloud";

export function siteUrl(convexUrl: string): string {
  return convexUrl.replace(/\/+$/, "").replace(/\.convex\.cloud$/, ".convex.site");
}

export function storyLink(comicId: string, convexUrl: string = process.env.EXPO_PUBLIC_CONVEX_URL ?? DEFAULT_CONVEX_URL): string {
  return `${siteUrl(convexUrl)}/s/${encodeURIComponent(comicId)}`;
}

export function shareMessage(title: string, link: string): string {
  return `"${title}" ${link}`;
}
