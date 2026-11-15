import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "../theme";
import { useCombo } from "./index";

export function ComboPill({ onPress }: { onPress?: () => void }) {
  const { current, todayCleared, atRisk } = useCombo();
  const tint = todayCleared ? colors.neon.volt : atRisk ? colors.neon.pink : colors.line.dim;
  return (
    <Pressable
      testID="streakPill"
      accessibilityRole="button"
      accessibilityLabel={`Combo ${current} days`}
      onPress={onPress}
      style={[styles.pill, { borderColor: tint }]}
    >
      <Text style={[styles.pillText, { color: tint }]}>⚡ {current}</Text>
    </Pressable>
  );
}

export function ComboSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { current, best, comicsRead } = useCombo();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close combo" />
      <View testID="streakSheet" style={styles.sheet}>
        <Text style={styles.heading}>Your combo</Text>
        <Text style={styles.big}>⚡ {current}</Text>
        <Text style={styles.meta}>High score {best} · Comics read {comicsRead}</Text>
      </View>
    </Modal>
  );
}

export function CelebrationHost() {
  return null;
}

const styles = StyleSheet.create({
  pill: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  pillText: { ...type.chip },
  backdrop: { flex: 1, backgroundColor: "rgba(7,5,26,0.6)" },
  sheet: { backgroundColor: colors.surface[1], padding: 24, gap: 12, borderTopWidth: 1.5, borderColor: colors.line.bright },
  heading: { ...type.title, color: colors.text.hi },
  big: { ...type.displayLg, color: colors.neon.volt },
  meta: { ...type.meta, color: colors.text.low },
});
