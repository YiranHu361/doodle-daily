import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Robo, type RoboPose } from "../robo/Robo";
import { Bolt, CutBox } from "../streak/parts";
import { colors, cut, sectionColor, space, type } from "../theme";
import { introSeen, markIntroSeen } from "./state";

type Card = { kicker: string; title: string; body: string; pose: RoboPose; accent: string };

const CARDS: Card[] = [
  {
    kicker: "EVERY MORNING",
    title: "The news, drawn in crayon",
    body: "One issue a day: tech, money, culture and memes, each story told in four crayon panels.",
    pose: "drawing",
    accent: sectionColor.tech,
  },
  {
    kicker: "DAILY COMBO",
    title: "One comic a day keeps the combo",
    body: "Read one whole comic to clear the day. Clear days in a row and your combo grows.",
    pose: "cheer",
    accent: colors.neon.volt,
  },
  {
    kicker: "THE REAL STORY",
    title: "Every comic has its real story",
    body: "The last page sums up what actually happened in two plain sentences, with a link to the source.",
    pose: "idle",
    accent: sectionColor.culture,
  },
];

export function Intro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"checking" | "showing" | "done">("checking");
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollViewInstance>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    let live = true;
    void introSeen().then((seen) => {
      if (!live) return;
      if (seen) {
        setPhase("done");
        done.current();
      } else setPhase("showing");
    });
    return () => {
      live = false;
    };
  }, []);

  const finish = () => {
    setPhase("done");
    void markIntroSeen();
    done.current();
  };

  const goTo = (i: number) => {
    setPage(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  };

  if (phase === "done") return null;
  if (phase === "checking") return <View style={[StyleSheet.absoluteFill, styles.root]} />;

  const last = page === CARDS.length - 1;
  return (
    <Animated.View exiting={FadeOut.duration(200)} entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.root]} testID="intro" accessibilityViewIsModal>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.wordmark}>DOODLE DAILY</Text>
        <Pressable testID="introSkip" onPress={finish} accessibilityRole="button" accessibilityLabel="Skip intro" hitSlop={8} style={styles.skip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        {CARDS.map((card, i) => (
          <View key={card.title} style={[styles.page, { width }]} testID={`introCard_${i}`}>
            <CutBox cut={cut.card} fill={colors.surface[1]} stroke={card.accent} glow={card.accent} style={styles.card}>
              <View style={styles.art}>
                <Robo pose={card.pose} size={140} />
                {i === 1 ? (
                  <View style={styles.badge}>
                    <Bolt size={30} />
                    <Text style={styles.badgeText}>1</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.kicker, { color: card.accent }]}>{card.kicker}</Text>
              <Text style={styles.title} accessibilityRole="header">{card.title}</Text>
              <Text style={styles.body}>{card.body}</Text>
            </CutBox>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.pips} accessible accessibilityLabel={`Card ${page + 1} of ${CARDS.length}`}>
          {CARDS.map((card, i) => (
            <View key={card.title} style={[styles.pip, i === page && { backgroundColor: colors.neon.volt, width: 22 }]} />
          ))}
        </View>
        <Pressable
          testID={last ? "introDone" : "introNext"}
          onPress={last ? finish : () => goTo(page + 1)}
          accessibilityRole="button"
          accessibilityLabel={last ? "Start reading" : "Next"}
        >
          <CutBox cut={cut.button} fill={colors.neon.volt} stroke={colors.neon.volt} glow={colors.neon.volt} style={styles.button}>
            <Text style={styles.buttonText}>{last ? "Start reading" : "Next"}</Text>
          </CutBox>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bg.night, zIndex: 10 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.margin },
  wordmark: { ...type.displaySm, fontSize: 16, color: colors.text.hi },
  skip: { minHeight: space.touch, minWidth: space.touch, alignItems: "flex-end", justifyContent: "center" },
  skipText: { ...type.button, color: colors.text.mid },
  pager: { flex: 1 },
  page: { paddingHorizontal: space.margin, justifyContent: "center" },
  card: { padding: 24, gap: 10 },
  art: { alignItems: "center", justifyContent: "center", marginBottom: 12 },
  badge: { position: "absolute", right: 24, top: 8, flexDirection: "row", alignItems: "center" },
  badgeText: { ...type.displayMd, color: colors.neon.volt },
  kicker: { ...type.displaySm, fontSize: 14 },
  title: { ...type.title, color: colors.text.hi },
  body: { ...type.body, color: colors.text.mid },
  bottom: { paddingHorizontal: space.margin, gap: 16 },
  pips: { flexDirection: "row", justifyContent: "center", gap: 8 },
  pip: { width: 8, height: 8, backgroundColor: colors.line.dim },
  button: { minHeight: 52, alignItems: "center", justifyContent: "center" },
  buttonText: { ...type.button, color: colors.text.onNeon },
});
