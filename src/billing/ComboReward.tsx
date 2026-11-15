import { useAction, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { api } from "../../convex/_generated/api";
import { applyFreeze, useCombo } from "../streak";
import { colors, type } from "../theme";
import { useBillingDevice, usePlus } from "./hooks";
import { freezeDay, isMilestone, rewardLine } from "./logic";

const claimed = new Map<string, Promise<number | null>>();

export function ComboReward({ comboDays, day }: { comboDays: number; day: string }) {
  const deviceId = useBillingDevice();
  const { plus } = usePlus();
  const claim = useAction(api.billing.claimComboReward);
  const [periodEnd, setPeriodEnd] = useState<number | null>(null);

  useEffect(() => {
    if (!deviceId || !plus || !isMilestone(comboDays)) return;
    const key = `${deviceId}:${day}:${comboDays}`;
    if (!claimed.has(key)) {
      claimed.set(
        key,
        claim({ deviceId, comboDays }).then(
          (res) => (res.ok ? res.periodEnd : null),
          () => null,
        ),
      );
    }
    let live = true;
    void claimed.get(key)!.then((end) => live && setPeriodEnd(end));
    return () => {
      live = false;
    };
  }, [deviceId, plus, comboDays, day, claim]);

  if (periodEnd === null) return null;
  return (
    <Text testID="comboReward" style={styles.reward}>
      {rewardLine(periodEnd)}
    </Text>
  );
}

export function ComboFreeze() {
  const deviceId = useBillingDevice();
  const { plus, freezesLeftThisWeek } = usePlus();
  const combo = useCombo();
  const freeze = useMutation(api.billing.useFreeze);
  const day = combo.ready && !combo.todayCleared ? freezeDay(combo.ended, combo.today) : null;

  useEffect(() => {
    if (!deviceId || !plus || freezesLeftThisWeek < 1 || !day) return;
    void freeze({ deviceId, day }).then(
      (res) => {
        if (res.ok) applyFreeze(day);
      },
      () => undefined,
    );
  }, [deviceId, plus, freezesLeftThisWeek, day, freeze]);

  return null;
}

const styles = StyleSheet.create({
  reward: { ...type.body, fontSize: 16, color: colors.neon.volt, textAlign: "center", marginTop: 6 },
});
