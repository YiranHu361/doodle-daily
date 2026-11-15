import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useReducedMotion } from "../../src/components/a11y";
import { GridBackground } from "../../src/components/GridBackground";
import { flyBack, landFlight, measure, useFlightCover, type ViewRef } from "../../src/components/Flight";
import { CloseIcon, CompassIcon, ShareIcon } from "../../src/components/icons";
import { PaperSheet } from "../../src/components/Paper";
import { PanelImage } from "../../src/components/PanelImage";
import { ProgressPips } from "../../src/components/ProgressPips";
import { ReactionBar } from "../../src/components/ReactionBar";
import { CutBox, CutButton } from "../../src/components/shapes";
import { SkeletonList } from "../../src/components/Skeleton";
import { EmptyState } from "../../src/components/States";
import { useToast } from "../../src/components/Toast";
import { PrimaryButton, ReadStamp, SectionTag } from "../../src/components/ui";
import { useIssue, useReactions } from "../../src/data/hooks";
import { REAL_STORY_PAGE, shouldMarkRead } from "../../src/data/readTracker";
import type { Comic, Panel } from "../../src/data/types";
import { ShareHost, useShare } from "../../src/share/useShare";
import { isRead, markComicRead, notifyBusy, notifyReaderClosed, useCombo } from "../../src/streak";
import { colors, cut, sectionColor, space, springs, type } from "../../src/theme";
import { copy } from "../../src/theme/copy";
import { SpeakerButton, useNarration, useVoiceSetting } from "../../src/voice";

const PAGES = 5;

function PanelPage({
  comicId,
  panel,
  index,
  width,
  height,
  color,
  scrollX,
  onPicture,
}: {
  comicId: string;
  panel: Panel;
  index: number;
  width: number;
  height: number;
  color: string;
  scrollX: SharedValue<number>;
  onPicture?: (view: ViewRef | null) => void;
}) {
  const pictureRef = useRef<ViewRef>(null);
  const setPicture = useCallback(
    (view: ViewRef | null) => {
      pictureRef.current = view;
      onPicture?.(view);
    },
    [onPicture],
  );
  const reduce = useReducedMotion();
  const covered = useFlightCover(comicId) && index === 0;
  const [flewIn] = useState(covered);
  const captionIn = useSharedValue(flewIn ? 0 : 1);
  useEffect(() => {
    if (!covered) captionIn.set(withTiming(1, { duration: 220 }));
  }, [covered, captionIn]);
  const captionAnim = useAnimatedStyle(() => ({ opacity: captionIn.value }));
  const onPictureLayout = () => {
    if (!covered) return;
    requestAnimationFrame(() => {
      void measure(pictureRef.current).then((rect) => rect && landFlight(comicId, rect));
    });
  };
  const sheet = Math.max(160, Math.min(width - space.margin * 2, height - 120));
  const picture = sheet - 20;
  const anim = useAnimatedStyle(() => {
    if (reduce) return {};
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      transform: [
        { translateY: interpolate(scrollX.value, input, [10, 0, 10], "clamp") },
        { rotate: `${interpolate(scrollX.value, input, [2, 0, -2], "clamp")}deg` },
        { scale: interpolate(scrollX.value, input, [0.97, 1, 0.97], "clamp") },
      ],
    };
  });
  return (
    <View style={[styles.page, { width }]}>
      <Animated.View style={anim}>
        <PaperSheet backlight={color} seed={index + 11} padding={10} style={{ width: sheet }} arrived={panel.imageUrl !== null}>
          <View ref={setPicture} collapsable={false} onLayout={onPictureLayout} style={covered ? styles.hidden : null}>
            <PanelImage testID={`panel_${index}`} uri={panel.imageUrl} size={picture} label={panel.scene || `Panel ${index + 1}`} placeholderLabel={copy.drawingCard} />
          </View>
          <Animated.Text testID={`panelCaption_${index}`} style={[styles.caption, captionAnim]} minimumFontScale={1}>
            {panel.caption}
          </Animated.Text>
        </PaperSheet>
      </Animated.View>
    </View>
  );
}

function RealStoryPage({ comic, width, read, onJump, onOpenSource }: { comic: Comic; width: number; read: boolean; onJump: (page: number) => void; onOpenSource: () => void }) {
  const color = sectionColor[comic.section];
  const thumb = Math.floor((width - space.margin * 2 - 32 - 3 * 10) / 4);
  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.realScroll} testID="realStoryPage">
      <CutBox cut={cut.card} fill={colors.surface[1]} stroke={color} glow={color} style={styles.realCard}>
        <View style={styles.thumbs}>
          {comic.panels.map((p, i) => (
            <CutButton
              key={i}
              testID={`realStoryThumb_${i}`}
              accessibilityLabel={`Back to panel ${i + 1}`}
              onPress={() => onJump(i)}
              cut={0}
              boxStyle={styles.thumbBox}
            >
              <PaperSheet seed={i + 21} padding={3}>
                <PanelImage uri={p.imageUrl} size={thumb - 6} label={p.scene} />
              </PaperSheet>
            </CutButton>
          ))}
        </View>
        <Text style={styles.realHeading} accessibilityRole="header">
          {copy.realStory}
        </Text>
        <Text testID="realStory" style={styles.realBody}>
          {comic.realStory}
        </Text>
        <View style={styles.sourceRow}>
          <Text style={styles.sourceLabel}>{copy.source}</Text>
          <Text testID="sourceName" style={styles.sourceName}>
            {comic.kind === "commission" ? "Created by a reader" : comic.sourceName || "Unknown source"}
          </Text>
        </View>
        {comic.sourceUrl ? <PrimaryButton testID="openSourceButton" label={copy.openSource} onPress={onOpenSource} /> : null}
        {read ? <ReadStamp /> : null}
      </CutBox>
    </ScrollView>
  );
}

function ReaderView({ comic }: { comic: Comic }) {
  const { width } = useWindowDimensions();
  const toast = useToast();
  const reduce = useReducedMotion();
  useCombo();
  const color = sectionColor[comic.section];
  const [page, setPage] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  useNarration(comic._id, page, useVoiceSetting().on);
  const [pageHeight, setPageHeight] = useState(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const [firstPicture, setFirstPicture] = useState<ViewRef | null>(null);
  const [flewIn] = useState(useFlightCover(comic._id));
  const scrollX = useSharedValue(0);
  const pull = useSharedValue(0);
  const enter = useSharedValue(0);

  const onReactionError = useCallback(() => toast.show(copy.reactionFailed), [toast]);
  const reactions = useReactions(comic._id, onReactionError);
  const onShareError = useCallback(() => toast.show(copy.shareFailed), [toast]);
  const share = useShare(onShareError);

  useEffect(() => {
    enter.set(withTiming(1, { duration: reduce ? 200 : 320 }));
    return () => notifyReaderClosed();
  }, [enter, reduce]);

  useEffect(() => {
    if (shouldMarkRead(seen, page, comic.status)) markComicRead(comic._id);
  }, [seen, page, comic.status, comic._id]);

  const goTo = useCallback(
    (next: number) => {
      const p = Math.max(0, Math.min(PAGES - 1, next));
      setPage((prev) => {
        if (prev !== p) void Haptics.selectionAsync().catch(() => undefined);
        return p;
      });
      setSeen((prev) => (prev.has(p) ? prev : new Set(prev).add(p)));
    },
    [],
  );

  const jump = useCallback(
    (p: number) => {
      scrollRef.current?.scrollTo({ x: p * width, animated: !reduce });
      goTo(p);
    },
    [goTo, width, reduce],
  );

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
  });
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => goTo(Math.round(e.nativeEvent.contentOffset.x / width));

  const close = useCallback(async () => {
    if (page === 0 && !reduce) {
      const rect = await measure(firstPicture);
      if (rect) flyBack(comic._id, rect);
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [page, reduce, comic._id, firstPicture]);

  const closeNow = () => void close();
  const pullDown = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      pull.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 900) runOnJS(closeNow)();
      else pull.set(withSpring(0, springs.snappy));
    });

  const screenAnim = useAnimatedStyle(() => ({
    opacity: enter.value * interpolate(pull.value, [0, 300], [1, 0.6], "clamp"),
    transform: [{ translateY: pull.value }, { scale: reduce || flewIn ? 1 : interpolate(enter.value, [0, 1], [0.94, 1]) }],
  }));

  const openSource = useCallback(async () => {
    notifyBusy(true);
    try {
      await WebBrowser.openBrowserAsync(comic.sourceUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
    } catch {
      toast.show(copy.browserFailed);
    } finally {
      notifyBusy(false);
    }
  }, [comic.sourceUrl, toast]);

  const read = isRead(comic._id);
  return (
    <View style={styles.flex}>
      <ShareHost comic={comic} active={share.sharing} onReady={share.onReady} />
      <GridBackground />
      <Animated.View style={[styles.flex, screenAnim]}>
        <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
          <GestureDetector gesture={pullDown}>
            <View style={styles.top} testID="readerTop">
              <View style={styles.topBar}>
                <CutButton testID="closeReader" accessibilityLabel="Close" onPress={closeNow} cut={cut.chip} fill={colors.surface[2]} stroke={colors.line.dim} boxStyle={styles.close}>
                  <CloseIcon />
                </CutButton>
                <ProgressPips page={page} seen={seen} color={color} />
                <SpeakerButton color={color} />
                <View style={styles.counter} accessible accessibilityLabel={page < REAL_STORY_PAGE ? `${page + 1} of 4` : "The real story"}>
                  {page < REAL_STORY_PAGE ? <Text style={styles.counterText}>{page + 1}/4</Text> : <CompassIcon color={color} />}
                </View>
              </View>
              <SectionTag section={comic.section} unverified={comic.unverified} />
              <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
                {comic.title}
              </Text>
            </View>
          </GestureDetector>
          <View style={styles.flex} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
            {pageHeight > 0 ? (
              <Animated.ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                onMomentumScrollEnd={onMomentumEnd}
                testID="readerPager"
              >
                {comic.panels.map((p, i) => (
                  <PanelPage key={i} comicId={comic._id} panel={p} index={i} width={width} height={pageHeight} color={color} scrollX={scrollX} onPicture={i === 0 ? setFirstPicture : undefined} />
                ))}
                <RealStoryPage comic={comic} width={width} read={read} onJump={jump} onOpenSource={openSource} />
              </Animated.ScrollView>
            ) : null}
          </View>
          <View style={styles.bottomBar}>
            <ReactionBar counts={reactions.counts} color={color} onToggle={reactions.toggle} />
            <CutButton
              testID="shareButton"
              accessibilityLabel="Share"
              onPress={share.share}
              disabled={share.sharing}
              cut={cut.chip}
              fill={colors.surface[2]}
              stroke={colors.line.bright}
              boxStyle={styles.shareBox}
            >
              <ShareIcon />
            </CutButton>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

export default function Reader() {
  const params = useLocalSearchParams<{ comicId: string; date?: string }>();
  const issue = useIssue(params.date ?? null);
  const comic = issue.kind === "ready" ? issue.data.comics.find((c) => c._id === params.comicId) : undefined;
  if (comic) return <ReaderView key={comic._id} comic={comic} />;
  return (
    <View style={styles.flex}>
      <GridBackground />
      <SafeAreaView style={styles.missing}>
        <CutButton testID="closeReader" accessibilityLabel="Close" onPress={() => router.back()} cut={cut.chip} fill={colors.surface[2]} stroke={colors.line.dim} boxStyle={styles.close}>
          <CloseIcon />
        </CutButton>
        {issue.kind === "loading" ? <SkeletonList /> : <EmptyState title={copy.emptySection} />}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  missing: { flex: 1, padding: 16, gap: 16 },
  top: { paddingHorizontal: space.margin, paddingTop: 4, paddingBottom: 8, gap: 8 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  close: { width: 44, height: 44 },
  counter: { minWidth: 44, alignItems: "flex-end" },
  counterText: { fontFamily: type.displaySm.fontFamily, fontSize: 18, color: colors.text.hi },
  title: { ...type.title, color: colors.text.hi },
  page: { justifyContent: "center", alignItems: "center" },
  caption: { ...type.caption, color: colors.ink, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 6, lineHeight: 24 },
  realScroll: { padding: space.margin, paddingTop: 12 },
  realCard: { padding: 16, gap: 14 },
  thumbs: { flexDirection: "row", gap: 10 },
  thumbBox: { minHeight: 44 },
  realHeading: { fontFamily: type.displaySm.fontFamily, fontSize: 24, color: colors.text.hi },
  realBody: { ...type.body, lineHeight: 24, color: colors.text.mid },
  sourceRow: { gap: 2 },
  sourceLabel: { ...type.meta, color: colors.text.low },
  sourceName: { ...type.button, color: colors.text.hi },
  bottomBar: { flexDirection: "row", gap: 8, paddingHorizontal: space.margin, paddingTop: 8, paddingBottom: 8 },
  shareBox: { width: 52, minHeight: 48 },
  hidden: { opacity: 0 },
});
