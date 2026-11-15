import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { tool as keikiTool } from "./keiki";
import { verifyWebhook } from "./lib/webhook";

const http = httpRouter();

// ---------- Whop ----------

http.route({
  path: "/whop",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const id = req.headers.get("webhook-id");
    const verified = await verifyWebhook(
      process.env.WHOP_WEBHOOK_SECRET ?? "",
      { id, timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") },
      body,
      Date.now(),
    );
    if (!verified || !id) return new Response("invalid signature", { status: 401 });
    let event: { type?: unknown; data?: unknown };
    try {
      event = JSON.parse(body);
    } catch {
      return new Response("bad json", { status: 400 });
    }
    await ctx.runMutation(internal.billing.receiveWebhook, {
      eventId: id,
      type: typeof event.type === "string" ? event.type : "",
      dataJson: JSON.stringify(event.data ?? null),
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/whop/done",
  method: "GET",
  handler: httpAction(async () => {
    const page = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doodle Daily</title><body style="font-family:system-ui;text-align:center;padding:48px 24px"><h1>Thanks!</h1><p>Robo got the message. Close this page to go back to Doodle Daily.</p></body>`;
    return new Response(page, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }),
});

// ---------- Keiki ----------

http.route({ pathPrefix: "/keiki/", method: "POST", handler: keikiTool });

export default http;
