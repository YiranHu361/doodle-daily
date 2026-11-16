import { useEffect, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import type { Section } from "../data/types";
import { colors, cut, sectionColor, sectionLabel, springs, type } from "../theme";
import { useReducedMotion } from "./a11y";
import { CutBox, CutButton } from "./shapes";

export function PrimaryButton({
  label,
  onPress,
  testID,
  accessibilityLabel,
  disabled,
  children,
  style,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <CutButton
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      cut={cut.button}
      fill={colors.neon.volt}
      glow={colors.neon.volt}
      outerStyle={style}
      boxStyle={styles.primary}
    >
      <View style={styles.row}>
        <Text style={styles.primaryText}>{label}</Text>
        {children}
      </View>
    </CutButton>
  );
}

export function SecondaryButton({
  label,
  onPress,
  testID,
  accessibilityLabel,
  style,
  icon,
}: {
  label?: string;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
}) {
  return (
    <CutButton
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      cut={cut.button}
      fill={colors.surface[2]}
      stroke={colors.line.bright}
      outerStyle={style}
      boxStyle={label ? styles.secondary : styles.square}
    >
      <View style={styles.row}>
        {icon}
        {label ? <Text style={styles.secondaryText}>{label}</Text> : null}
      </View>
    </CutButton>
  );
}

export function SectionTag({ section, unverified, sponsored }: { section: Section; unverified?: boolean; sponsored?: boolean }) {
  const color = sectionColor[section];
  const tag = (
    <CutBox cut={cut.chip} fill={colors.surface[2]} stroke={color} strokeWidth={1} style={styles.tag}>
      <Text style={[styles.tagText, { color }]} maxFontSizeMultiplier={1.4}>
        {sectionLabel[section].toUpperCase()}
      </Text>
    </CutBox>
  );
  if (!unverified && !sponsored) return tag;
  return (
    <View style={styles.tagRow}>
      {tag}
      {sponsored ? (
        <CutBox testID="sponsoredTag" cut={cut.chip} fill={colors.neon.volt} stroke={colors.neon.volt} strokeWidth={1} style={styles.tag}>
          <Text style={[styles.tagText, { color: colors.text.onNeon }]} maxFontSizeMultiplier={1.4} accessibilityLabel="Sponsored">
            SPONSORED
          </Text>
        </CutBox>
      ) : null}
      {unverified ? (
        <CutBox cut={cut.chip} fill={colors.surface[2]} stroke={colors.stamp} strokeWidth={1} style={styles.tag}>
          <Text style={[styles.tagText, { color: colors.stamp }]} maxFontSizeMultiplier={1.4} accessibilityLabel={sponsored ? "Claims not checked" : "Unverified link"}>
            {sponsored ? "CLAIMS NOT CHECKED" : "UNVERIFIED LINK"}
          </Text>
        </CutBox>
      ) : null}
    </View>
  );
}

export function ReadStamp({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.stamp, style]} accessibilityLabel="Read" accessible pointerEvents="none">
      <Text style={styles.stampText} maxFontSizeMultiplier={1.2}>
        READ
      </Text>
    </View>
  );
}

export function NewBadge({ style, label = "NEW" }: { style?: StyleProp<ViewStyle>; label?: string }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.2);
  useEffect(() => {
    scale.set(reduce ? withTiming(1, { duration: 200 }) : withSpring(1, springs.bouncy));
  }, [reduce, scale]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: "-6deg" }] }));
  return (
    <Animated.View style={[styles.newBadge, anim, style]} accessibilityLabel={label === "NEW" ? "New" : label === "CREATED" ? "Created" : "Your comic"} accessible pointerEvents="none">
      <Text style={styles.newText} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </Animated.View>
  );
}

export function Banner({ text, tone = "info", testID }: { text: string; tone?: "info" | "warn" | "offline"; testID?: string }) {
  const color = tone === "offline" ? colors.state.error : tone === "warn" ? colors.neon.pink : colors.neon.cyan;
  return (
    <CutBox testID={testID} cut={cut.chip} fill={colors.surface[1]} stroke={color} strokeWidth={1} style={styles.banner}>
      <Text style={styles.bannerText} accessibilityRole="alert">
        {text}
      </Text>
    </CutBox>
  );
}

export function PulsingDots({ color = colors.text.onNeon }: { color?: string }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} color={color} />
      ))}
    </View>
  );
}

function Dot({ index, color }: { index: number; color: string }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(0.3);
  useEffect(() => {
    if (reduce) {
      o.set(1);
      return;
    }
    o.set(withDelay(index * 160, withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0.3, { duration: 320 })), -1)));
  }, [index, o, reduce]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, anim]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  primary: { minHeight: 52, paddingHorizontal: 20 },
  primaryText: { ...type.button, color: colors.text.onNeon },
  secondary: { minHeight: 48, paddingHorizontal: 20 },
  square: { width: 44, height: 44 },
  secondaryText: { ...type.button, color: colors.text.hi },
  tag: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagText: { fontFamily: type.chip.fontFamily, fontSize: 12, letterSpacing: 1 },
  stamp: {
    position: "absolute",
    top: -8,
    right: -6,
    backgroundColor: colors.paper,
    borderColor: colors.stamp,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    transform: [{ rotate: "8deg" }],
  },
  stampText: { fontFamily: type.displaySm.fontFamily, fontSize: 14, color: colors.stamp },
  newBadge: { position: "absolute", top: -8, left: -6, backgroundColor: colors.neon.volt, paddingHorizontal: 8, paddingVertical: 2 },
  newText: { fontFamily: type.displaySm.fontFamily, fontSize: 13, color: colors.text.onNeon },
  banner: { paddingHorizontal: 12, paddingVertical: 10 },
  bannerText: { ...type.meta, fontSize: 14, color: colors.text.hi },
  dots: { flexDirection: "row", gap: 4, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
