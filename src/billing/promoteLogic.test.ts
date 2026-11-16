import { describe, expect, test } from "vitest";
import {
  audioContentType,
  briefAsText,
  canGoBack,
  canPay,
  canSend,
  clipTimer,
  decodeReply,
  decodeStart,
  decodeTranscript,
  doneLine,
  initialPromoState,
  micLevel,
  payLabel,
  promoReducer,
  promoStatusLine,
  questionLine,
  replyMessages,
  withTranscript,
  type Brief,
  type PromoAction,
  type PromoState,
} from "./promoteLogic";

const brief: Brief = { name: "Inkwell", pitch: "Newsletters that write back.", claims: ["Free for 30 days", "Used by 2,000 writers"], cta: "Try it free" };
const run = (actions: PromoAction[], from: PromoState = initialPromoState) => actions.reduce(promoReducer, from);
const atChat = () => run([{ type: "who", who: "founder" }, { type: "section", section: "tech" }]);

describe("steps", () => {
  test("who, section, chat, link, status, done", () => {
    let s = run([{ type: "who", who: "creator" }]);
    expect(s.step).toBe("section");
    expect(s.persona).toBe("creator");
    s = promoReducer(s, { type: "section", section: "money" });
    expect(s.step).toBe("chat");
    expect(s.section).toBe("money");
    s = promoReducer(s, { type: "toLink" });
    expect(s.step).toBe("chat");
    s = run([{ type: "send", text: "My newsletter" }, { type: "brief", brief }, { type: "toLink" }], s);
    expect(s.step).toBe("link");
    s = run([{ type: "link", link: "https://inkwell.app" }, { type: "started", commissionId: "c1", checkoutUrl: "https://whop.com/c1" }], s);
    expect(s.step).toBe("status");
    expect(s.commissionId).toBe("c1");
    s = promoReducer(s, { type: "ready", comicId: "k1" });
    expect(s).toMatchObject({ step: "done", comicId: "k1" });
  });

  test("just for me goes to the private flow and back", () => {
    const s = run([{ type: "who", who: "me" }]);
    expect(s.step).toBe("me");
    expect(s.persona).toBeNull();
    expect(canGoBack(s)).toBe(true);
    expect(promoReducer(s, { type: "back" }).step).toBe("who");
  });

  test("back walks one step and keeps the conversation", () => {
    const chat = run([{ type: "send", text: "hi" }, { type: "brief", brief }, { type: "toLink" }], atChat());
    const back = promoReducer(chat, { type: "back" });
    expect(back.step).toBe("chat");
    expect(back.brief).toEqual(brief);
    expect(back.messages).toHaveLength(2);
    expect(promoReducer(back, { type: "back" }).step).toBe("section");
    expect(promoReducer(promoReducer(back, { type: "back" }), { type: "back" }).step).toBe("who");
  });

  test("no back while a call is in flight or after paying", () => {
    const busy = promoReducer(atChat(), { type: "send", text: "hi" });
    expect(canGoBack(busy)).toBe(false);
    expect(promoReducer(busy, { type: "back" })).toBe(busy);
    const paid = { ...atChat(), step: "status" as const };
    expect(canGoBack(paid)).toBe(false);
    expect(promoReducer(paid, { type: "back" })).toBe(paid);
  });

  test("ready only lands from the status step", () => {
    expect(promoReducer(atChat(), { type: "ready", comicId: "x" }).step).toBe("chat");
  });

  test("reset clears everything", () => {
    expect(promoReducer(atChat(), { type: "reset" })).toEqual(initialPromoState);
  });
});

describe("chat", () => {
  test("send appends a trimmed user turn and waits for Robo", () => {
    const s = promoReducer(atChat(), { type: "send", text: "  my app  " });
    expect(s.messages).toEqual([{ role: "user", text: "my app" }]);
    expect(s.pending).toBe("reply");
    expect(promoReducer(atChat(), { type: "send", text: "   " })).toEqual(atChat());
  });

  test("questions are counted and the brief goes back as text", () => {
    let s = run([{ type: "send", text: "a" }, { type: "question", text: "What's it called?" }, { type: "send", text: "b" }, { type: "question", text: "What's new?" }], atChat());
    expect(s.questions).toBe(2);
    expect(questionLine(s)).toBe("Question 2 of 3");
    s = run([{ type: "send", text: "c" }, { type: "brief", brief }], s);
    expect(questionLine(s)).toBeNull();
    expect(s.messages.at(-1)).toEqual({ role: "robo", text: briefAsText(brief), isBrief: true });
    expect(replyMessages(s.messages).at(-1)).toEqual({ role: "robo", text: briefAsText(brief) });
    expect(s.pending).toBeNull();
  });

  test("an edit after the brief replaces it", () => {
    const edited = { ...brief, pitch: "Write less, say more." };
    const s = run([{ type: "send", text: "a" }, { type: "brief", brief }, { type: "send", text: "change the pitch to Write less, say more." }, { type: "brief", brief: edited }], atChat());
    expect(s.brief).toEqual(edited);
    expect(s.messages).toHaveLength(4);
  });

  test("canSend needs text, the chat step and no call in flight", () => {
    const s = atChat();
    expect(canSend(s, "hello")).toBe(true);
    expect(canSend(s, "   ")).toBe(false);
    expect(canSend(s, "x".repeat(1001))).toBe(false);
    expect(canSend({ ...s, pending: "transcribe" }, "hello")).toBe(false);
    expect(canSend(initialPromoState, "hello")).toBe(false);
    const full = { ...s, messages: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? ("robo" as const) : ("user" as const), text: "x" })) };
    expect(canSend(full, "hello")).toBe(false);
  });

  test("errors end the pending call and are cleared by the next one", () => {
    const failed = promoReducer(promoReducer(atChat(), { type: "send", text: "hi" }), { type: "error", message: "Nope." });
    expect(failed).toMatchObject({ pending: null, error: "Nope." });
    expect(promoReducer(failed, { type: "send", text: "again" }).error).toBeNull();
  });

  test("briefAsText names every part", () => {
    const t = briefAsText(brief);
    for (const part of [brief.name, brief.pitch, brief.cta, ...brief.claims]) expect(t).toContain(part);
  });
});

describe("link and pay", () => {
  const atLink = () => run([{ type: "send", text: "a" }, { type: "brief", brief }, { type: "toLink" }], atChat());

  test("a well-formed link is all it takes to pay; no page check", () => {
    expect(canPay(atLink())).toBe(false);
    expect(canPay(promoReducer(atLink(), { type: "link", link: "inkwell" }))).toBe(false);
    const s = promoReducer(atLink(), { type: "link", link: "https://inkwell.app/pricing" });
    expect(canPay(s)).toBe(true);
    expect(canPay({ ...s, pending: "start" })).toBe(false);
  });

  test("started keeps the checkout link for the hosted fallback", () => {
    const s = run([{ type: "link", link: "https://inkwell.app" }, { type: "started", commissionId: "c1", checkoutUrl: "https://whop.com/c1" }], atLink());
    expect(s).toMatchObject({ step: "status", commissionId: "c1", checkoutUrl: "https://whop.com/c1" });
  });

  test("labels name the section and the $5 price", () => {
    expect(payLabel("tech")).toBe("Publish in Tech for $5");
    expect(payLabel("memes")).toBe("Publish in Memes for $5");
    expect(payLabel("tech", true)).toBe("Opening checkout");
    expect(doneLine("culture")).toBe("Your comic is live in Culture");
    expect(promoStatusLine("drawing", "money")).toContain("Money");
    expect(promoStatusLine("refunded", "money")).toContain("$5");
  });
});

describe("decoders", () => {
  test("reply", () => {
    expect(decodeReply({ kind: "question", text: "What's new?" })).toEqual({ kind: "question", text: "What's new?" });
    expect(decodeReply({ kind: "brief", brief: { ...brief, claims: ["a", "b", "c", "d", "e", 3] } })).toEqual({ kind: "brief", brief: { ...brief, claims: ["a", "b", "c", "d"] } });
    expect(decodeReply({ kind: "brief", brief: { name: "x" } })).toMatchObject({ kind: "error" });
    expect(decodeReply({ kind: "error", reason: "limit", message: "Come back tomorrow." })).toEqual({ kind: "error", message: "Come back tomorrow." });
    expect(decodeReply({ kind: "error", reason: "limit" })).toEqual({ kind: "error", message: "That's enough for today. Try again tomorrow." });
    expect(decodeReply(null)).toMatchObject({ kind: "error" });
  });

  test("transcript and start", () => {
    expect(decodeTranscript({ kind: "text", text: " hello " })).toEqual({ kind: "text", text: "hello" });
    expect(decodeTranscript({ kind: "error", reason: "unavailable", message: "Mic desk is closed." })).toEqual({ kind: "error", message: "Mic desk is closed." });
    expect(decodeStart({ kind: "checkout", commissionId: "c", url: "https://whop.com/x", section: "tech" })).toEqual({ kind: "checkout", commissionId: "c", url: "https://whop.com/x" });
    expect(decodeStart({ kind: "checkout", commissionId: "c" })).toMatchObject({ kind: "error" });
  });
});

describe("microphone helpers", () => {
  test("content type from the file name", () => {
    expect(audioContentType("file:///cache/rec.m4a")).toBe("audio/mp4");
    expect(audioContentType("file:///cache/rec.wav")).toBe("audio/wav");
    expect(audioContentType("blob:x/rec.webm?y=1")).toBe("audio/webm");
    expect(audioContentType("file:///cache/rec.3gp")).toBe("audio/3gpp");
  });

  test("timer and level", () => {
    expect(clipTimer(0)).toBe("0:00");
    expect(clipTimer(9_500)).toBe("0:09");
    expect(clipTimer(75_000)).toBe("0:60");
    expect(micLevel(undefined)).toBe(0);
    expect(micLevel(-160)).toBe(0);
    expect(micLevel(0)).toBe(1);
    expect(micLevel(-30)).toBeCloseTo(0.5);
  });

  test("the transcript joins what is already typed", () => {
    expect(withTranscript("", " hello ")).toBe("hello");
    expect(withTranscript("My app", "launches today")).toBe("My app launches today");
    expect(withTranscript("keep", "  ")).toBe("keep");
  });
});
