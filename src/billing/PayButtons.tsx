import { useAction } from "convex/react";
import { useCallback } from "react";
import { StyleSheet, Text } from "react-native";
import { api } from "../../convex/_generated/api";
import { PrimaryButton, PulsingDots } from "../components/ui";
import { colors, type } from "../theme";
import { testPayMessage } from "./logic";
import { QuietLink } from "./Sheet";

export const TEST_CARD_FINE_PRINT = "Whop sandbox: a saved test card is charged, no real money.";

export function useTestPay(deviceId: string | null) {
  const payTest = useAction(api.billing.payTest);
  return useCallback(
    async (commissionId: string): Promise<string | null> => {
      if (!deviceId) return testPayMessage("unavailable");
      try {
        const res = await payTest({ deviceId, secret: process.env.EXPO_PUBLIC_DEMO_SECRET ?? "", commissionId });
        return res.ok ? null : testPayMessage(res.reason, res.message);
      } catch {
        return testPayMessage("error");
      }
    },
    [deviceId, payTest],
  );
}

type Props = {
  testID: string;
  testCard: boolean;
  price: string;
  checkoutLabel: string;
  busy: boolean;
  disabled?: boolean;
  error: string | null;
  checkoutFinePrint?: string;
  onTestPay: () => void;
  onCheckout: () => void;
};

export function PayButtons({ testID, testCard, price, checkoutLabel, busy, disabled, error, checkoutFinePrint, onTestPay, onCheckout }: Props) {
  if (!testCard) {
    return (
      <>
        <PrimaryButton testID={testID} label={busy ? "Opening checkout" : checkoutLabel} onPress={onCheckout} disabled={busy || disabled} />
        {error ? <Text style={styles.error} numberOfLines={2}>{error}</Text> : null}
        <Text style={styles.fine}>{checkoutFinePrint ?? "Test mode: Whop sandbox, no real money. Card 4242 4242 4242 4242."}</Text>
      </>
    );
  }
  return (
    <>
      <PrimaryButton testID={testID} label={busy ? "Paying through Whop sandbox" : `Pay ${price} with test card`} onPress={onTestPay} disabled={busy || disabled}>
        {busy ? <PulsingDots /> : null}
      </PrimaryButton>
      {error ? <Text testID={`${testID}Error`} style={styles.error} numberOfLines={2}>{error}</Text> : null}
      {busy ? null : <QuietLink testID={`${testID}Checkout`} label="Open Whop checkout instead" onPress={onCheckout} />}
      <Text style={styles.fine}>{TEST_CARD_FINE_PRINT}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  error: { ...type.body, fontSize: 15, color: colors.state.error },
  fine: { ...type.meta, color: colors.text.low, textAlign: "center" },
});
