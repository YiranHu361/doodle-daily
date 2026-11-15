const BANNED: RegExp[] = [
  /\b(dead|death|deaths|die|dies|died|dying|kill|kills|killed|killing|murder\w*|homicide|suicide\w*|fatal\w*|corpse|funeral|obituar\w*)\b/i,
  /\b(shooting|shot dead|gunman|gunfire|stabb\w*|assault\w*|attack(?:ed|er|ers)? (?:on|by) (?:a |an |the )?(?:man|woman|child|people|police|crowd)|violence|violent|massacre|hostage\w*|terror\w*|bomb\w*|explosion|riot\w*)\b/i,
  /\b(war|wars|warfare|airstrike\w*|missile\w*|invasion|troops|militar\w+|genocide|ceasefire)\b/i,
  /\b(earthquake|hurricane|tornado|wildfire|flood\w*|tsunami|disaster\w*|crash(?:ed)? (?:kills|landing)|plane crash|derail\w*|collapse(?:d)? (?:kills|building))\b/i,
  /\b(cancer|illness|disease\w*|virus|pandemic|epidemic|outbreak|overdose|hospitali[sz]ed|diagnos\w+|dementia|stroke|heart attack)\b/i,
  /\b(abus\w*|harass\w*|molest\w*|rape\w*|traffick\w*|grooming|exploitation)\b/i,
  /\b(sex|sexual\w*|porn\w*|nude\w*|naked|affair|affairs|cheating scandal|onlyfans|escort)\b/i,
  /\b(jail\w*|prison\w*|convict\w*|indict\w*|arrest\w*|sentenced|sentencing|charged (?:with|over|in|for)|pleads? guilty|guilty plea|manslaughter|fraud trial|smuggl\w*|spy|spies|spying|espionage)\b/i,
];

const SAFE_PHRASES: RegExp[] = [
  /\bkiller (feature|app|apps|deal|deals)\b/gi,
  /\b(stocks?|markets?|shares|prices?|crypto|bitcoin|sales) (crash\w*|plunge\w*|tank\w*|bleed\w*)\b/gi,
  /\bcyber ?attacks?\b/gi,
  /\bprice war\b/gi,
  /\bconsole war\b/gi,
  /\btalent war\b/gi,
  /\bstreaming wars?\b/gi,
  /\bdead ?line\w*\b/gi,
  /\bstar wars\b/gi,
];

export function isSafeStory(text: string): boolean {
  let cleaned = text;
  for (const re of SAFE_PHRASES) cleaned = cleaned.replace(re, " ");
  return !BANNED.some((re) => re.test(cleaned));
}
