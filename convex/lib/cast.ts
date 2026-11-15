export const CAST = [
  { name: "Boss Blob", description: "round purple blob with a tiny red tie", plays: "any CEO or executive" },
  { name: "Coin", description: "yellow coin with a face, thin legs, red sneakers", plays: "markets, money, investors" },
  { name: "Robo", description: "boxy blue robot, one antenna with a yellow ball, three chest lights", plays: "AI and tech products" },
  { name: "Newsie", description: "small orange bird wearing a folded paper hat", plays: "the narrator, reacts to everything" },
  { name: "The Crowd", description: "three small green blobs, always together", plays: "the public, users, the internet" },
] as const;

export type CastName = (typeof CAST)[number]["name"];

export const CAST_NAMES: readonly CastName[] = CAST.map((c) => c.name);

export function isCastName(name: string): name is CastName {
  return (CAST_NAMES as readonly string[]).includes(name);
}
