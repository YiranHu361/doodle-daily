/// <reference types="vite/client" />
import { expect, test } from "vitest";

const PUBLIC_ALLOW_LIST = [
  "billing:claimComboReward",
  "billing:startPlusCheckout",
  "billing:status",
  "billing:useFreeze",
  "commissions:mine",
  "commissions:start",
  "editions:byDate",
  "editions:list",
  "editions:today",
  "papers:create",
  "papers:list",
  "papers:startCheckout",
  "pipeline:drawFreshOne",
  "promote:audioUploadUrl",
  "promote:check",
  "promote:reply",
  "promote:start",
  "promote:transcribe",
  "reactions:counts",
  "reactions:toggle",
  "voice:ensure",
  "voice:forComic",
];

type Registered = { isPublic?: boolean; isInternal?: boolean; isQuery?: boolean; isMutation?: boolean; isAction?: boolean };

test("only allow-listed functions are public, and each has args and returns validators", async () => {
  const modules = import.meta.glob<Record<string, unknown>>(
    ["./**/*.ts", "!./**/*.test.ts", "!./test.setup.ts", "!./_generated/**"],
    { eager: true },
  );
  const found: string[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const name = path.replace(/^\.\//, "").replace(/\.ts$/, "");
    for (const [exportName, value] of Object.entries(mod)) {
      const fn = value as Registered & { exportArgs?: () => string; exportReturns?: () => string };
      if (typeof value !== "function" && typeof value !== "object") continue;
      if (!fn || !(fn.isQuery || fn.isMutation || fn.isAction)) continue;
      if (!fn.isPublic) continue;
      const id = `${name}:${exportName}`;
      found.push(id);
      expect(JSON.parse(fn.exportArgs!()).type, `${id} args`).toBe("object");
      expect(JSON.parse(fn.exportReturns!()), `${id} returns`).not.toBeNull();
    }
  }
  expect(found.sort()).toEqual(PUBLIC_ALLOW_LIST);
});
