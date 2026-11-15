export const NEWSIE_NUMBER = "";
export const NEWSIE_JOIN_TEXT = "";

export function newsieSmsUrl(number: string = NEWSIE_NUMBER, joinText: string = NEWSIE_JOIN_TEXT): string | null {
  const digits = number.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(digits)) return null;
  return joinText ? `sms:${digits}&body=${encodeURIComponent(joinText)}` : `sms:${digits}`;
}
