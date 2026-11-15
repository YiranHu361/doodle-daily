export const colors = {
  bg: { void: "#07051A", night: "#100B2E", grid: "#1A1446" },
  surface: { 1: "#1A1446", 2: "#261E63", 3: "#352A85" },
  line: { dim: "#4A3FA8", bright: "#6E63D9" },
  text: { hi: "#F5F2FF", mid: "#BDB6EC", low: "#9A92D6", onNeon: "#140F33" },
  neon: { volt: "#FFE83D", cyan: "#2DE2FF", lime: "#7CFF6B", pink: "#FF4FB8", violet: "#A98BFF" },
  state: { error: "#FF5C7A" },
  paper: "#FBF7EC",
  ink: "#1B1736",
  stamp: "#C2185B",
  robo: { body: "#3D8BFF", shade: "#2A63D6", screen: "#0B0820", eyes: "#2DE2FF" },
  heat: { none: "#261E63", noneBorder: "#4A3FA8", one: "#C4AF47", few: "#E6D141", many: "#FFE83D" },
} as const;

export type SectionKey = "tech" | "money" | "culture" | "memes";

export const sectionColor: Record<SectionKey | "all", string> = {
  all: colors.neon.volt,
  tech: colors.neon.cyan,
  money: colors.neon.lime,
  culture: colors.neon.pink,
  memes: colors.neon.violet,
};

export const sectionLabel: Record<SectionKey, string> = {
  tech: "Tech",
  money: "Money",
  culture: "Culture",
  memes: "Memes",
};

export const fonts = {
  display: "Bungee_400Regular",
  ui: "ChakraPetch_400Regular",
  uiMedium: "ChakraPetch_500Medium",
  uiSemiBold: "ChakraPetch_600SemiBold",
  caption: "BalsamiqSans_400Regular",
} as const;

export const type = {
  displaySm: { fontFamily: fonts.display, fontSize: 22 },
  displayMd: { fontFamily: fonts.display, fontSize: 32 },
  displayLg: { fontFamily: fonts.display, fontSize: 48 },
  displayXl: { fontFamily: fonts.display, fontSize: 64 },
  title: { fontFamily: fonts.uiSemiBold, fontSize: 24 },
  body: { fontFamily: fonts.ui, fontSize: 17 },
  button: { fontFamily: fonts.uiSemiBold, fontSize: 17 },
  chip: { fontFamily: fonts.uiMedium, fontSize: 15 },
  meta: { fontFamily: fonts.ui, fontSize: 13 },
  caption: { fontFamily: fonts.caption, fontSize: 18 },
} as const;

export const space = { margin: 16, gap: 16, touch: 44 } as const;

export const cut = { chip: 6, button: 10, card: 14 } as const;

export const glow = { stroke: 1.5, blur: 8, opacity: 0.45 } as const;

export const springs = {
  bouncy: { damping: 12, stiffness: 180 },
  snappy: { damping: 18, stiffness: 260 },
  fadeMs: 200,
} as const;
