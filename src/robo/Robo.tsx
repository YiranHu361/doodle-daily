import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { colors } from "../theme";

export type RoboPose = "idle" | "cheer" | "drawing" | "sleepy" | "glitch";

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const OUTLINE = colors.text.hi;
const DARK = colors.robo.screen;
const ANTENNA_BASE = { x: 50, y: 22 };
const ANTENNA_LENGTH = 13;

const label: Record<RoboPose, string> = {
  idle: "Robo, waving hello",
  cheer: "Robo, cheering",
  drawing: "Robo, drawing with a crayon",
  sleepy: "Robo, sleepy",
  glitch: "Robo, glitching",
};

function Arms({ pose, sticker }: { pose: RoboPose; sticker: boolean }) {
  const fill = sticker ? OUTLINE : colors.robo.shade;
  const s = sticker ? { stroke: OUTLINE, strokeWidth: 6, strokeLinejoin: "round" as const } : {};
  if (pose === "cheer") {
    return (
      <G>
        <Rect x={17} y={48} width={8} height={18} rx={4} fill={fill} {...s} transform="rotate(-28 21 66)" />
        <Rect x={75} y={48} width={8} height={18} rx={4} fill={fill} {...s} transform="rotate(28 79 66)" />
        <Circle cx={15} cy={50} r={4.5} fill={sticker ? OUTLINE : colors.robo.body} {...s} />
        <Circle cx={85} cy={50} r={4.5} fill={sticker ? OUTLINE : colors.robo.body} {...s} />
      </G>
    );
  }
  if (pose === "drawing") {
    return (
      <G>
        <Rect x={24} y={64} width={8} height={16} rx={4} fill={fill} {...s} />
        <Rect x={64} y={70} width={16} height={8} rx={4} fill={fill} {...s} />
        <G transform="rotate(-35 82 70)">
          <Rect x={79} y={58} width={6} height={18} rx={1.5} fill={sticker ? OUTLINE : colors.neon.pink} {...s} />
          {sticker ? null : <Path d="M79 58 L82 52 L85 58 Z" fill={colors.ink} />}
        </G>
      </G>
    );
  }
  const droop = pose === "sleepy" ? 4 : 0;
  return (
    <G>
      <Rect x={24} y={64 + droop} width={8} height={16} rx={4} fill={fill} {...s} />
      <Rect x={68} y={64 + droop} width={8} height={16} rx={4} fill={fill} {...s} />
    </G>
  );
}

function Body({ pose, sticker }: { pose: RoboPose; sticker: boolean }) {
  const s = sticker ? { stroke: OUTLINE, strokeWidth: 6, strokeLinejoin: "round" as const } : {};
  const c = (color: string) => (sticker ? OUTLINE : color);
  return (
    <G>
      <Arms pose={pose} sticker={sticker} />
      <Rect x={36} y={84} width={11} height={8} rx={3} fill={c(colors.robo.shade)} {...s} />
      <Rect x={53} y={84} width={11} height={8} rx={3} fill={c(colors.robo.shade)} {...s} />
      <Rect x={31} y={61} width={38} height={26} rx={7} fill={c(colors.robo.body)} {...s} />
      <Rect x={44} y={56} width={12} height={8} fill={c(colors.robo.shade)} {...s} />
      <Circle cx={22} cy={41} r={5.5} fill={c(colors.robo.shade)} {...s} />
      <Circle cx={78} cy={41} r={5.5} fill={c(colors.robo.shade)} {...s} />
      <Rect x={24} y={22} width={52} height={38} rx={9} fill={c(colors.robo.body)} {...s} />
    </G>
  );
}

function Face({ pose, blink }: { pose: RoboPose; blink: SharedValue<number> }) {
  const eye = colors.robo.eyes;
  const eyeProps = useAnimatedProps(() => ({ ry: 3.6 * blink.value }));
  const line = { stroke: eye, strokeWidth: 2.4, strokeLinecap: "round" as const, fill: "none" };
  switch (pose) {
    case "cheer":
      return (
        <G>
          <Path d="M38 41 Q42 34 46 41" {...line} />
          <Path d="M54 41 Q58 34 62 41" {...line} />
          <Path d="M43 45 Q50 53 57 45 Z" fill={eye} />
        </G>
      );
    case "drawing":
      return (
        <G>
          <Ellipse cx={43} cy={44} rx={3} ry={2.4} fill={eye} />
          <Ellipse cx={57} cy={44} rx={3} ry={2.4} fill={eye} />
          <Path d="M46 49 Q50 50.5 54 49" {...line} />
        </G>
      );
    case "sleepy":
      return (
        <G>
          <Path d="M38 41 Q42 45 46 41" {...line} />
          <Path d="M54 41 Q58 45 62 41" {...line} />
          <Line x1={37} y1={39} x2={47} y2={39.5} {...line} strokeWidth={1.6} />
          <Line x1={53} y1={39.5} x2={63} y2={39} {...line} strokeWidth={1.6} />
          <Ellipse cx={50} cy={49} rx={2} ry={1.4} fill={eye} />
        </G>
      );
    case "glitch":
      return (
        <G>
          <Path d="M39 36 L46 43 M46 36 L39 43" {...line} />
          <Path d="M54 36 L61 43 M61 36 L54 43" {...line} />
          <Path d="M43 49 L46 47 L49 49 L52 47 L55 49 L58 47" {...line} strokeWidth={1.8} />
          <Rect x={31} y={33} width={38} height={1.6} fill={colors.neon.pink} opacity={0.7} />
        </G>
      );
    default:
      return (
        <G>
          <AnimatedEllipse cx={43} cy={40} rx={3.6} animatedProps={eyeProps} fill={eye} />
          <AnimatedEllipse cx={57} cy={40} rx={3.6} animatedProps={eyeProps} fill={eye} />
          <Path d="M45 46 Q50 50 55 46" {...line} />
        </G>
      );
  }
}

export function Robo({ pose = "idle", size = 64 }: { pose?: RoboPose; size?: number }) {
  const reduced = useReducedMotion();
  const sway = useSharedValue(pose === "sleepy" ? 0.45 : 0);
  const blink = useSharedValue(1);
  const jitter = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(sway);
    cancelAnimation(blink);
    cancelAnimation(jitter);
    blink.value = 1;
    jitter.value = 0;
    sway.value = pose === "sleepy" ? 0.45 : 0;
    if (reduced) return;
    if (pose === "idle") {
      sway.value = withRepeat(
        withSequence(
          withTiming(0.12, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(-0.12, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
      blink.value = withRepeat(
        withSequence(withDelay(3200, withTiming(0.1, { duration: 70 })), withTiming(1, { duration: 90 })),
        -1,
      );
    }
    if (pose === "cheer") {
      sway.value = withRepeat(withSequence(withTiming(0.25, { duration: 220 }), withTiming(-0.25, { duration: 220 })), -1, true);
    }
    if (pose === "glitch") {
      jitter.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 40 }),
          withTiming(-1.5, { duration: 40 }),
          withTiming(0, { duration: 40 }),
          withDelay(900, withTiming(0, { duration: 1 })),
        ),
        -1,
      );
    }
  }, [pose, reduced, sway, blink, jitter]);

  const stalk = useAnimatedProps(() => ({
    x2: ANTENNA_BASE.x + Math.sin(sway.value) * ANTENNA_LENGTH,
    y2: ANTENNA_BASE.y - Math.cos(sway.value) * ANTENNA_LENGTH,
  }));
  const ball = useAnimatedProps(() => ({
    cx: ANTENNA_BASE.x + Math.sin(sway.value) * (ANTENNA_LENGTH + 3),
    cy: ANTENNA_BASE.y - Math.cos(sway.value) * (ANTENNA_LENGTH + 3),
  }));
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: (jitter.value * size) / 100 }] }));

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label[pose]} testID={`robo_${pose}`} style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, shake]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <AnimatedLine x1={ANTENNA_BASE.x} y1={ANTENNA_BASE.y} animatedProps={stalk} stroke={OUTLINE} strokeWidth={7} strokeLinecap="round" />
          <AnimatedCircle animatedProps={ball} r={7} fill={OUTLINE} />
          <Body pose={pose} sticker />
          <AnimatedLine x1={ANTENNA_BASE.x} y1={ANTENNA_BASE.y} animatedProps={stalk} stroke={colors.robo.shade} strokeWidth={2.5} strokeLinecap="round" />
          <AnimatedCircle animatedProps={ball} r={4.2} fill={colors.neon.volt} />
          <Body pose={pose} sticker={false} />
          <Rect x={31} y={29} width={38} height={24} rx={5} fill={DARK} />
          <Face pose={pose} blink={blink} />
          <Circle cx={42} cy={72} r={2.8} fill={colors.neon.pink} />
          <Circle cx={50} cy={72} r={2.8} fill={colors.neon.volt} />
          <Circle cx={58} cy={72} r={2.8} fill={pose === "glitch" ? colors.state.error : colors.neon.lime} />
          <Rect x={27} y={25} width={14} height={3} rx={1.5} fill={OUTLINE} opacity={0.35} />
        </Svg>
      </Animated.View>
    </View>
  );
}
