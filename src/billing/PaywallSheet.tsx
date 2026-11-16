import { useAction } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { PulsingDots } from "../components/ui";
import { Robo } from "../robo/Robo";
import { colors, type } from "../theme";
import { openCheckout, useBillingDevice, usePlus } from "./hooks";
import { formatPlusDate, startFailMessage, testPayMessage } from "./logic";
import { PayButtons } from "./PayButtons";
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
  const payTestPlus = useAction(api.billing.payTestPlus);
  const [phase, setPhase] = useState<"idle" | "starting" | "paying" | "waiting">("idle");
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

  const testPlus = async () => {
    if (!deviceId || phase === "starting" || phase === "paying") return;
    setError(null);
    setPhase("paying");
    try {
      const res = await payTestPlus({ deviceId, secret: process.env.EXPO_PUBLIC_DEMO_SECRET ?? "" });
      if (!res.ok) {
        setPhase("idle");
        setError(testPayMessage(res.reason, res.message));
      }
    } catch {
      setPhase("idle");
      setError(testPayMessage("error"));
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
      {phase === "waiting" || phase === "paying" ? (
        <>
          <View testID="plusWaiting" style={styles.waiting}>
            <PulsingDots color={colors.neon.volt} />
            <Text style={styles.note}>{phase === "paying" ? "Paying through Whop sandbox" : "Waiting for Whop to confirm your payment. This sheet updates by itself."}</Text>
          </View>
          {phase === "paying" ? <QuietLink testID="plusButtonCheckout" label="Open Whop checkout instead" onPress={() => void getPlus()} /> : null}
        </>
      ) : (
        <PayButtons
          testID="plusButton"
          testCard={status.testCard}
          price="$3"
          checkoutLabel="Get Plus"
          busy={phase === "starting"}
          disabled={!deviceId}
          error={error}
          checkoutFinePrint="Test mode: Whop sandbox, no real money."
          onTestPay={() => void testPlus()}
          onCheckout={() => void getPlus()}
        />
      )}
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
});
