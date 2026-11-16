import { addDays } from "../streak/dates";

export type CommissionStatus = "awaiting_payment" | "paid" | "drawing" | "ready" | "failed" | "refunded";
export type StartFailure = "not_allowed" | "spend_cap" | "bad_input" | "unavailable" | "error";

export const COMBO_STEP = 7;
export const TOPIC_MAX = 140;

export function looksLikeLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export function commissionArgs(text: string): { topic?: string; link?: string } {
  const value = text.trim();
  return looksLikeLink(value) ? { link: value } : { topic: value };
}

export function commissionLine(status: CommissionStatus): string {
  switch (status) {
    case "awaiting_payment":
      return "Waiting for your payment. Finish the checkout, then come back here.";
    case "paid":
      return "Paid. Creating your comic.";
    case "drawing":
      return "Creating your comic. Robo is drawing it now.";
    case "ready":
      return "Done! It's at the top of Today.";
    case "failed":
      return "Robo could not finish this one. Your $1 is being refunded.";
    case "refunded":
      return "Robo could not finish this one. Your $1 has been refunded.";
  }
}

export function startFailMessage(reason: StartFailure): string {
  switch (reason) {
    case "not_allowed":
      return "Robo skips stories about private lives, crime and tragedy. Try another topic.";
    case "spend_cap":
      return "Robo is out of crayons for today. Try again tomorrow.";
    case "bad_input":
      return "Type a topic (up to 140 characters) or paste a link Robo can read.";
    case "unavailable":
    case "error":
      return "Checkout isn't available right now. Try again in a minute.";
  }
}

export type TestPayFailure = "unavailable" | "bad_secret" | "not_found" | "already_paying" | "already_plus" | "limit" | "declined" | "error";

export function testPayMessage(reason: TestPayFailure, message?: string): string {
  switch (reason) {
    case "declined":
      return `Payment didn't go through: ${message?.replace(/[.\s]+$/, "") || "the card was declined"}.`;
    case "limit":
      return "That's 10 test payments today. Use Whop checkout instead.";
    case "already_paying":
      return "Robo is already taking that payment.";
    case "already_plus":
      return "You're already on Plus.";
    case "not_found":
      return "Robo lost that order. Start over.";
    case "unavailable":
    case "bad_secret":
      return "The test card isn't set up here. Use Whop checkout instead.";
    case "error":
      return "Whop didn't answer. Try again in a minute.";
  }
}

export function paymentErrorLine(error: string | null | undefined): string | null {
  if (!error) return null;
  const reason = error.replace(/^payment failed:?\s*/i, "").trim();
  return testPayMessage("declined", reason || undefined);
}

export type Refusal = "needs_source" | "private_life" | "tragedy" | "private_person" | "unreadable_link";

export function refusalMessage(refusal: Refusal | undefined): string | null {
  switch (refusal) {
    case "needs_source":
      return "That one needs a source. Paste a link to the article and Robo will draw it.";
    case "private_life":
      return "Robo skips stories about people's private lives. Try another topic.";
    case "tragedy":
      return "Robo skips stories about crime and tragedy. Try another topic.";
    case "private_person":
      return "Robo only draws public figures, not private people. Try another topic.";
    case "unreadable_link":
      return "Robo could not open that page. Type the headline instead.";
    default:
      return null;
  }
}

export const PAPER_NAME_MAX = 30;
export const PAPER_NICHE_MAX = 80;

export type PaperFailure = "bad_input" | "not_allowed" | "limit" | "spend_cap" | "unavailable";

export function parsePrice(text: string): number | null {
  const n = Number(text.replace(/^\$/, "").trim());
  return Number.isFinite(n) && n >= 1 && n <= 20 ? Math.round(n * 100) / 100 : null;
}

export function paperFailMessage(reason: PaperFailure): string {
  switch (reason) {
    case "bad_input":
      return `Give it a name (up to ${PAPER_NAME_MAX} characters), a niche (up to ${PAPER_NICHE_MAX}) and a price from $1 to $20.`;
    case "not_allowed":
      return "Robo keeps papers friendly and won't draw that niche. Try another.";
    case "limit":
      return "You already run two papers. That's plenty of crayons.";
    case "spend_cap":
      return "Robo is out of crayons for today. Try again tomorrow.";
    case "unavailable":
      return "Whop isn't answering right now. Try again in a minute.";
  }
}

export function isMilestone(comboDays: number): boolean {
  return Number.isInteger(comboDays) && comboDays >= COMBO_STEP && comboDays % COMBO_STEP === 0;
}

export function freezeDay(ended: { runEnd: string } | null, today: string): string | null {
  if (!ended || ended.runEnd !== addDays(today, -2)) return null;
  return addDays(today, -1);
}

export function formatPlusDate(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(ms));
}

export function rewardLine(periodEnd: number): string {
  return `Robo paid for a day. Plus now runs to ${formatPlusDate(periodEnd)}.`;
}
