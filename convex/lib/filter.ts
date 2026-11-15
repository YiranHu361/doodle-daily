export type Refusal = "tragedy" | "private_life" | "private_person" | "needs_source";

const TRAGEDY: RegExp[] = [
  /\b(dead|death|deaths|die|dies|died|dying|kill|kills|killed|killing|murder\w*|homicide|manslaughter|suicide\w*|fatal\w*|corpse|funeral|obituar\w*)\b/i,
  /\b(shooting|shot dead|gunman|gunfire|stabb\w*|assault\w*|attack(?:ed|er|ers)? (?:on|by) (?:a |an |the )?(?:man|woman|child|people|police|crowd)|violence|violent|massacre|hostage\w*|terror\w*|bomb\w*|explosion|riot\w*)\b/i,
  /\b(robber\w*|robbed|burglar\w*|kidnap\w*|abduct\w*|carjack\w*|mugg(?:ed|ing|er|ers)|arson\w*|shoplift\w*|pickpocket\w*|loot(?:ed|ing|ers)|vandal\w*|gang|gangs|stolen at gunpoint|street crime)\b/i,
  /\b(war|wars|warfare|airstrike\w*|missile\w*|invasion|troops|militar\w+|genocide|ceasefire)\b/i,
  /\b(earthquake|hurricane|tornado|wildfire|flood\w*|tsunami|disaster\w*|crash(?:ed)? (?:kills|landing)|plane crash|derail\w*|collapse(?:d)? (?:kills|building))\b/i,
  /\b(cancer|illness|disease\w*|virus|pandemic|epidemic|outbreak|overdose|hospitali[sz]ed|diagnos\w+|dementia|stroke|heart attack)\b/i,
  /\b(abus\w*|harass\w*|molest\w*|rape\w*|traffick\w*|grooming|exploitation)\b/i,
];

const PRIVATE_LIFE: RegExp[] = [
  /\b(sex|sexual\w*|porn\w*|nude\w*|naked|onlyfans|escort)\b/i,
  /\b(affair|affairs|mistress|cheat(?:s|ed|ing)? on|cheating scandal|love life|love child|romance|romantic|dating|divorc\w*|break-?up|pregnan\w*|custody|rehab|private life|personal life)\b/i,
  /\b(?:his|her|their|\w+['\u2019]s) (?:wife|wives|husband|spouse|girlfriend|boyfriend|ex(?!-)|kids|children|son|sons|daughter|daughters|family(?! of)|marriage|wedding)\b/i,
  /\b(?:his|her|their) (?:health|medical)\b|\bhealth (?:scare|problems?|issues?|condition)\b/i,
  /\brelationships? with (?:a |an |his |her |their )?(?:employee|subordinate|staffer|colleague|co-?worker|intern)s?\b/i,
];

const PRIVATE_PERSON: RegExp[] = [
  /\b(?:my|our|a|an|the|his|her|their) (?:neighbou?rs?|co-?workers?|classmates?|roommates?|flatmates?|landlord|landlady|tenant|ex|ex-(?:wife|husband|girlfriend|boyfriend|partner))\b/i,
  /\b(?:my|our) (?:boss|manager|teacher|friend|friends|cousin|uncle|aunt|brother|sister|mom|mum|dad|mother|father|wife|husband|girlfriend|boyfriend|partner)\b(?=.*\b(?:arrest\w*|charged|sued|fired|jail\w*|prison\w*|convict\w*|investigat\w*|scandal|cheat\w*|stole|lied|fraud)\b)/i,
  /\blocal (?:man|woman|men|women|teen|teens|teenager|resident|residents|couple|family|mom|dad|mother|father)\b/i,
  /\bprivate (?:citizen|citizens|individual|individuals|person)\b/i,
  /\b(?:man|woman|men|women|teen|teens|teenager|boy|girl|couple|mother|father|mom|dad|resident|driver|shopper|passenger)\s+(?:\w+\s+)?(?:arrest\w*|charged|sued|jailed|convicted|accused|indicted|sentenced|fined|fired)\b/i,
  /\ba (?:man|woman|teen|teenager|boy|girl|mother|father|mom|dad|couple|grandmother|grandfather) (?:from|in|who)\b/i,
];

const LEGAL =
  /\b(investigat\w*|probe|probes|probed|probing|lawsuits?|sued|sues|suing|charged|charges|indict\w*|arrest\w*|convict\w*|jail\w*|prison\w*|sentenced|sentencing|guilty|trial|fraud\w*|embezzl\w*|brib\w*|insider trading|smuggl\w*|spy|spies|spying|espionage|misconduct|scandal\w*|accus\w*|alleg\w*|fired|oust\w*|resign\w*|steps? down|stepped down)\b/i;

const PERSON_ROLE =
  /\b(ceo|cfo|coo|cto|chief executive|chief \w+ officer|founder|co-?founder|chair|chairman|chairwoman|chairperson|president|executive|exec|director|senator|governor|mayor|minister|congressman|congresswoman|lawmaker|politician|billionaire|celebrity|actor|actress|singer|rapper|athlete|influencer|he|she|him|her|his)\b/i;

const NOT_A_NAME = new Set(
  "the a an in on at as and but with after before new how why what when who is are to of for by from its it this that says will can could up down out over i my our we inc corp co ltd llc group labs bank motors technologies systems capital holdings media airlines pharma ai".split(" "),
);

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
  /\bdating apps?\b/gi,
];

function namesAPerson(text: string): boolean {
  if (PERSON_ROLE.test(text)) return true;
  let run = 0;
  for (const word of text.split(/[^A-Za-z'\u2019.-]+/)) {
    const plain = word.replace(/['\u2019]s$/, "").replace(/\.$/, "");
    const isName = /^[A-Z][a-z]+$/.test(plain) && !NOT_A_NAME.has(plain.toLowerCase()) && !LEGAL.test(plain);
    run = isName ? run + 1 : 0;
    if (run >= 2) return true;
  }
  return false;
}

export function isLegalStory(text: string): boolean {
  return LEGAL.test(text);
}

export function storyRefusal(text: string, opts: { sourced: boolean }): Refusal | null {
  let cleaned = text;
  for (const re of SAFE_PHRASES) cleaned = cleaned.replace(re, " ");
  if (TRAGEDY.some((re) => re.test(cleaned))) return "tragedy";
  if (PRIVATE_LIFE.some((re) => re.test(cleaned))) return "private_life";
  if (PRIVATE_PERSON.some((re) => re.test(cleaned))) return "private_person";
  if (!opts.sourced && LEGAL.test(cleaned) && namesAPerson(cleaned)) return "needs_source";
  return null;
}

export function isSafeStory(text: string): boolean {
  return storyRefusal(text, { sourced: true }) === null;
}
