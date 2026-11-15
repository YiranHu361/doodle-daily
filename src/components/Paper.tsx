import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";
import { useHighContrast } from "./a11y";

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
}: {
  backlight?: string | null;
  seed?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  backlightRadius?: number;
}) {
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
    <View style={[light, { padding }, style]} onLayout={onLayout}>
      {d ? (
        <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
          <Path d={d} fill={colors.paper} stroke={colors.ink} strokeWidth={1.2} strokeOpacity={0.55} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
