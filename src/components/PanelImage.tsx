import { Image, type ImageSource } from "expo-image";
import { useEffect } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { FIXTURE_IMAGES } from "../data/fixtures";
import { colors, type } from "../theme";
import { useReducedMotion } from "./a11y";

export function imageSource(uri: string | null): ImageSource | number | null {
  if (!uri) return null;
  if (uri.startsWith("fixture:")) return FIXTURE_IMAGES[uri] ?? null;
  return { uri, cacheKey: uri };
}

const SCRIBBLE_COLORS = [colors.neon.pink, colors.robo.body, colors.neon.volt, colors.neon.lime];

export function Scribble({ label, size }: { label?: string; size: number }) {
  const reduce = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    r.set(withRepeat(withSequence(withTiming(-2.5, { duration: 260 }), withTiming(2.5, { duration: 260 })), -1, true));
  }, [r, reduce]);
  const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  const s = size;
  return (
    <View style={[styles.scribbleBox, { width: s, height: s }]} accessibilityLabel={label ?? "Still drawing"} accessible>
      <Animated.View style={anim}>
        <Svg width={s * 0.6} height={s * 0.45} viewBox="0 0 60 45">
          {SCRIBBLE_COLORS.map((c, i) => (
            <Path
              key={c}
              d={`M${4 + i * 2} ${10 + i * 7} Q 15 ${2 + i * 6} 22 ${16 + i * 5} T 38 ${12 + i * 6} T 56 ${18 + i * 4}`}
              stroke={c}
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
              opacity={0.85}
            />
          ))}
        </Svg>
      </Animated.View>
      {label && s >= 120 ? <Text style={styles.scribbleText}>{label}</Text> : null}
    </View>
  );
}

export function PanelImage({
  uri,
  size,
  label,
  testID,
  placeholderLabel,
  style,
  onLoad,
}: {
  uri: string | null;
  size: number;
  label: string;
  testID?: string;
  placeholderLabel?: string;
  style?: StyleProp<ViewStyle>;
  onLoad?: () => void;
}) {
  const source = imageSource(uri);
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={[{ width: size, height: size }, styles.frame, style]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={uri ?? undefined}
          allowDownscaling
          onLoad={onLoad}
          onError={onLoad}
        />
      ) : (
        <Scribble size={size} label={placeholderLabel} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 6, backgroundColor: colors.paper },
  scribbleBox: { justifyContent: "center", alignItems: "center", gap: 6 },
  scribbleText: { ...type.meta, color: colors.ink },
});
