import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { ChipRow } from "../src/components/ChipRow";
import { ComicCard, DrawingCard } from "../src/components/ComicCard";
import { Dock, DOCK_HEIGHT, type DockHandle } from "../src/components/Dock";
import { GridBackground } from "../src/components/GridBackground";
import { CutBox } from "../src/components/shapes";
import { SkeletonList } from "../src/components/Skeleton";
import { EmptyState, ErrorBoundary, ErrorState } from "../src/components/States";
import { useToast } from "../src/components/Toast";
import { useReducedMotion } from "../src/components/a11y";
import { Banner, SecondaryButton } from "../src/components/ui";
import { ComboFreeze, PapersShelf, PaywallSheet, usePlus } from "../src/billing";
import { now, formatIssueDate, pacificDate } from "../src/data/clock";
import { restartColdStartWindow } from "../src/data/connectionHooks";
import { drawMessage, type DrawFailure } from "../src/data/drawFlow";
import { filterComics, orderForToday, stillDrawing, type Chip } from "../src/data/filter";
import { useDrawFresh, useToday } from "../src/data/hooks";
import type { Comic, Edition } from "../src/data/types";
import { Robo } from "../src/robo/Robo";
import { isRead, useCombo } from "../src/streak";
import { ComboPill, ComboSheet } from "../src/streak/ui";
import { colors, cut, space, type } from "../src/theme";
import { copy } from "../src/theme/copy";

function Masthead({ edition, onCombo, onPlus }: { edition: Edition | null; onCombo: () => void; onPlus: () => void }) {
  const { plus } = usePlus();
  return (
    <View style={styles.masthead}>
      <View style={styles.mastLeft}>
        <Text style={styles.date}>{edition ? formatIssueDate(edition.date) : " "}</Text>
        <View style={styles.tags}>
          {edition ? (
            <CutBox cut={cut.chip} fill={colors.surface[2]} style={styles.issueTag}>
              <Text style={styles.issue} maxFontSizeMultiplier={1.3}>
                {copy.issueTag(edition.number)}
              </Text>
            </CutBox>
          ) : null}
          {plus ? (
            <Pressable testID="plusTag" accessibilityRole="button" accessibilityLabel="Plus membership" onPress={onPlus} hitSlop={8}>
              <CutBox cut={cut.chip} stroke={colors.neon.volt} strokeWidth={1} style={styles.issueTag}>
                <Text style={styles.issue}>PLUS</Text>
              </CutBox>
            </Pressable>
          ) : null}
        </View>
        <View accessible accessibilityRole="header" accessibilityLabel="Doodle Daily" testID="wordmark">
          <Text style={styles.doodle} maxFontSizeMultiplier={1.2}>
            DOODLE
          </Text>
          <Svg width={176} height={10} viewBox="0 0 176 10" style={styles.swoosh}>
            <Path d="M2 7 Q 50 1 100 5 T 174 3" stroke={colors.neon.volt} strokeWidth={4} strokeLinecap="round" fill="none" />
          </Svg>
          <Text style={styles.daily} maxFontSizeMultiplier={1.2}>
            DAILY
          </Text>
        </View>
      </View>
      <View style={styles.mastRight}>
        <ComboPill onPress={onCombo} />
        <Robo pose="idle" size={84} />
      </View>
    </View>
  );
}

function TodayScreen() {
  const today = useToday();
  const toast = useToast();
  const combo = useCombo();
  const dock = useRef<DockHandle>(null);
  const [chip, setChip] = useState<Chip>("all");
  const [sheet, setSheet] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [papers, setPapers] = useState(false);
  const [, setRetry] = useState(0);
  const reduce = useReducedMotion();
  const scroller = useRef<ScrollViewInstance>(null);
  const [chipY, setChipY] = useState(0);
  const known = useRef<Set<string> | null>(null);
  const edition = today.kind === "ready" ? today.data : null;
  const comics = useMemo(() => edition?.comics ?? [], [edition]);

  const onFailed = useCallback(
    (reason: DrawFailure) => {
      if (reason === "needs_plus") {
        setPaywall(true);
        return;
      }
      dock.current?.shake();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      const message = drawMessage(reason);
      if (message) toast.show(message);
    },
    [toast],
  );
  const onDone = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);
  const draw = useDrawFresh(comics, { onFailed, onDone });

  const freshId = draw.state.phase === "drawing" ? draw.state.comicId : null;
  const showDrawingCard = draw.state.phase === "requesting" || (draw.state.phase === "drawing" && !draw.state.seen);
  const visible = useMemo(() => filterComics(orderForToday(comics, freshId), chip), [comics, freshId, chip]);
  const drawingCount = stillDrawing(comics);
  const olderIssue = edition !== null && edition.date < pacificDate(now());

  useEffect(() => {
    const prev = known.current;
    if (comics.length > 0) known.current = new Set(comics.map((c) => c._id));
    if (!prev) return;
    if (comics.some((c) => !prev.has(c._id) && (c.isNew || c.kind === "commission"))) scroller.current?.scrollTo({ y: chipY, animated: !reduce });
  }, [comics, chipY, reduce]);

  useEffect(() => {
    if (draw.state.phase === "requesting") scroller.current?.scrollTo({ y: chipY, animated: !reduce });
  }, [draw.state.phase, chipY, reduce]);

  const open = (c: Comic) => router.push({ pathname: "/reader/[comicId]", params: { comicId: c._id } });
  void combo;

  let body: React.ReactNode;
  if (today.kind === "loading") body = <SkeletonList />;
  else if (today.kind === "error")
    body = (
      <ErrorState
        onRetry={() => {
          restartColdStartWindow();
          setRetry((n) => n + 1);
        }}
      />
    );
  else if (today.kind === "empty") body = <EmptyState title={copy.emptySection} />;
  else
    body = (
      <View style={styles.cards}>
        {today.offline ? <Banner testID="offlineBanner" tone="offline" text={copy.offline} /> : null}
        {olderIssue && edition ? <Banner testID="olderIssueBanner" tone="warn" text={copy.olderIssue(edition.number)} /> : null}
        {drawingCount > 0 ? <Banner testID="buildingBanner" text={copy.building(drawingCount)} /> : null}
        {showDrawingCard ? <DrawingCard /> : null}
        {visible.length === 0 ? (
          <EmptyState title={copy.emptySection} pose="idle" testID="emptySection" />
        ) : (
          visible.map((c, i) => (
            <ComicCard key={c._id} comic={c} index={i} lead={i === 0} read={isRead(c._id)} fresh={c._id === freshId} onPress={() => open(c)} />
          ))
        )}
        <View style={styles.footer}>
          <SecondaryButton testID="archiveButton" label={copy.backIssues} onPress={() => router.push("/archive")} style={styles.footerButton} />
          <SecondaryButton testID="papersButton" label="Papers" onPress={() => setPapers(true)} style={styles.footerButton} />
          <Text style={styles.footerLine}>{copy.footer}</Text>
        </View>
      </View>
    );

  return (
    <View style={styles.screen}>
      <GridBackground />
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ScrollView ref={scroller} testID="todayList" stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: DOCK_HEIGHT + 56 }}>
          <Masthead edition={edition} onCombo={() => setSheet(true)} onPlus={() => setPaywall(true)} />
          <View onLayout={(e) => setChipY(e.nativeEvent.layout.y)}>
            <ChipRow value={chip} onChange={setChip} />
          </View>
          <View style={styles.content}>{body}</View>
        </ScrollView>
      </SafeAreaView>
      <Dock ref={dock} busy={draw.busy} onDraw={draw.start} />
      <ComboSheet visible={sheet} onClose={() => setSheet(false)} />
      <PaywallSheet
        visible={paywall}
        onClose={() => setPaywall(false)}
        onOwnPaper={() => {
          setPaywall(false);
          setTimeout(() => setPapers(true), 450);
        }}
      />
      <PapersShelf visible={papers} onClose={() => setPapers(false)} />
      <ComboFreeze />
    </View>
  );
}

export default function Today() {
  return (
    <ErrorBoundary>
      <TodayScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.night },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.margin, paddingTop: 8 },
  cards: { gap: space.gap },
  masthead: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.margin, paddingTop: 8 },
  mastLeft: { gap: 6, flexShrink: 1 },
  mastRight: { alignItems: "center", gap: 8 },
  tags: { flexDirection: "row", gap: 8 },
  date: { ...type.meta, color: colors.text.low },
  issueTag: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4 },
  issue: { fontFamily: type.displaySm.fontFamily, fontSize: 14, color: colors.neon.volt },
  doodle: { fontFamily: type.displayMd.fontFamily, fontSize: 42, lineHeight: 46, color: colors.paper },
  swoosh: { marginTop: -4, marginBottom: 2 },
  daily: {
    fontFamily: type.displayMd.fontFamily,
    fontSize: 42,
    lineHeight: 46,
    color: colors.wordmark.daily,
    textShadowColor: colors.neon.cyan,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  footer: { alignItems: "center", gap: 16, paddingTop: 16 },
  footerButton: { alignSelf: "stretch" },
  footerLine: { ...type.body, color: colors.text.mid, textAlign: "center" },
});
