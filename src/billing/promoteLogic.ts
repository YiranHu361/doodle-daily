import type { Section } from "../data/types";
import type { CommissionStatus } from "./logic";

export type Persona = "creator" | "founder";
export type Who = Persona | "me";
export type Brief = { name: string; pitch: string; claims: string[]; cta: string };
export type ChatMessage = { role: "user" | "robo"; text: string; isBrief?: boolean };
export type CheckedClaim = { text: string; backed: boolean };
export type LinkCheck = { readable: boolean; site: string; claims: CheckedClaim[] };
export type PromoStep = "who" | "me" | "section" | "chat" | "link" | "status" | "done";
export type Pending = "reply" | "transcribe" | "check" | "start" | null;
export type FailReason = "limit" | "not_allowed" | "bad_input" | "unavailable";

export const QUESTION_MAX = 3;
export const MESSAGE_MAX = 1000;
export const TURNS_MAX = 20;
export const LINK_MAX = 2000;
export const PROMO_PRICE = "$5";
export const CLIP_MAX_MS = 60_000;

export const SECTIONS: readonly Section[] = ["tech", "money", "culture", "memes"];
const SECTION_NAMES: Record<Section, string> = { tech: "Tech", money: "Money", culture: "Culture", memes: "Memes" };

export const WHO_CHOICES: readonly { who: Who; title: string; line: string }[] = [
  { who: "creator", title: "I'm a creator", line: "A channel, a newsletter, a course or a drop." },
  { who: "founder", title: "I'm a founder", line: "A product, a launch or a raise." },
  { who: "me", title: "Just for me", line: "A private comic from a topic or a link, for $1." },
];

export const SECTION_LINES: Record<Section, string> = {
  tech: "Launches, apps, AI and gadgets.",
  money: "Raises, deals, markets and side hustles.",
  culture: "Shows, music, sport, books and creators.",
  memes: "The joke of the day. Short and silly.",
};

export function sectionName(section: Section): string {
  return SECTION_NAMES[section];
}

export function openingLine(persona: Persona): string {
  return persona === "creator"
    ? "Tell me what you want to promote: your channel, newsletter, course or drop. What's new about it?"
    : "Tell me about your product or launch. What is it, and what's new?";
}

export type PromoState = {
  step: PromoStep;
  persona: Persona | null;
  section: Section | null;
  messages: ChatMessage[];
  questions: number;
  brief: Brief | null;
  link: string;
  check: LinkCheck | null;
  unchecked: boolean;
  commissionId: string | null;
  checkoutUrl: string | null;
  comicId: string | null;
  pending: Pending;
  error: string | null;
};

export const initialPromoState: PromoState = {
  step: "who",
  persona: null,
  section: null,
  messages: [],
  questions: 0,
  brief: null,
  link: "",
  check: null,
  unchecked: false,
  commissionId: null,
  checkoutUrl: null,
  comicId: null,
  pending: null,
  error: null,
};

export type PromoAction =
  | { type: "who"; who: Who }
  | { type: "section"; section: Section }
  | { type: "back" }
  | { type: "pending"; pending: Pending }
  | { type: "send"; text: string }
  | { type: "question"; text: string }
  | { type: "brief"; brief: Brief }
  | { type: "toLink" }
  | { type: "link"; link: string }
  | { type: "checked"; check: LinkCheck }
  | { type: "tryAnotherLink" }
  | { type: "continueUnchecked" }
  | { type: "started"; commissionId: string; checkoutUrl: string }
  | { type: "ready"; comicId: string | null }
  | { type: "error"; message: string }
  | { type: "reset" };

export function promoReducer(state: PromoState, action: PromoAction): PromoState {
  switch (action.type) {
    case "who":
      if (state.step !== "who") return state;
      return action.who === "me" ? { ...initialPromoState, step: "me" } : { ...initialPromoState, step: "section", persona: action.who };
    case "section":
      if (state.step !== "section") return state;
      return { ...state, step: "chat", section: action.section, error: null };
    case "back":
      return goBack(state);
    case "pending":
      return { ...state, pending: action.pending, error: action.pending ? null : state.error };
    case "send": {
      const text = action.text.trim();
      if (state.step !== "chat" || !text) return state;
      return { ...state, messages: [...state.messages, { role: "user", text }], pending: "reply", error: null };
    }
    case "question":
      if (state.step !== "chat") return state;
      return { ...state, messages: [...state.messages, { role: "robo", text: action.text }], questions: state.questions + 1, pending: null };
    case "brief":
      if (state.step !== "chat") return state;
      return { ...state, messages: [...state.messages, { role: "robo", text: briefAsText(action.brief), isBrief: true }], brief: action.brief, pending: null };
    case "toLink":
      return state.step === "chat" && state.brief ? { ...state, step: "link", error: null } : state;
    case "link":
      return { ...state, link: action.link, check: null, unchecked: false, error: null };
    case "checked":
      return { ...state, check: action.check, unchecked: false, pending: null, error: null };
    case "tryAnotherLink":
      return { ...state, link: "", check: null, unchecked: false, error: null };
    case "continueUnchecked":
      return state.check && !state.check.readable ? { ...state, unchecked: true } : state;
    case "started":
      return { ...state, step: "status", commissionId: action.commissionId, checkoutUrl: action.checkoutUrl, pending: null, error: null };
    case "ready":
      return state.step === "status" ? { ...state, step: "done", comicId: action.comicId } : state;
    case "error":
      return { ...state, pending: null, error: action.message };
    case "reset":
      return initialPromoState;
  }
}

function goBack(state: PromoState): PromoState {
  if (state.pending) return state;
  switch (state.step) {
    case "me":
    case "section":
      return initialPromoState;
    case "chat":
      return { ...state, step: "section", error: null };
    case "link":
      return { ...state, step: "chat", error: null };
    default:
      return state;
  }
}

export function canGoBack(state: PromoState): boolean {
  return !state.pending && (state.step === "me" || state.step === "section" || state.step === "chat" || state.step === "link");
}

export function canSend(state: PromoState, text: string): boolean {
  const t = text.trim();
  return state.step === "chat" && !state.pending && state.messages.length < TURNS_MAX && t.length > 0 && t.length <= MESSAGE_MAX;
}

export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return t.length <= LINK_MAX && /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(t);
}

export function canCheck(state: PromoState): boolean {
  return state.step === "link" && !state.pending && !state.check && looksLikeUrl(state.link);
}

export function canPay(state: PromoState): boolean {
  if (state.step !== "link" || state.pending || !state.check || !state.section) return false;
  return state.check.readable || state.unchecked;
}

export function payLabel(section: Section, pending = false): string {
  return pending ? "Opening checkout" : `Publish in ${sectionName(section)} for ${PROMO_PRICE}`;
}

export function questionLine(state: PromoState): string | null {
  if (state.brief || state.questions === 0) return null;
  return `Question ${Math.min(state.questions, QUESTION_MAX)} of ${QUESTION_MAX}`;
}

export function stepTitle(state: PromoState): string {
  switch (state.step) {
    case "who":
      return "Create a comic";
    case "me":
      return "Create a comic";
    case "section":
      return "Pick a section";
    case "chat":
      return "Tell Robo";
    case "link":
      return "The link that backs it up";
    case "status":
      return "Publishing";
    case "done":
      return "You're in the paper";
  }
}

export function stepLine(state: PromoState): string {
  switch (state.step) {
    case "who":
      return "Who is it for?";
    case "me":
      return "Robo draws anything, for $1.";
    case "section":
      return `Your comic runs in today's paper, for ${PROMO_PRICE}.`;
    case "chat":
      return "Type or talk. Robo asks a few short questions.";
    case "link":
      return "Robo checks every claim against this page.";
    case "status":
    case "done":
      return state.section ? `In ${sectionName(state.section)}, for every reader.` : "";
  }
}

export function briefAsText(brief: Brief): string {
  const claims = brief.claims.length ? brief.claims.map((c) => `- ${c}`).join("\n") : "- (none)";
  return `Here's the brief.\nName: ${brief.name}\nPitch: ${brief.pitch}\nClaims:\n${claims}\nCall to action: ${brief.cta}`;
}

export function replyMessages(messages: readonly ChatMessage[]): { role: "user" | "robo"; text: string }[] {
  return messages.map(({ role, text }) => ({ role, text }));
}

export function droppedClaims(check: LinkCheck | null): number {
  return check && check.readable ? check.claims.filter((c) => !c.backed).length : 0;
}

export function promoStatusLine(status: CommissionStatus, section: Section): string {
  const name = sectionName(section);
  switch (status) {
    case "awaiting_payment":
      return "Waiting for your payment. Finish the checkout, then come back here.";
    case "paid":
      return "Paid. Robo is writing your comic.";
    case "drawing":
      return `Robo is drawing your comic for ${name}.`;
    case "ready":
      return doneLine(section);
    case "failed":
      return `Robo could not finish this one. Your ${PROMO_PRICE} is being refunded.`;
    case "refunded":
      return `Robo could not finish this one. Your ${PROMO_PRICE} has been refunded.`;
  }
}

export function doneLine(section: Section): string {
  return `Your comic is live in ${sectionName(section)}`;
}

export function failMessage(reason: FailReason | null): string {
  switch (reason) {
    case "limit":
      return "That's enough for today. Try again tomorrow.";
    case "not_allowed":
      return "Robo can't promote that. Try something else.";
    case "bad_input":
      return "Robo didn't get that. Try again with a little more detail.";
    default:
      return "Robo can't reach the desk right now. Try again in a minute.";
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const REASONS: readonly FailReason[] = ["limit", "not_allowed", "bad_input", "unavailable"];

export type Failure = { kind: "error"; message: string };

export function decodeFailure(raw: unknown): Failure {
  const reason = isObj(raw) && REASONS.includes(raw.reason as FailReason) ? (raw.reason as FailReason) : null;
  return { kind: "error", message: (isObj(raw) && text(raw.message)) || failMessage(reason) };
}

export function decodeBrief(raw: unknown): Brief | null {
  if (!isObj(raw)) return null;
  const name = text(raw.name);
  const pitch = text(raw.pitch);
  const cta = text(raw.cta);
  if (!name || !pitch || !cta) return null;
  const claims = (Array.isArray(raw.claims) ? raw.claims : []).map(text).filter((c): c is string => c !== null).slice(0, 4);
  return { name, pitch, claims, cta };
}

export function decodeReply(raw: unknown): { kind: "question"; text: string } | { kind: "brief"; brief: Brief } | Failure {
  if (isObj(raw) && raw.kind === "question" && text(raw.text)) return { kind: "question", text: text(raw.text)! };
  if (isObj(raw) && raw.kind === "brief") {
    const brief = decodeBrief(raw.brief);
    if (brief) return { kind: "brief", brief };
  }
  return decodeFailure(raw);
}

export function decodeCheck(raw: unknown): { kind: "checked"; check: LinkCheck } | Failure {
  if (!isObj(raw) || raw.kind !== "checked" || typeof raw.readable !== "boolean") return decodeFailure(raw);
  const claims = (Array.isArray(raw.claims) ? raw.claims : [])
    .filter(isObj)
    .map((c) => ({ text: text(c.text), backed: c.backed === true }))
    .filter((c): c is CheckedClaim => c.text !== null);
  return { kind: "checked", check: { readable: raw.readable, site: text(raw.site) ?? "", claims } };
}

export function decodeTranscript(raw: unknown): { kind: "text"; text: string } | Failure {
  if (isObj(raw) && raw.kind === "text" && typeof raw.text === "string") return { kind: "text", text: raw.text.trim() };
  return decodeFailure(raw);
}

export function decodeStart(raw: unknown): { kind: "checkout"; commissionId: string; url: string } | Failure {
  if (isObj(raw) && raw.kind === "checkout" && text(raw.commissionId) && text(raw.url)) {
    return { kind: "checkout", commissionId: text(raw.commissionId)!, url: text(raw.url)! };
  }
  return decodeFailure(raw);
}

export function audioContentType(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    case "3gp":
      return "audio/3gpp";
    default:
      return "audio/mp4";
  }
}

export function clipTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `0:${String(Math.min(s, 60)).padStart(2, "0")}`;
}

export function micLevel(metering: number | undefined): number {
  if (metering === undefined || !Number.isFinite(metering)) return 0;
  return Math.max(0, Math.min(1, (metering + 60) / 60));
}

export function withTranscript(current: string, transcript: string): string {
  const t = transcript.trim();
  if (!t) return current;
  const c = current.trim();
  return (c ? `${c} ${t}` : t).slice(0, MESSAGE_MAX);
}
