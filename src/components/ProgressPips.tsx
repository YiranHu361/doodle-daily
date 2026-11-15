import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, springs } from "../theme";

function Pip({ active, seen, color, dot }: { active: boolean; seen: boolean; color: string; dot: boolean }) {
  const w = useSharedValue(active ? (dot ? 12 : 30) : dot ? 8 : 18);
  useEffect(() => {
    w.set(withSpring(active ? (dot ? 12 : 30) : dot ? 8 : 18, springs.snappy));
  }, [active, dot, w]);
  const anim = useAnimatedStyle(() => ({ width: w.value }));
  return (
    <Animated.View
      style={[
        styles.pip,
        dot && styles.dot,
        anim,
        { backgroundColor: active ? color : seen ? color : colors.surface[3], opacity: active ? 1 : seen ? 0.45 : 1 },
      ]}
    />
  );
}

export function ProgressPips({ page, seen, color }: { page: number; seen: ReadonlySet<number>; color: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={page < 4 ? `Panel ${page + 1} of 4` : "The real story"}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Pip key={i} active={i === page} seen={seen.has(i)} color={color} dot={i === 4} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5 },
  pip: { height: 6, borderRadius: 1 },
  dot: { height: 8, borderRadius: 4 },
});
