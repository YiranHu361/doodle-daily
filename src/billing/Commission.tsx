import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { useToast } from "../components/Toast";
import { PrimaryButton, PulsingDots } from "../components/ui";
import { CutBox } from "../components/shapes";
import { Robo } from "../robo/Robo";
import { colors, cut, type } from "../theme";
import { openCheckout, useBillingDevice } from "./hooks";
import { commissionArgs, commissionLine, startFailMessage, TOPIC_MAX, type CommissionStatus } from "./logic";
import { BillingSheet, PencilIcon, SheetHeader, SmallButton } from "./Sheet";

const DONE: CommissionStatus[] = ["ready", "failed", "refunded"];

export function CommissionButton() {
  const deviceId = useBillingDevice();
  const [open, setOpen] = useState(false);
  const [commissionId, setCommissionId] = useState<string | null>(null);
  if (!deviceId) return null;
  return (
    <>
      <SmallButton testID="commissionButton" label="Create" icon={<PencilIcon />} onPress={() => setOpen(true)} />
      <CommissionSheet
        deviceId={deviceId}
        visible={open}
        commissionId={commissionId}
        onStarted={setCommissionId}
        onClose={() => setOpen(false)}
        onFinished={() => setCommissionId(null)}
      />
    </>
  );
}

function CommissionSheet({
  deviceId,
  visible,
  commissionId,
  onStarted,
  onClose,
  onFinished,
}: {
  deviceId: string;
  visible: boolean;
  commissionId: string | null;
  onStarted: (id: string) => void;
  onClose: () => void;
  onFinished: () => void;
}) {
  const toast = useToast();
  const start = useAction(api.commissions.start);
  const mine = useQuery(api.commissions.mine, commissionId ? { deviceId } : "skip");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = (mine?.find((c) => c._id === commissionId)?.status ?? (commissionId ? "awaiting_payment" : null)) as CommissionStatus | null;

  useEffect(() => {
    if (status !== "ready") return;
    const t = setTimeout(() => {
      toast.show("Your comic is at the top of Today.");
      setText("");
      onFinished();
      onClose();
    }, 1500);
    return () => clearTimeout(t);
  }, [status, toast, onFinished, onClose]);

  const pay = async () => {
    if (busy || !text.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const res = await start({ deviceId, ...commissionArgs(text) });
      if (!res.ok) {
        setError(startFailMessage(res.reason));
        return;
      }
      onStarted(res.commissionId);
      await openCheckout(res.url);
    } catch {
      setError(startFailMessage("error"));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setText("");
    onFinished();
  };

  return (
    <BillingSheet visible={visible} onClose={onClose} testID="commissionSheet">
      <SheetHeader title="Create a comic" line="Robo draws anything, for $1." art={<Robo pose={status && !DONE.includes(status) ? "drawing" : "idle"} size={64} />} onClose={onClose} />
      {status ? (
        <View style={styles.statusBox}>
          <CutBox cut={cut.card} fill={colors.surface[2]} stroke={status === "failed" || status === "refunded" ? colors.state.error : colors.neon.volt} style={styles.status}>
            <View style={styles.statusRow}>
              {DONE.includes(status) ? null : <PulsingDots color={colors.neon.volt} />}
              <Text testID="commissionStatus" style={styles.statusText} accessibilityLiveRegion="polite">
                {commissionLine(status)}
              </Text>
            </View>
          </CutBox>
          {status === "failed" || status === "refunded" ? <PrimaryButton label="Try another" onPress={reset} /> : null}
        </View>
      ) : (
        <>
          <TextInput
            testID="commissionInput"
            value={text}
            onChangeText={setText}
            placeholder="Paste a link or type a topic"
            placeholderTextColor={colors.text.low}
            style={styles.input}
            maxLength={2000}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            accessibilityLabel="Paste a link or type a topic"
          />
          <Text style={styles.hint}>A topic up to {TOPIC_MAX} characters, like &quot;our seed round&quot;, or a link to an article.</Text>
          <PrimaryButton testID="commissionPay" label={busy ? "Opening checkout" : "Pay $1 and draw it"} onPress={() => void pay()} disabled={busy || !text.trim()} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.fine}>Test mode: Whop sandbox, no real money. Card 4242 4242 4242 4242.</Text>
        </>
      )}
    </BillingSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    ...type.body,
    color: colors.text.hi,
    backgroundColor: colors.surface[2],
    borderColor: colors.line.bright,
    borderWidth: 1,
    borderRadius: 4,
    minHeight: 88,
    padding: 12,
    textAlignVertical: "top",
  },
  hint: { ...type.meta, color: colors.text.mid },
  statusBox: { gap: 12 },
  status: { padding: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusText: { ...type.body, color: colors.text.hi, flex: 1 },
  error: { ...type.body, fontSize: 15, color: colors.state.error },
  fine: { ...type.meta, color: colors.text.low, textAlign: "center" },
});
