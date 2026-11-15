import { ConvexReactClient } from "convex/react";

export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://resilient-ostrich-674.convex.cloud";

export const convex = new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false });
