import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors, glow as glowToken, springs } from "../theme";
import { useHighContrast } from "./a11y";

export function cutPath(w: number, h: number, c: number, inset = 0): string {
  const i = inset;
  const k = Math.min(c, w / 2, h / 2);
  return `M ${k + i} ${i} H ${w - i} V ${h - k - i} L ${w - k - i} ${h - i} H ${i} V ${k + i} Z`;
}

export function glowStyle(color: string | null | undefined, highContrast: boolean, radius: number = glowToken.blur): ViewStyle | null {
  if (!color || highContrast) return null;
  return { shadowColor: color, shadowOpacity: glowToken.opacity, shadowRadius: radius, shadowOffset: { width: 0, height: 0 } };
}

export type CutBoxProps = {
  cut: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  glow?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
};

export function CutBox({ cut, fill, stroke, strokeWidth = glowToken.stroke, dashed, glow, style, children, testID }: CutBoxProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const highContrast = useHighContrast();
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  const sw = stroke ? strokeWidth : 0;
  return (
    <View testID={testID} style={[glowStyle(glow, highContrast), style]} onLayout={onLayout}>
      {size.w > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
          <Path
            d={cutPath(size.w, size.h, cut, sw / 2)}
            fill={fill ?? "none"}
            stroke={stroke ?? "none"}
            strokeWidth={sw}
            strokeOpacity={highContrast ? 1 : undefined}
            strokeDasharray={dashed ? "7 5" : undefined}
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type CutButtonProps = Omit<PressableProps, "style" | "children"> &
  Omit<CutBoxProps, "testID"> & { boxStyle?: StyleProp<ViewStyle>; outerStyle?: StyleProp<ViewStyle> };

export function CutButton({ cut, fill, stroke, strokeWidth, dashed, glow, style, boxStyle, outerStyle, children, onPressIn, onPressOut, ...press }: CutButtonProps) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={4}
      {...press}
      style={[anim, outerStyle]}
      onPressIn={(e) => {
        scale.set(withSpring(0.95, springs.snappy));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, springs.snappy));
        onPressOut?.(e);
      }}
    >
      <CutBox cut={cut} fill={fill} stroke={stroke} strokeWidth={strokeWidth} dashed={dashed} glow={glow} style={[styles.button, boxStyle, style]}>
        {children}
      </CutBox>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: "center", alignItems: "center" },
});

export const surfaceFill = colors.surface[2];
