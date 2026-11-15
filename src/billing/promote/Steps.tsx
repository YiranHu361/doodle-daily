import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useState, type Dispatch } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { CutBox, CutButton } from "../../components/shapes";
import { useToast } from "../../components/Toast";
import { PrimaryButton, PulsingDots, SecondaryButton } from "../../components/ui";
import { useToday } from "../../data/hooks";
import { ShareHost, useShare } from "../../share/useShare";
import { colors, cut, sectionColor, type } from "../../theme";
import { copy } from "../../theme/copy";
import { openCheckout } from "../hooks";
import type { CommissionStatus } from "../logic";
import {
  canCheck,
  canPay,
  canSend,
  decodeCheck,
  decodeReply,
  decodeStart,
  doneLine,
  droppedClaims,
  LINK_MAX,
  MESSAGE_MAX,
  openingLine,
  payLabel,
  promoStatusLine,
  questionLine,
  replyMessages,
  SECTION_LINES,
  sectionName,
  SECTIONS,
  WHO_CHOICES,
  withTranscript,
  type Brief,
  type PromoAction,
  type PromoState,
} from "../promoteLogic";
import { QuietLink } from "../Sheet";
import { MicButton } from "./MicButton";

type StepProps = { state: PromoState; dispatch: Dispatch<PromoAction>; deviceId: string };

export function WhoStep({ dispatch }: { dispatch: Dispatch<PromoAction> }) {
  return (
    <View style={styles.choices}>
      {WHO_CHOICES.map((c) => (
        <CutButton
          key={c.who}
          testID={`promoPersona-${c.who}`}
          accessibilityLabel={`${c.title}. ${c.line}`}
          onPress={() => dispatch({ type: "who", who: c.who })}
          cut={cut.card}
          fill={colors.surface[2]}
          stroke={c.who === "me" ? colors.line.bright : colors.neon.volt}
          boxStyle={styles.choice}
        >
          <Text style={styles.choiceTitle}>{c.title}</Text>
          <Text style={styles.choiceLine}>{c.line}</Text>
        </CutButton>
      ))}
    </View>
  );
}

export function SectionStep({ dispatch }: { dispatch: Dispatch<PromoAction> }) {
  return (
    <View style={styles.choices}>
      {SECTIONS.map((s) => (
        <CutButton
          key={s}
          testID={`promoSection-${s}`}
          accessibilityLabel={`${sectionName(s)}. ${SECTION_LINES[s]}`}
          onPress={() => dispatch({ type: "section", section: s })}
          cut={cut.card}
          fill={colors.surface[2]}
          stroke={sectionColor[s]}
          boxStyle={styles.choice}
        >
          <Text style={[styles.choiceTitle, { color: sectionColor[s] }]}>{sectionName(s)}</Text>
          <Text style={styles.choiceLine}>{SECTION_LINES[s]}</Text>
        </CutButton>
      ))}
    </View>
  );
}

function Bubble({ role, text }: { role: "user" | "robo"; text: string }) {
  const robo = role === "robo";
  return (
    <View style={[styles.bubble, robo ? styles.roboBubble : styles.userBubble]} accessible accessibilityLabel={`${robo ? "Robo" : "You"}: ${text}`}>
      <Text style={robo ? styles.roboText : styles.userText}>{text}</Text>
    </View>
  );
}

export function BriefCard({ brief }: { brief: Brief }) {
  return (
    <CutBox testID="promoBrief" cut={cut.card} fill={colors.surface[2]} stroke={colors.neon.volt} style={styles.brief}>
      <Text style={styles.label}>BRIEF</Text>
      <Text style={styles.briefName}>{brief.name}</Text>
      <Text style={styles.body}>{brief.pitch}</Text>
      {brief.claims.length ? (
        <View style={styles.claims}>
          {brief.claims.map((c, i) => (
            <Text key={i} style={styles.claim}>
              {"\u2022 "}
              {c}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.cta}>{brief.cta}</Text>
    </CutBox>
  );
}

export function ChatStep({ state, dispatch, deviceId }: StepProps) {
  const reply = useAction(api.promote.reply);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const busy = state.pending !== null || listening;
  const send = async () => {
    if (!canSend(state, text) || listening || !state.persona || !state.section) return;
    const userText = text.trim();
    const messages = replyMessages([...state.messages, { role: "user", text: userText }]);
    dispatch({ type: "send", text: userText });
    setText("");
    try {
      const out = decodeReply(await reply({ deviceId, persona: state.persona, section: state.section, messages }));
      if (out.kind === "question") dispatch({ type: "question", text: out.text });
      else if (out.kind === "brief") dispatch({ type: "brief", brief: out.brief });
      else {
        dispatch({ type: "error", message: out.message });
        setText(userText);
      }
    } catch {
      dispatch({ type: "error", message: "Robo can't reach the desk right now. Try again in a minute." });
      setText(userText);
    }
  };
  const onText = useCallback((t: string) => setText((cur) => withTranscript(cur, t)), []);
  const onError = useCallback((message: string) => dispatch({ type: "error", message }), [dispatch]);
  const line = questionLine(state);
  return (
    <>
      <View style={styles.chat}>
        {state.persona ? <Bubble role="robo" text={openingLine(state.persona)} /> : null}
        {state.messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.isBrief ? "Here's the brief. Change anything by telling me." : m.text} />
        ))}
        {state.pending === "reply" ? (
          <View style={[styles.bubble, styles.roboBubble]} accessible accessibilityLabel="Robo is thinking">
            <PulsingDots color={colors.neon.cyan} />
          </View>
        ) : null}
      </View>
      {state.brief ? (
        <>
          <BriefCard brief={state.brief} />
          <PrimaryButton testID="promoBriefNext" label="Looks good, add the link" onPress={() => dispatch({ type: "toLink" })} disabled={busy} />
          <Text style={styles.hint}>Want a change? Tell Robo, like &quot;change the pitch to...&quot;</Text>
        </>
      ) : line ? (
        <Text style={styles.hint}>{line}</Text>
      ) : null}
      {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          testID="promoInput"
          value={text}
          onChangeText={setText}
          placeholder={listening ? "Robo is listening..." : state.brief ? "Ask for a change" : "Type, or tap the mic"}
          placeholderTextColor={colors.text.low}
          style={styles.chatInput}
          maxLength={MESSAGE_MAX}
          multiline
          editable={!listening}
          accessibilityLabel="Message to Robo"
        />
        <MicButton deviceId={deviceId} disabled={busy} onBusy={setListening} onText={onText} onError={onError} />
        <CutButton
          testID="promoSend"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend(state, text) || listening }}
          disabled={!canSend(state, text) || listening}
          onPress={() => void send()}
          cut={cut.button}
          fill={canSend(state, text) && !listening ? colors.neon.volt : colors.surface[2]}
          stroke={colors.line.bright}
          boxStyle={styles.send}
        >
          <Text style={[styles.sendText, { color: canSend(state, text) && !listening ? colors.text.onNeon : colors.text.low }]}>Send</Text>
        </CutButton>
      </View>
    </>
  );
}

export function LinkStep({ state, dispatch, deviceId }: StepProps) {
  const check = useAction(api.promote.check);
  const start = useAction(api.promote.start);
  const brief = state.brief;
  if (!brief || !state.section || !state.persona) return null;
  const section = state.section;
  const persona = state.persona;

  const runCheck = async () => {
    if (!canCheck(state)) return;
    dispatch({ type: "pending", pending: "check" });
    try {
      const out = decodeCheck(await check({ deviceId, link: state.link.trim(), brief }));
      dispatch(out.kind === "checked" ? { type: "checked", check: out.check } : { type: "error", message: out.message });
    } catch {
      dispatch({ type: "error", message: "Robo can't reach that page right now. Try again in a minute." });
    }
  };

  const pay = async () => {
    if (!canPay(state)) return;
    dispatch({ type: "pending", pending: "start" });
    try {
      const out = decodeStart(
        await start({ deviceId, persona, section, brief, link: state.link.trim(), ...(state.unchecked ? { unchecked: true } : {}) }),
      );
      if (out.kind === "error") return dispatch({ type: "error", message: out.message });
      dispatch({ type: "started", commissionId: out.commissionId });
      await openCheckout(out.url);
    } catch {
      dispatch({ type: "error", message: "Checkout isn't available right now. Try again in a minute." });
    }
  };

  const result = state.check;
  const crossed = droppedClaims(result);
  return (
    <>
      <Text style={styles.hint}>A page that shows what {brief.name} says: your site, a store page, a launch post.</Text>
      <TextInput
        testID="promoLink"
        value={state.link}
        onChangeText={(link) => dispatch({ type: "link", link })}
        placeholder="https://"
        placeholderTextColor={colors.text.low}
        style={styles.linkInput}
        maxLength={LINK_MAX}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={() => void runCheck()}
        editable={state.pending === null}
        accessibilityLabel="Link that backs it up"
      />
      {!result ? (
        <PrimaryButton
          testID="promoCheck"
          label={state.pending === "check" ? "Robo is reading the page" : "Check the claims"}
          onPress={() => void runCheck()}
          disabled={!canCheck(state)}
        >
          {state.pending === "check" ? <PulsingDots /> : null}
        </PrimaryButton>
      ) : result.readable ? (
        <CutBox testID="promoBrief" cut={cut.card} fill={colors.surface[2]} stroke={colors.neon.volt} style={styles.brief}>
          <Text style={styles.label}>CHECKED AGAINST {result.site.toUpperCase()}</Text>
          <Text style={styles.briefName}>{brief.name}</Text>
          <Text style={styles.body}>{brief.pitch}</Text>
          <View style={styles.claims}>
            {result.claims.map((c, i) => (
              <View key={i} style={styles.checkRow} accessible accessibilityLabel={`${c.text}: ${c.backed ? "the page says so" : "the page does not say so, left out"}`}>
                <Text style={[styles.mark, { color: c.backed ? colors.neon.lime : colors.state.error }]}>{c.backed ? "\u2713" : "\u2717"}</Text>
                <Text style={[styles.claim, styles.flex, c.backed ? null : styles.crossed]}>{c.text}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.cta}>{brief.cta}</Text>
          {crossed ? <Text style={styles.hint}>Crossed claims are not on the page, so Robo leaves them out of the comic.</Text> : null}
        </CutBox>
      ) : (
        <CutBox cut={cut.card} fill={colors.surface[2]} stroke={colors.stamp} style={styles.brief}>
          <Text style={styles.body}>Robo could not read that page{result.site ? ` on ${result.site}` : ""}.</Text>
          {state.unchecked ? (
            <Text style={styles.hint}>Your comic will be marked &quot;Claims not checked&quot;.</Text>
          ) : (
            <>
              <SecondaryButton testID="promoTryAnother" label="Try another link" onPress={() => dispatch({ type: "tryAnotherLink" })} />
              <SecondaryButton testID="promoUnchecked" label="Continue, claims not checked" onPress={() => dispatch({ type: "continueUnchecked" })} />
            </>
          )}
        </CutBox>
      )}
      {canPay(state) || state.pending === "start" ? (
        <PrimaryButton testID="promoPay" label={payLabel(section, state.pending === "start")} onPress={() => void pay()} disabled={!canPay(state)} />
      ) : null}
      {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      {result ? <Text style={styles.fine}>Test mode: Whop sandbox, no real money. Card 4242 4242 4242 4242.</Text> : null}
    </>
  );
}

export function StatusStep({ state, dispatch, deviceId }: StepProps) {
  const mine = useQuery(api.commissions.mine, state.commissionId ? { deviceId } : "skip");
  const item = mine?.find((c) => c._id === state.commissionId);
  const status = (item?.status ?? "awaiting_payment") as CommissionStatus;
  const comicId = (item as { comicId?: string } | undefined)?.comicId ?? null;
  useEffect(() => {
    if (status === "ready") dispatch({ type: "ready", comicId });
  }, [status, comicId, dispatch]);
  if (!state.section) return null;
  const failed = status === "failed" || status === "refunded";
  return (
    <View style={styles.statusBox}>
      <CutBox cut={cut.card} fill={colors.surface[2]} stroke={failed ? colors.state.error : colors.neon.volt} style={styles.status}>
        <View style={styles.statusRow}>
          {failed ? null : <PulsingDots color={colors.neon.volt} />}
          <Text testID="promoStatus" style={[styles.body, styles.flex]} accessibilityLiveRegion="polite">
            {promoStatusLine(status, state.section)}
          </Text>
        </View>
      </CutBox>
      {failed ? <PrimaryButton label="Try again" onPress={() => dispatch({ type: "reset" })} /> : null}
      {status === "awaiting_payment" ? <QuietLink testID="promoStartOver" label="Start over" onPress={() => dispatch({ type: "reset" })} /> : null}
    </View>
  );
}

export function DoneStep({ state, onDone }: { state: PromoState; onDone: () => void }) {
  const toast = useToast();
  const today = useToday();
  const comic = today.kind === "ready" ? today.data.comics.find((c) => c._id === state.comicId) : undefined;
  const onShareError = useCallback(() => toast.show(copy.shareFailed), [toast]);
  const share = useShare(onShareError);
  if (!state.section) return null;
  return (
    <View style={styles.statusBox}>
      {comic ? <ShareHost comic={comic} active={share.sharing} onReady={share.onReady} /> : null}
      <CutBox cut={cut.card} fill={colors.surface[2]} stroke={colors.neon.lime} style={styles.status}>
        <Text testID="promoDone" style={styles.briefName} accessibilityLiveRegion="polite">
          {doneLine(state.section)}
        </Text>
        <Text style={styles.hint}>Second in today&apos;s paper, for every reader.</Text>
      </CutBox>
      <PrimaryButton testID="promoShare" label={comic ? "Share" : "Getting your comic"} onPress={share.share} disabled={!comic || share.sharing} />
      <QuietLink testID="promoClose" label="Done" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  choices: { gap: 10 },
  choice: { padding: 16, gap: 4, minHeight: 72, alignItems: "flex-start" },
  choiceTitle: { ...type.title, fontSize: 20, color: colors.text.hi },
  choiceLine: { ...type.body, fontSize: 15, color: colors.text.mid },
  chat: { gap: 8 },
  bubble: { maxWidth: "85%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 6 },
  roboBubble: { alignSelf: "flex-start", backgroundColor: colors.surface[2], borderColor: colors.neon.cyan, borderWidth: 1 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.neon.volt },
  roboText: { ...type.body, fontSize: 16, color: colors.text.hi },
  userText: { ...type.body, fontSize: 16, color: colors.text.onNeon },
  brief: { padding: 16, gap: 8 },
  label: { fontFamily: type.chip.fontFamily, fontSize: 12, letterSpacing: 1, color: colors.neon.volt },
  briefName: { ...type.title, fontSize: 20, color: colors.text.hi },
  body: { ...type.body, fontSize: 16, color: colors.text.hi },
  claims: { gap: 4 },
  claim: { ...type.body, fontSize: 15, color: colors.text.mid },
  checkRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  mark: { ...type.button, width: 18 },
  crossed: { textDecorationLine: "line-through", color: colors.text.low },
  cta: { ...type.button, color: colors.neon.volt },
  hint: { ...type.meta, color: colors.text.mid },
  error: { ...type.body, fontSize: 15, color: colors.state.error },
  fine: { ...type.meta, color: colors.text.low, textAlign: "center" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  chatInput: {
    ...type.body,
    flex: 1,
    color: colors.text.hi,
    backgroundColor: colors.surface[2],
    borderColor: colors.line.bright,
    borderWidth: 1,
    borderRadius: 4,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  linkInput: {
    ...type.body,
    color: colors.text.hi,
    backgroundColor: colors.surface[2],
    borderColor: colors.line.bright,
    borderWidth: 1,
    borderRadius: 4,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  send: { height: 48, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  sendText: { ...type.button },
  statusBox: { gap: 12 },
  status: { padding: 16, gap: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
