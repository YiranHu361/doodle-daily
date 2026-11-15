import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { StyleSheet, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";
import { useHighContrast, useReducedMotion } from "./a11y";

function jitter(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2;
}

export function wobblyPath(w: number, h: number, seed: number, r = 10, amp = 1.4): string {
  const j = (i: number) => jitter(seed, i) * amp;
  const i = 1;
  return [
    `M ${r + j(0)} ${i + j(1)}`,
    `Q ${w / 2} ${i + j(2) * 1.5} ${w - r + j(3)} ${i + j(4)}`,
    `Q ${w - i} ${i} ${w - i + j(5)} ${r + j(6)}`,
    `Q ${w - i + j(7) * 1.5} ${h / 2} ${w - i + j(8)} ${h - r + j(9)}`,
    `Q ${w - i} ${h - i} ${w - r + j(10)} ${h - i + j(11)}`,
    `Q ${w / 2} ${h - i + j(12) * 1.5} ${r + j(13)} ${h - i + j(14)}`,
    `Q ${i} ${h - i} ${i + j(15)} ${h - r + j(16)}`,
    `Q ${i + j(17) * 1.5} ${h / 2} ${i + j(18)} ${r + j(19)}`,
    `Q ${i} ${i} ${r + j(0)} ${i + j(1)} Z`,
  ].join(" ");
}

export function PaperSheet({
  backlight,
  seed = 1,
  padding = 10,
  style,
  children,
  backlightRadius = 18,
  arrived,
}: {
  backlight?: string | null;
  seed?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  backlightRadius?: number;
  arrived?: boolean;
}) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  const wasArrived = useRef(arrived);
  useEffect(() => {
    if (arrived && wasArrived.current === false && !reduce) pulse.set(withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 520 })));
    wasArrived.current = arrived;
  }, [arrived, pulse, reduce]);
  const pulseStyle = useAnimatedStyle(() => (pulse.value > 0 ? { shadowOpacity: 0.55 + 0.45 * pulse.value, shadowRadius: backlightRadius * (1 + pulse.value) } : {}));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const highContrast = useHighContrast();
  const d = useMemo(() => (size.w > 0 ? wobblyPath(size.w, size.h, seed) : ""), [size, seed]);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  const light =
    backlight && !highContrast
      ? { shadowColor: backlight, shadowOpacity: 0.55, shadowRadius: backlightRadius, shadowOffset: { width: 0, height: 0 } }
      : null;
  return (
    <Animated.View style={[light, { padding }, style, light ? pulseStyle : null]} onLayout={onLayout}>
      {d ? (
        <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
          <Path d={d} fill={colors.paper} stroke={colors.ink} strokeWidth={1.2} strokeOpacity={0.55} />
        </Svg>
      ) : null}
      {children}
    </Animated.View>
  );
}
