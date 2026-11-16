import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useReducer, useState, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { useToast } from "../components/Toast";
import { PrimaryButton, PulsingDots } from "../components/ui";
import { CutBox } from "../components/shapes";
import { Robo } from "../robo/Robo";
import { colors, cut, type } from "../theme";
import { openCheckout, useBillingDevice, usePlus } from "./hooks";
import { commissionArgs, commissionLine, paymentErrorLine, refusalMessage, startFailMessage, TOPIC_MAX, type CommissionStatus } from "./logic";
import { PayButtons, useTestPay } from "./PayButtons";
import { ChatStep, DoneStep, LinkStep, SectionStep, StatusStep, WhoStep } from "./promote/Steps";
import { canGoBack, initialPromoState, promoReducer, stepLine, stepTitle } from "./promoteLogic";
import { BillingSheet, PencilIcon, QuietLink, SheetHeader, SmallButton } from "./Sheet";

const DONE: CommissionStatus[] = ["ready", "failed", "refunded"];

export function CommissionButton({ onPromoted }: { onPromoted: () => void }) {
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
        onPromoted={onPromoted}
      />
    </>
  );
}

type SheetProps = {
  deviceId: string;
  visible: boolean;
  commissionId: string | null;
  onStarted: (id: string) => void;
  onClose: () => void;
  onFinished: () => void;
};

function CommissionSheet(props: SheetProps & { onPromoted: () => void }) {
  const { deviceId, visible, onClose, onFinished, onPromoted } = props;
  const [state, dispatch] = useReducer(promoReducer, initialPromoState);
  const onPrivateDone = useCallback(() => {
    onFinished();
    dispatch({ type: "reset" });
  }, [onFinished]);
  const close = () => {
    if (state.step === "done") {
      dispatch({ type: "reset" });
      onPromoted();
    }
    onClose();
  };

  if (state.step === "me") {
    return (
      <PrivateCreate {...props} onFinished={onPrivateDone}>
        {props.commissionId ? null : <QuietLink testID="promoBack" label="Back" onPress={() => dispatch({ type: "back" })} />}
      </PrivateCreate>
    );
  }

  const step = { state, dispatch, deviceId };
  const drawing = state.step === "status";
  return (
    <BillingSheet visible={visible} onClose={close} testID="commissionSheet" stickToEnd={state.step === "chat"}>
      <SheetHeader title={stepTitle(state)} line={stepLine(state)} art={<Robo pose={drawing ? "drawing" : state.step === "done" ? "cheer" : "idle"} size={64} />} onClose={close} />
      {canGoBack(state) ? <QuietLink testID="promoBack" label="Back" onPress={() => dispatch({ type: "back" })} /> : null}
      {state.step === "who" ? <WhoStep dispatch={dispatch} /> : null}
      {state.step === "section" ? <SectionStep dispatch={dispatch} /> : null}
      {state.step === "chat" ? <ChatStep {...step} /> : null}
      {state.step === "link" ? <LinkStep {...step} /> : null}
      {state.step === "status" ? <StatusStep {...step} /> : null}
      {state.step === "done" ? <DoneStep state={state} onDone={close} /> : null}
    </BillingSheet>
  );
}

function PrivateCreate({ deviceId, visible, commissionId, onStarted, onClose, onFinished, children }: SheetProps & { children: ReactNode }) {
  const toast = useToast();
  const start = useAction(api.commissions.start);
  const testPay = useTestPay(deviceId);
  const { testCard } = usePlus();
  const mine = useQuery(api.commissions.mine, commissionId ? { deviceId } : "skip");
  const [text, setText] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = mine?.find((c) => c._id === commissionId);
  const status = (item?.status ?? (commissionId ? "awaiting_payment" : null)) as CommissionStatus | null;
  const payError = status === "awaiting_payment" ? (error ?? paymentErrorLine(item?.paymentError)) : null;

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

  const ensureCommission = async (): Promise<{ id: string; url: string | null } | null> => {
    if (commissionId) return { id: commissionId, url: checkoutUrl };
    const res = await start({ deviceId, ...commissionArgs(text) });
    if (!res.ok) {
      setError(res.message ?? refusalMessage(res.refusal) ?? startFailMessage(res.reason));
      return null;
    }
    onStarted(res.commissionId);
    setCheckoutUrl(res.url);
    return { id: res.commissionId, url: res.url };
  };

  const pay = async (how: "test" | "checkout") => {
    if (busy || (!commissionId && !text.trim())) return;
    setError(null);
    setBusy(true);
    try {
      const c = await ensureCommission();
      if (!c) return;
      if (how === "test") setError(await testPay(c.id));
      else if (c.url) await openCheckout(c.url);
      else setError(startFailMessage("unavailable"));
    } catch {
      setError(startFailMessage("error"));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setText("");
    setCheckoutUrl(null);
    setError(null);
    onFinished();
  };

  const buttons = (
    <PayButtons
      testID="commissionPay"
      testCard={testCard}
      price="$1"
      checkoutLabel="Pay $1 and draw it"
      busy={busy}
      disabled={!commissionId && !text.trim()}
      error={commissionId ? null : error}
      onTestPay={() => void pay("test")}
      onCheckout={() => void pay("checkout")}
    />
  );

  return (
    <BillingSheet visible={visible} onClose={onClose} testID="commissionSheet">
      <SheetHeader title="Create a comic" line="Robo draws anything, for $1." art={<Robo pose={status && !DONE.includes(status) ? "drawing" : "idle"} size={64} />} onClose={onClose} />
      {children}
      {status ? (
        <View style={styles.statusBox}>
          <CutBox cut={cut.card} fill={colors.surface[2]} stroke={payError || status === "failed" || status === "refunded" ? colors.state.error : colors.neon.volt} style={styles.status}>
            <View style={styles.statusRow}>
              {DONE.includes(status) || payError ? null : <PulsingDots color={colors.neon.volt} />}
              <Text testID="commissionStatus" style={styles.statusText} accessibilityLiveRegion="polite" numberOfLines={payError ? 2 : undefined}>
                {payError ?? (status === "awaiting_payment" && testCard ? "Paying through Whop sandbox" : commissionLine(status))}
              </Text>
            </View>
          </CutBox>
          {payError ? buttons : null}
          {status === "failed" || status === "refunded" || payError ? <QuietLink label="Start over" onPress={reset} /> : null}
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
          {buttons}
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
});
