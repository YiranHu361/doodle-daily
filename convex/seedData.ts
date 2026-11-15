import type { Section } from "./providers/types";

export type SeedStory = {
  section: Section;
  kind: "news" | "meme";
  headline: string;
  facts: string[];
  sourceName: string;
  sourceUrl: string;
};

const SAMPLE = "Doodle Daily sample desk";

export const TODAY_STORIES: SeedStory[] = [
  {
    section: "tech",
    kind: "news",
    headline: "Office robot vacuum maps every desk",
    facts: [
      "A sample office let its robot vacuum map the whole floor overnight.",
      "By morning it had drawn a perfect map and parked under the snack table.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/robot-vacuum-map",
  },
  {
    section: "money",
    kind: "news",
    headline: "Coffee prices tiptoe higher again",
    facts: [
      "Sample cafes raised the price of a small coffee by ten cents this week.",
      "Regulars kept ordering anyway and asked for bigger cups.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/coffee-prices",
  },
  {
    section: "culture",
    kind: "news",
    headline: "Town choir adds a kazoo section",
    facts: [
      "A sample town choir voted to add six kazoos to its winter concert.",
      "Tickets sold out within an hour of the announcement.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/kazoo-choir",
  },
  {
    section: "memes",
    kind: "meme",
    headline: "Everyone is rating their houseplants",
    facts: ["People online are giving their houseplants star ratings like hotel reviews."],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/houseplant-ratings",
  },
  {
    section: "tech",
    kind: "news",
    headline: "Phone update adds a nap button",
    facts: [
      "A sample phone update adds a button that silences everything for twenty minutes.",
      "Testers mostly pressed it during meetings.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/nap-button",
  },
  {
    section: "money",
    kind: "news",
    headline: "Piggy banks make a comeback",
    facts: [
      "Sample toy shops report that piggy bank sales doubled this autumn.",
      "Savers say shaking the jar is more fun than checking an app.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/piggy-banks",
  },
];

export const YESTERDAY_STORIES: SeedStory[] = [
  {
    section: "tech",
    kind: "news",
    headline: "Smart fridge learns to say no",
    facts: [
      "A sample smart fridge now locks the ice cream drawer after ten at night.",
      "Owners can override it by answering a riddle.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/smart-fridge",
  },
  {
    section: "money",
    kind: "news",
    headline: "Lemonade stand opens a second location",
    facts: [
      "A sample lemonade stand opened a second table across the street.",
      "The two stands now compete on ice cubes.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/lemonade-stand",
  },
  {
    section: "culture",
    kind: "news",
    headline: "Museum hangs a painting upside down",
    facts: [
      "A sample museum admitted a painting had hung upside down for a month.",
      "Visitors said they liked it better that way.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/upside-down-painting",
  },
  {
    section: "memes",
    kind: "meme",
    headline: "Cats versus cardboard boxes",
    facts: ["People online keep buying cat toys that lose to the box they came in."],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/cat-boxes",
  },
  {
    section: "tech",
    kind: "news",
    headline: "Keyboard ships with a snooze key",
    facts: [
      "A sample keyboard maker added a snooze key next to the space bar.",
      "Early reviews say it works too well.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/snooze-key",
  },
  {
    section: "culture",
    kind: "news",
    headline: "Library lends out umbrellas",
    facts: [
      "A sample library now lends umbrellas with the same card as books.",
      "Every umbrella came back on the first rainy day.",
    ],
    sourceName: SAMPLE,
    sourceUrl: "https://example.com/sample/library-umbrellas",
  },
];
