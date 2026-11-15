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
      return "Paid. Robo is sharpening crayons.";
    case "drawing":
      return "Robo is drawing it now.";
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
      return "Robo keeps the paper friendly and won't draw that one. Try another topic.";
    case "spend_cap":
      return "Robo is out of crayons for today. Try again tomorrow.";
    case "bad_input":
      return "Type a topic (up to 140 characters) or paste a link Robo can read.";
    case "unavailable":
    case "error":
      return "Checkout isn't available right now. Try again in a minute.";
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
