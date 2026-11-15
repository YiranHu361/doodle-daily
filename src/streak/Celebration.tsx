import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Robo } from "../robo/Robo";
import { colors, cut, springs, type } from "../theme";
import { copy } from "./copy";
import { streakStore, useCelebration, useCombo, type Celebration } from "./index";
import { Bolt, CutBox, WeekStrip } from "./parts";

const T = { robo: 0, title: 300, number: 600, confetti: 900, week: 1200, bubble: 1600, button: 2000, rest: 2250 };
const CONFETTI_COLORS = [colors.neon.volt, colors.neon.cyan, colors.neon.lime, colors.neon.pink, colors.neon.violet];

export function CelebrationHost() {
  const celebration = useCelebration();
  return (
    <Modal visible={celebration !== null} transparent animationType="none" onRequestClose={() => streakStore.dismissCelebration()} statusBarTranslucent>
      {celebration ? <CelebrationView celebration={celebration} onDone={() => streakStore.dismissCelebration()} /> : null}
    </Modal>
  );
}

function useSpringIn(value: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: Math.min(1, value.value * 1.5), transform: [{ scale: value.value }] }));
}

function useRise(value: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: value.value, transform: [{ translateY: (1 - value.value) * 16 }] }));
}

function CelebrationView({ celebration, onDone }: { celebration: Celebration; onDone: () => void }) {
  const reduced = useReducedMotion();
  const { week } = useCombo();
  const [count, setCount] = useState(reduced ? celebration.to : celebration.from);
  const [todayLit, setTodayLit] = useState(reduced);
  const [rest, setRest] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dim = useSharedValue(0);
  const robo = useSharedValue(0);
  const title = useSharedValue(0);
  const shake = useSharedValue(0);
  const number = useSharedValue(0);
  const burst = useSharedValue(0);
  const bubble = useSharedValue(0);
  const button = useSharedValue(0);
  const all = [dim, robo, title, number, bubble, button];

  const finish = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    [...all, shake, burst].forEach((v) => cancelAnimation(v));
    all.forEach((v) => (v.value = 1));
    shake.value = 0;
    burst.value = 0;
    setCount(celebration.to);
    setTodayLit(true);
    setRest(true);
  };

  useEffect(() => {
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    if (reduced) {
      all.forEach((v) => (v.value = withTiming(1, { duration: springs.fadeMs })));
      at(springs.fadeMs, () => setRest(true));
      return () => timers.current.forEach(clearTimeout);
    }
    dim.value = withTiming(1, { duration: springs.fadeMs });
    robo.value = withSpring(1, springs.bouncy);
    title.value = withDelay(T.title, withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) }));
    shake.value = withDelay(
      T.title + 140,
      withSequence(withTiming(6, { duration: 40 }), withTiming(-5, { duration: 40 }), withTiming(3, { duration: 40 }), withTiming(0, { duration: 40 })),
    );
    number.value = withDelay(T.number, withSpring(1, springs.bouncy));
    burst.value = withDelay(T.confetti, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }));
    bubble.value = withDelay(T.bubble, withSpring(1, springs.bouncy));
    button.value = withDelay(T.button, withSpring(1, springs.snappy));
    at(T.title + 140, () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined));
    const steps = Math.max(1, celebration.to - celebration.from);
    const stepMs = Math.min(150, 450 / steps);
    for (let i = 1; i <= steps; i++) at(T.number + i * stepMs, () => setCount(Math.min(celebration.to, celebration.from + i)));
    at(T.week, () => setTodayLit(true));
    at(T.rest, () => setRest(true));
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, celebration]);

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const roboStyle = useSpringIn(robo);
  const titleStyle = useAnimatedStyle(() => ({
    opacity: title.value,
    transform: [{ scale: 1.9 - 0.9 * title.value }],
  }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const numberStyle = useSpringIn(number);
  const bubbleStyle = useSpringIn(bubble);
  const buttonStyle = useRise(button);

  return (
    <Pressable
      testID="celebrationOverlay"
      accessibilityViewIsModal
      accessibilityLabel={`${copy.dayCleared}. ${celebration.to} ${copy.dayCombo}.`}
      onPress={rest ? undefined : finish}
      style={StyleSheet.absoluteFill}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
      <Animated.View style={[styles.column, shakeStyle]}>
        <Animated.View style={roboStyle}>
          <Robo pose="cheer" size={120} />
        </Animated.View>
        <Animated.Text style={[styles.title, titleStyle]} accessibilityRole="header">
          {copy.dayCleared}
        </Animated.Text>
        <Animated.View style={[styles.numberRow, numberStyle]}>
          <Bolt size={56} />
          <Text testID="celebrationCount" style={styles.number}>{count}</Text>
        </Animated.View>
        <Animated.Text style={[styles.comboLabel, numberStyle]}>{copy.dayCombo}</Animated.Text>
        <View style={styles.week}>
          <WeekStrip cells={week} holdToday={!todayLit} />
        </View>
        <Animated.View style={[styles.bubble, bubbleStyle]}>
          <View style={styles.bubbleTail} />
          <Text style={styles.bubbleText}>{celebration.bubble}</Text>
        </Animated.View>
        <Animated.View style={[styles.buttonWrap, buttonStyle]}>
          <Pressable testID="celebrationContinue" accessibilityRole="button" accessibilityLabel={copy.keepReading} onPress={onDone} disabled={!rest}>
            <CutBox cut={cut.button} fill={colors.neon.volt} stroke={colors.neon.volt} glow={colors.neon.volt} style={styles.button}>
              <Text style={styles.buttonText}>{copy.keepReading}</Text>
            </CutBox>
          </Pressable>
        </Animated.View>
      </Animated.View>
      {reduced ? null : <Confetti burst={burst} />}
    </Pressable>
  );
}

const PIECES = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 40 }, (_, i) => {
    const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.3;
    const speed = 140 + rnd() * 200;
    return {
      key: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      spin: (rnd() - 0.5) * 900,
      w: 5 + rnd() * 5,
      h: 9 + rnd() * 7,
    };
  });
})();

function Confetti({ burst }: { burst: SharedValue<number> }) {
  return (
    <View pointerEvents="none" style={styles.confettiOrigin}>
      {PIECES.map(({ key, ...p }) => (
        <Piece key={key} burst={burst} {...p} />
      ))}
    </View>
  );
}

function Piece({ burst, color, dx, dy, spin, w, h }: { burst: SharedValue<number>; color: string; dx: number; dy: number; spin: number; w: number; h: number }) {
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    return {
      opacity: p === 0 ? 0 : 1 - Math.max(0, (p - 0.7) / 0.3),
      transform: [{ translateX: dx * p }, { translateY: dy * p + 420 * p * p }, { rotate: `${spin * p}deg` }],
    };
  });
  return <Animated.View style={[{ position: "absolute", width: w, height: h, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  dim: { backgroundColor: "rgba(7,5,26,0.9)" },
  column: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 10 },
  title: { ...type.displayLg, fontSize: 40, color: colors.neon.volt, textAlign: "center", textShadowColor: colors.neon.volt, textShadowRadius: 12 },
  numberRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  number: { ...type.displayXl, fontSize: 88, lineHeight: 100, color: colors.neon.volt },
  comboLabel: { ...type.body, color: colors.text.mid, marginTop: -8 },
  week: { alignSelf: "stretch", marginTop: 12 },
  bubble: { backgroundColor: colors.paper, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, marginTop: 14, maxWidth: 320 },
  bubbleTail: { position: "absolute", top: -8, left: 40, width: 16, height: 16, backgroundColor: colors.paper, transform: [{ rotate: "45deg" }] },
  bubbleText: { ...type.caption, color: colors.ink, textAlign: "center" },
  buttonWrap: { alignSelf: "stretch", marginTop: 18 },
  button: { minHeight: 52, alignItems: "center", justifyContent: "center" },
  buttonText: { ...type.button, color: colors.text.onNeon },
  confettiOrigin: { position: "absolute", left: "50%", top: "38%" },
});
