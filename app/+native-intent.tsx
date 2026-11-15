import { flagsFromUrl } from "../src/data/flagsParse";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return flagsFromUrl(path) ? "/" : path;
  } catch {
    return "/";
  }
}
