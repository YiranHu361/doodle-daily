import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { httpAction, internalQuery, query } from "./_generated/server";
import { comicDTO, isCreatedFor, isVisible, toComicDTO } from "./lib/dto";

type StoryPanel = { caption: string; scene: string; imageUrl: string };

export type Story = {
  id: string;
  section: Doc<"comics">["section"];
  title: string;
  realStory: string;
  sourceName: string;
  sourceUrl: string;
  unverified: boolean;
  sponsored: boolean;
  sponsorName?: string;
  ctaLabel?: string;
  panels: StoryPanel[];
};

const SECTION_LABEL: Record<Story["section"], string> = { tech: "TECH", money: "MONEY", culture: "CULTURE", memes: "MEMES" };
const SECTION_COLOR: Record<Story["section"], string> = { tech: "#2DE2FF", money: "#7CFF6B", culture: "#FF4FB8", memes: "#A98BFF" };
const CACHE = "public, max-age=60";

function isPublicStory(comic: Doc<"comics">): boolean {
  return (
    isVisible(comic) &&
    comic.status === "ready" &&
    comic.owner === undefined &&
    isCreatedFor(comic, undefined) &&
    comic.kind !== "paper-sample" &&
    comic.panels.every((p) => p.imageId !== undefined)
  );
}

export const load = internalQuery({
  args: { comicId: v.string() },
  handler: async (ctx, { comicId }): Promise<Story | null> => {
    const id = ctx.db.normalizeId("comics", comicId);
    const comic = id ? await ctx.db.get(id) : null;
    if (!comic || !isPublicStory(comic)) return null;
    const panels: StoryPanel[] = [];
    for (const p of comic.panels) {
      const imageUrl = p.imageId ? await ctx.storage.getUrl(p.imageId) : null;
      if (!imageUrl) return null;
      panels.push({ caption: p.caption, scene: p.scene, imageUrl });
    }
    return {
      id: comic._id,
      section: comic.section,
      title: comic.title,
      realStory: comic.realStory,
      sourceName: comic.sourceName,
      sourceUrl: comic.sourceUrl,
      unverified: comic.unverified === true,
      sponsored: comic.sponsored === true,
      sponsorName: comic.sponsorName,
      ctaLabel: comic.ctaLabel,
      panels,
    };
  },
});

export const comic = query({
  args: { comicId: v.string(), deviceId: v.optional(v.string()) },
  returns: v.union(comicDTO, v.null()),
  handler: async (ctx, { comicId, deviceId }) => {
    const id = ctx.db.normalizeId("comics", comicId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || !isVisible(doc) || doc.kind === "paper-sample" || !isCreatedFor(doc, deviceId)) return null;
    return await toComicDTO(ctx, doc);
  },
});

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#100B2E;background-image:linear-gradient(#1A1446 1px,transparent 1px),linear-gradient(90deg,#1A1446 1px,transparent 1px);background-size:32px 32px;color:#BDB6EC;font:17px/1.5 "Chakra Petch",system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:560px;margin:0 auto;padding:24px 16px 48px}
.brand{font-family:Bungee,Impact,system-ui,sans-serif;color:#F5F2FF;font-size:22px;letter-spacing:1px;margin:0 0 20px}
.brand span{color:#2DE2FF}
.tags{display:flex;gap:8px;flex-wrap:wrap}
.tag{display:inline-block;padding:4px 10px;background:#261E63;border:1px solid var(--c);color:var(--c);font:500 13px/1.4 "Chakra Petch",system-ui,sans-serif;letter-spacing:1px;clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)}
h1{color:#F5F2FF;font:600 26px/1.25 "Chakra Petch",system-ui,sans-serif;margin:12px 0 24px}
.panel{background:#FBF7EC;color:#1B1736;border-radius:14px;padding:10px;margin:0 0 24px;box-shadow:0 0 36px -6px var(--c)}
.panel img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:#E9E3D2}
.panel figcaption{font:18px/1.4 "Balsamiq Sans","Comic Sans MS",system-ui,sans-serif;padding:10px 6px 4px}
.real{background:#1A1446;border:1.5px solid var(--c);box-shadow:0 0 12px -2px var(--c);padding:16px;clip-path:polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)}
.real h2{font:24px/1.2 Bungee,Impact,system-ui,sans-serif;color:#F5F2FF;margin:0 0 10px}
.real p{margin:0 0 12px}
.label{color:#9A92D6;font-size:13px;margin:0}
.source{color:#F5F2FF;font-weight:600}
.source a{color:#F5F2FF}
.cta{display:block;text-align:center;margin:28px 0 0;padding:14px 16px;background:#FFE83D;color:#140F33;font:600 17px/1.2 "Chakra Petch",system-ui,sans-serif;text-decoration:none;box-shadow:0 0 18px -4px #FFE83D;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
`;

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Balsamiq+Sans&family=Bungee&family=Chakra+Petch:wght@400;500;600&display=swap">';

export function renderStoryPage(story: Story, pageUrl: string): string {
  const e = escapeHtml;
  const color = SECTION_COLOR[story.section];
  const description = clip(story.realStory, 200);
  const source = safeHref(story.sourceUrl);
  const sourceLabel = story.sponsored ? e(story.sponsorName ? `Sponsored by ${story.sponsorName}` : "Sponsored") : "Source";
  const sourceName = story.sponsored
    ? e(story.unverified || !story.sourceName ? "Claims not checked" : `Claims checked against ${story.sourceName}`)
    : e(story.sourceName || "Unknown source");
  const sourceLink = source ? `<a href="${e(source)}" rel="noopener nofollow">${story.sponsored ? e(story.ctaLabel || "Open source") : sourceName}</a>` : "";
  const tags = [
    `<span class="tag">${SECTION_LABEL[story.section]}</span>`,
    story.sponsored ? '<span class="tag" style="--c:#FFE83D">SPONSORED</span>' : "",
    story.unverified ? '<span class="tag" style="--c:#C2185B">UNVERIFIED LINK</span>' : "",
  ].join("");
  const panels = story.panels
    .map(
      (p, i) =>
        `<figure class="panel"><img src="${e(p.imageUrl)}" alt="${e(p.scene || `Panel ${i + 1}`)}" width="512" height="512"${i === 0 ? "" : ' loading="lazy"'}><figcaption>${e(p.caption)}</figcaption></figure>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(story.title)} · Doodle Daily</title>
<meta name="description" content="${e(description)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Doodle Daily">
<meta property="og:title" content="${e(story.title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:image" content="${e(story.panels[0].imageUrl)}">
<meta property="og:url" content="${e(pageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(story.title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${e(story.panels[0].imageUrl)}">
<meta name="theme-color" content="#100B2E">
${FONTS}
<style>${STYLE}</style>
</head>
<body style="--c:${color}">
<main>
<p class="brand">DOODLE <span>DAILY</span></p>
<div class="tags">${tags}</div>
<h1>${e(story.title)}</h1>
${panels}
<section class="real">
<h2>THE REAL STORY</h2>
<p>${e(story.realStory)}</p>
<p class="label">${sourceLabel}</p>
<p class="source">${story.sponsored ? `${sourceName}${sourceLink ? `<br>${sourceLink}` : ""}` : sourceLink || sourceName}</p>
</section>
<a class="cta" href="doodledaily://reader/${encodeURIComponent(story.id)}">Open in Doodle Daily</a>
</main>
</body>
</html>`;
}

export function renderNotFoundPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Story not found · Doodle Daily</title>
<meta name="robots" content="noindex">
<style>${STYLE}</style>
</head>
<body style="--c:#2DE2FF">
<main>
<p class="brand">DOODLE <span>DAILY</span></p>
<h1>This story isn't here.</h1>
<p>Robo couldn't find that comic. It may still be drawing, or it was taken down.</p>
</main>
</body>
</html>`;
}

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": CACHE } });
}

export const storyPage = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const match = /^\/s\/([A-Za-z0-9]{1,64})\/?$/.exec(url.pathname);
  const story = match ? await ctx.runQuery(internal.storyPage.load, { comicId: match[1] }) : null;
  if (!story) return html(renderNotFoundPage(), 404);
  return html(renderStoryPage(story, `${url.origin}/s/${story.id}`), 200);
});
