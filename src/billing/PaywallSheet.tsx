import { useAction } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { PrimaryButton, PulsingDots } from "../components/ui";
import { Robo } from "../robo/Robo";
import { colors, type } from "../theme";
import { openCheckout, useBillingDevice, usePlus } from "./hooks";
import { formatPlusDate, startFailMessage } from "./logic";
import { BillingSheet, CrownIcon, QuietLink, SheetHeader } from "./Sheet";

const PERKS = ["Every back issue, not just today and yesterday", "Unlimited Draw a fresh one", "A weekly combo freeze: one missed day forgiven"];

function RoboWithCrown() {
  return (
    <View style={styles.robo}>
      <Robo pose="cheer" size={72} />
      <View style={styles.crown} pointerEvents="none">
        <CrownIcon size={30} />
      </View>
    </View>
  );
}

export function PaywallSheet({ visible, onClose, onOwnPaper }: { visible: boolean; onClose: () => void; onOwnPaper?: () => void }) {
  const deviceId = useBillingDevice();
  const status = usePlus();
  const start = useAction(api.billing.startPlusCheckout);
  const [phase, setPhase] = useState<"idle" | "starting" | "waiting">("idle");
  const [error, setError] = useState<string | null>(null);

  const getPlus = async () => {
    if (!deviceId || phase === "starting") return;
    setError(null);
    setPhase("starting");
    try {
      const res = await start({ deviceId });
      if (!res.ok) {
        setPhase("idle");
        if (res.reason !== "already_plus") setError(startFailMessage("unavailable"));
        return;
      }
      setPhase("waiting");
      await openCheckout(res.url);
    } catch {
      setPhase("idle");
      setError(startFailMessage("error"));
    }
  };

  const close = () => {
    if (phase === "starting") return;
    setPhase("idle");
    setError(null);
    onClose();
  };

  if (status.plus) {
    return (
      <BillingSheet visible={visible} onClose={close} testID="paywallSheet">
        <SheetHeader title="You're on Plus" line={status.plusUntil ? `Plus runs to ${formatPlusDate(status.plusUntil)}.` : undefined} art={<RoboWithCrown />} onClose={close} />
        {PERKS.map((p) => (
          <Text key={p} style={styles.perk}>
            ✓ {p}
          </Text>
        ))}
        <Text testID="freeDaysEarned" style={styles.earned}>
          Free days earned: {status.freeDaysEarned}
        </Text>
        <Text style={styles.note}>Every 7-day combo adds a free day to your membership. Robo pays for it.</Text>
      </BillingSheet>
    );
  }

  return (
    <BillingSheet visible={visible} onClose={close} testID="paywallSheet">
      <SheetHeader title="Doodle Daily Plus" line="Robo's fan club." art={<RoboWithCrown />} onClose={close} />
      {PERKS.map((p) => (
        <Text key={p} style={styles.perk}>
          ✓ {p}
        </Text>
      ))}
      <Text style={styles.combo}>Plus members earn a free day every 7-day combo.</Text>
      <Text style={styles.price}>$3 a month</Text>
      {phase === "waiting" ? (
        <View testID="plusWaiting" style={styles.waiting}>
          <PulsingDots color={colors.neon.volt} />
          <Text style={styles.note}>Waiting for Whop to confirm your payment. This sheet updates by itself.</Text>
        </View>
      ) : (
        <PrimaryButton testID="plusButton" label={phase === "starting" ? "Opening checkout" : "Get Plus"} onPress={() => void getPlus()} disabled={phase === "starting" || !deviceId} />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.fine}>Test mode: Whop sandbox, no real money.</Text>
      {onOwnPaper ? <QuietLink testID="ownPaperLink" label="Start your own paper" onPress={onOwnPaper} /> : null}
    </BillingSheet>
  );
}

const styles = StyleSheet.create({
  robo: { width: 76, alignItems: "center" },
  crown: { position: "absolute", top: -14 },
  perk: { ...type.body, color: colors.text.hi },
  combo: { ...type.body, fontSize: 15, color: colors.neon.volt },
  price: { ...type.displaySm, color: colors.text.hi, marginTop: 4 },
  waiting: { flexDirection: "row", gap: 10, alignItems: "center" },
  note: { ...type.body, fontSize: 15, color: colors.text.mid, flex: 1 },
  earned: { ...type.button, color: colors.neon.volt, marginTop: 6 },
  error: { ...type.body, fontSize: 15, color: colors.state.error },
  fine: { ...type.meta, color: colors.text.low, textAlign: "center" },
});
