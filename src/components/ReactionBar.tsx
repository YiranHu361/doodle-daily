import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { REACTION_KINDS } from "../data/reactions";
import type { ReactionCounts, ReactionKind } from "../data/types";
import { colors, cut, springs, type } from "../theme";
import { useReducedMotion } from "./a11y";
import { RoboFace } from "./icons";
import { CutButton } from "./shapes";

function Tile({
  kind,
  count,
  selected,
  disabled,
  color,
  onPress,
}: {
  kind: ReactionKind;
  count: number | null;
  selected: boolean;
  disabled: boolean;
  color: string;
  onPress: () => void;
}) {
  const reduce = useReducedMotion();
  const hop = useSharedValue(0);
  useEffect(() => {
    if (!selected || reduce) return;
    hop.set(withSequence(withTiming(-6, { duration: 110 }), withSpring(0, springs.bouncy)));
  }, [selected, hop, reduce]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }] }));
  return (
    <CutButton
      testID={`reaction_${kind}`}
      accessibilityLabel={`${kind}, ${count ?? 0}${selected ? ", selected" : ""}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      cut={cut.chip}
      fill={selected ? colors.surface[3] : colors.surface[2]}
      stroke={selected ? color : colors.line.dim}
      glow={selected ? color : null}
      outerStyle={[styles.tileOuter, disabled && styles.disabled]}
      boxStyle={styles.tile}
    >
      <View style={styles.tileInner}>
        <Animated.View style={anim}>
          <RoboFace kind={kind} />
        </Animated.View>
        <Text style={[styles.count, selected && { color }]} maxFontSizeMultiplier={1.3}>
          {count ?? "–"}
        </Text>
      </View>
    </CutButton>
  );
}

export function ReactionBar({ counts, color, onToggle }: { counts: ReactionCounts | null; color: string; onToggle: (kind: ReactionKind) => void }) {
  return (
    <View style={styles.row}>
      {REACTION_KINDS.map((kind) => (
        <Tile
          key={kind}
          kind={kind}
          count={counts ? counts[kind] : null}
          selected={counts?.mine === kind}
          disabled={counts === null}
          color={color}
          onPress={() => onToggle(kind)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, flex: 1 },
  tileOuter: { flex: 1 },
  tile: { minHeight: 48, paddingHorizontal: 6 },
  tileInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  count: { ...type.chip, color: colors.text.hi, minWidth: 14 },
  disabled: { opacity: 0.5 },
});
