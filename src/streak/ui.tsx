import { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Robo } from "../robo/Robo";
import { colors, cut, fonts, space, type } from "../theme";
import { copy } from "./copy";
import { monthName } from "./dates";
import { useCombo } from "./index";
import { Bolt, CutBox, MonthGrid, WeekStrip } from "./parts";

export { CelebrationHost } from "./Celebration";

export function ComboPill({ onPress }: { onPress?: () => void }) {
  const { current, todayCleared, atRisk } = useCombo();
  const reduced = useReducedMotion();
  const flicker = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(flicker);
    flicker.value = 1;
    if (!atRisk || reduced) return;
    flicker.value = withRepeat(
      withSequence(
        withDelay(1800, withTiming(0.35, { duration: 60 })),
        withTiming(1, { duration: 60 }),
        withTiming(0.55, { duration: 50 }),
        withTiming(1, { duration: 90 }),
      ),
      -1,
    );
  }, [atRisk, reduced, flicker]);

  const flickerStyle = useAnimatedStyle(() => ({ opacity: flicker.value }));
  const tint = todayCleared ? colors.neon.volt : atRisk ? colors.neon.pink : colors.line.dim;
  const textColor = todayCleared ? colors.neon.volt : atRisk ? colors.neon.pink : colors.text.mid;
  const state = todayCleared ? "today cleared" : atRisk ? "at risk, read one comic today" : "today not cleared yet";

  return (
    <Pressable
      testID="streakPill"
      accessibilityRole="button"
      accessibilityLabel={`Combo ${current} ${current === 1 ? "day" : "days"}, ${state}`}
      onPress={onPress}
      hitSlop={4}
    >
      <Animated.View style={flickerStyle}>
        <CutBox cut={cut.chip} stroke={tint} fill={colors.surface[1]} glow={todayCleared || atRisk ? tint : null} style={styles.pill}>
          <Bolt size={16} color={todayCleared || atRisk ? tint : colors.text.low} />
          <Text testID="streakPillCount" style={[styles.pillText, { color: textColor }]}>
            {current}
          </Text>
        </CutBox>
      </Animated.View>
    </Pressable>
  );
}

export function ComboSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const combo = useCombo();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pose = combo.todayCleared ? "cheer" : combo.atRisk ? "sleepy" : "idle";
  const status = combo.todayCleared ? copy.statusCleared(combo.current) : copy.statusOpen;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close combo" />
        <View testID="streakSheet" accessibilityViewIsModal style={[styles.sheet, { maxHeight: height * 0.9, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <Robo pose={pose} size={64} />
              <View style={styles.headerText}>
                <Text style={styles.heading} accessibilityRole="header">{copy.sheetTitle}</Text>
                <Text testID="streakStatus" style={styles.status}>{status}</Text>
              </View>
              <Pressable testID="closeStreakSheet" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                <CutBox cut={cut.chip} fill={colors.surface[2]} style={styles.close}>
                  <Text style={styles.closeText}>×</Text>
                </CutBox>
              </Pressable>
            </View>

            <View style={styles.bigRow} accessible accessibilityLabel={`${combo.current} ${copy.dayCombo}`}>
              <Bolt size={52} color={combo.todayCleared ? colors.neon.volt : combo.atRisk ? colors.neon.pink : colors.line.bright} />
              <Text testID="streakSheetCount" style={[styles.big, !combo.todayCleared && !combo.atRisk && { color: colors.text.hi }]}>
                {combo.current}
              </Text>
              <Text style={styles.bigLabel}>{copy.dayCombo}</Text>
            </View>

            <View style={styles.tiles}>
              <Tile label={copy.highScore} value={combo.best} testID="highScore" />
              <Tile label={copy.comicsRead} value={combo.comicsRead} testID="comicsRead" />
            </View>

            <Text style={styles.section}>{copy.thisWeek}</Text>
            <WeekStrip cells={combo.week} />

            <Text style={styles.section}>{monthName(combo.month.month)}</Text>
            <MonthGrid grid={combo.month} width={Math.min(width, 520) - 48} />

            <Text style={styles.section}>{copy.howItWorks}</Text>
            {copy.howLines.map((line) => (
              <View key={line} style={styles.howRow}>
                <Bolt size={14} color={colors.neon.volt} />
                <Text style={styles.howText}>{line}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Tile({ label, value, testID }: { label: string; value: number; testID: string }) {
  return (
    <CutBox cut={cut.button} fill={colors.surface[2]} stroke={colors.line.dim} style={styles.tile}>
      <View accessible accessibilityLabel={`${label} ${value}`}>
        <Text style={styles.tileLabel}>{label}</Text>
        <Text testID={testID} style={styles.tileValue}>{value}</Text>
      </View>
    </CutBox>
  );
}

const styles = StyleSheet.create({
  pill: { minHeight: space.touch, minWidth: 64, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  pillText: { fontFamily: fonts.display, fontSize: 18 },
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7,5,26,0.6)" },
  sheet: { backgroundColor: colors.surface[1], borderTopWidth: 1.5, borderColor: colors.line.bright, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line.dim, marginTop: 8 },
  sheetBody: { padding: 24, paddingTop: 16, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1, gap: 2 },
  heading: { ...type.title, color: colors.text.hi },
  status: { ...type.body, fontSize: 15, color: colors.text.mid },
  close: { width: space.touch, height: space.touch, alignItems: "center", justifyContent: "center" },
  closeText: { ...type.title, color: colors.text.hi, lineHeight: 28 },
  bigRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  big: { ...type.displayXl, color: colors.neon.volt, lineHeight: 76 },
  bigLabel: { ...type.body, color: colors.text.mid, alignSelf: "flex-end", marginBottom: 14 },
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, padding: 14 },
  tileLabel: { ...type.meta, color: colors.text.low },
  tileValue: { ...type.displayMd, color: colors.text.hi },
  section: { ...type.button, color: colors.text.hi, marginTop: 12 },
  howRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  howText: { ...type.body, fontSize: 15, color: colors.text.mid, flex: 1 },
});
