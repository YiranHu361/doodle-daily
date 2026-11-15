import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { Share, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PanelImage } from "../components/PanelImage";
import { CutBox } from "../components/shapes";
import { PrimaryButton, SecondaryButton } from "../components/ui";
import { Robo } from "../robo/Robo";
import { colors, cut, type } from "../theme";
import { openCheckout, useBillingDevice } from "./hooks";
import { paperFailMessage, parsePrice, PAPER_NAME_MAX, PAPER_NICHE_MAX } from "./logic";
import { BillingSheet, SheetHeader } from "./Sheet";

export const WHOP_LINE = "Whop handles checkout, members and payouts; new Whop products come with a 30% affiliate programme.";

type Live = { name: string; purchaseUrl: string };

export function PapersShelf({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const deviceId = useBillingDevice();
  const papers = useQuery(api.papers.list, deviceId && visible ? { deviceId } : "skip");
  const subscribe = useAction(api.papers.startCheckout);
  const [mode, setMode] = useState<"shelf" | "form">("shelf");
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setMode("shelf");
    setLive(null);
    setError(null);
    onClose();
  };

  const onSubscribe = async (paperId: Id<"papers">) => {
    if (!deviceId) return;
    setError(null);
    const res = await subscribe({ deviceId, paperId }).catch(() => null);
    if (!res?.ok) {
      setError(paperFailMessage("unavailable"));
      return;
    }
    await openCheckout(res.url);
  };

  return (
    <BillingSheet visible={visible} onClose={close} testID="papersShelf">
      <SheetHeader title={live ? "Your paper is live" : mode === "form" ? "Start your own paper" : "Papers"} line={mode === "shelf" && !live ? "Daily comics about anything. Robo draws them all." : undefined} art={<Robo pose={live ? "cheer" : "idle"} size={56} />} onClose={close} />
      {live ? (
        <LiveCard live={live} onDone={() => setLive(null)} />
      ) : mode === "form" ? (
        <PaperForm
          deviceId={deviceId}
          onCreated={(p) => {
            setMode("shelf");
            setLive(p);
          }}
          onCancel={() => setMode("shelf")}
        />
      ) : (
        <>
          <CutBox testID="paperCard_doodleDaily" cut={cut.card} fill={colors.surface[2]} stroke={colors.neon.volt} style={styles.card}>
            <Text style={styles.name}>Doodle Daily</Text>
            <Text style={styles.niche}>Tech, money, culture and memes, every morning.</Text>
            <Text style={styles.price}>{"Free. You're reading it."}</Text>
          </CutBox>
          {(papers ?? []).map((p, i) => (
            <CutBox key={p._id} testID={`paperCard_${i}`} cut={cut.card} fill={colors.surface[2]} stroke={colors.line.bright} style={styles.card}>
              <View style={styles.row}>
                <PanelImage uri={p.sample.firstPanelUrl} size={84} label={p.sample.title ?? `Sample comic for ${p.name}`} placeholderLabel={p.sample.status === "failed" ? "No sample yet" : "Robo is drawing the sample"} />
                <View style={styles.text}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.niche}>{p.niche}</Text>
                  <Text style={styles.meta}>
                    ${p.priceUsd.toFixed(2)} a month · {p.subscribers} {p.subscribers === 1 ? "member" : "members"}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>One sample comic so far. Daily issues start tomorrow.</Text>
              {p.locked ? (
                <PrimaryButton testID={`paperSubscribe_${i}`} label={`Subscribe for $${p.priceUsd.toFixed(2)}`} onPress={() => void onSubscribe(p._id)} />
              ) : (
                <Text style={styles.subscribed}>Subscribed</Text>
              )}
              {p.mine ? <SecondaryButton label="Share checkout link" onPress={() => void Share.share({ message: p.purchaseUrl })} /> : null}
            </CutBox>
          ))}
          <CutBox cut={cut.card} fill={colors.surface[1]} stroke={colors.neon.cyan} dashed style={styles.card}>
            <Text style={styles.name}>Start your own paper</Text>
            <Text style={styles.niche}>Pick a niche and a price. We create the Whop product and monthly plan, Robo draws a sample.</Text>
            <PrimaryButton testID="startPaperButton" label="Start your own paper" onPress={() => setMode("form")} />
          </CutBox>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
    </BillingSheet>
  );
}

function LiveCard({ live, onDone }: { live: Live; onDone: () => void }) {
  return (
    <View style={styles.form} testID="paperLive">
      <Text style={styles.name}>{live.name}</Text>
      <Text selectable testID="paperCheckoutUrl" style={styles.url}>
        {live.purchaseUrl}
      </Text>
      <PrimaryButton testID="paperShare" label="Copy or share the checkout link" onPress={() => void Share.share({ message: live.purchaseUrl })} />
      <Text style={styles.niche}>{WHOP_LINE}</Text>
      <Text style={styles.meta}>Robo is drawing one sample comic now. Daily issues start tomorrow.</Text>
      <SecondaryButton label="Back to the shelf" onPress={onDone} />
    </View>
  );
}

function PaperForm({ deviceId, onCreated, onCancel }: { deviceId: string | null; onCreated: (p: Live) => void; onCancel: () => void }) {
  const create = useAction(api.papers.create);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [price, setPrice] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const priceUsd = parsePrice(price);
    if (!deviceId || busy) return;
    if (!name.trim() || !niche.trim() || priceUsd === null) {
      setError(paperFailMessage("bad_input"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await create({ deviceId, name, niche, priceUsd });
      if (res.ok) onCreated({ name: name.trim(), purchaseUrl: res.purchaseUrl });
      else setError(paperFailMessage(res.reason));
    } catch {
      setError(paperFailMessage("unavailable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Name</Text>
      <TextInput testID="paperName" value={name} onChangeText={setName} maxLength={PAPER_NAME_MAX} placeholder="Founder Daily" placeholderTextColor={colors.text.low} style={styles.input} />
      <Text style={styles.label}>Niche</Text>
      <TextInput testID="paperNiche" value={niche} onChangeText={setNiche} maxLength={PAPER_NICHE_MAX} placeholder="startup and YC news" placeholderTextColor={colors.text.low} style={styles.input} />
      <Text style={styles.label}>Price a month (USD, 1 to 20)</Text>
      <TextInput testID="paperPrice" value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={styles.input} />
      <PrimaryButton testID="paperCreate" label={busy ? "Creating on Whop" : "Create my paper"} onPress={() => void submit()} disabled={busy} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <SecondaryButton label="Back" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 8 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  text: { flex: 1, gap: 2 },
  name: { ...type.button, fontSize: 19, color: colors.text.hi },
  niche: { ...type.body, fontSize: 15, color: colors.text.mid },
  price: { ...type.meta, color: colors.neon.volt },
  meta: { ...type.meta, color: colors.text.low },
  subscribed: { ...type.button, color: colors.neon.lime },
  form: { gap: 10 },
  label: { ...type.meta, color: colors.text.mid },
  input: { ...type.body, color: colors.text.hi, backgroundColor: colors.surface[2], borderColor: colors.line.bright, borderWidth: 1, borderRadius: 4, padding: 12 },
  url: { ...type.meta, fontSize: 14, color: colors.neon.cyan },
  error: { ...type.body, fontSize: 15, color: colors.state.error },
});
