import * as streakUi from "../streak/ui";

type CelebrationHooks = { notifyReaderClosed?: () => void; notifyBusy?: (busy: boolean) => void };

const hooks = streakUi as unknown as CelebrationHooks;

export function notifyReaderClosed(): void {
  hooks.notifyReaderClosed?.();
}

export function notifyBusy(busy: boolean): void {
  hooks.notifyBusy?.(busy);
}
