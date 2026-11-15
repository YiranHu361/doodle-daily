export const NEWSIE_NUMBER = "+1 (779) 625-1378";
export const NEWSIE_JOIN_TEXT = "K-VHD7EF";

export function newsieSmsUrl(number: string = NEWSIE_NUMBER, joinText: string = NEWSIE_JOIN_TEXT): string | null {
  const digits = number.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(digits)) return null;
  return joinText ? `sms:${digits}&body=${encodeURIComponent(joinText)}` : `sms:${digits}`;
}
