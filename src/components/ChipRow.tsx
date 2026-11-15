import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CHIPS, type Chip } from "../data/filter";
import { colors, cut, sectionColor, sectionLabel, type } from "../theme";
import { CutButton } from "./shapes";

const label = (chip: Chip) => (chip === "all" ? "All" : sectionLabel[chip]);

export function ChipRow({ value, onChange }: { value: Chip; onChange: (chip: Chip) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bar} contentContainerStyle={styles.row} accessibilityRole="tablist">
      {CHIPS.map((chip) => {
        const selected = chip === value;
        const color = sectionColor[chip];
        return (
          <CutButton
            key={chip}
            testID={`chip_${chip}`}
            accessibilityRole="tab"
            accessibilityLabel={label(chip)}
            accessibilityState={{ selected }}
            onPress={() => onChange(chip)}
            cut={cut.chip}
            fill={selected ? colors.surface[3] : colors.surface[2]}
            stroke={selected ? color : colors.line.dim}
            glow={selected ? color : null}
            outerStyle={styles.chipOuter}
            boxStyle={styles.chip}
          >
            <View style={styles.inner}>
              {selected ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
              <Text style={[styles.text, { color: selected ? color : colors.text.mid }]} maxFontSizeMultiplier={1.25} numberOfLines={1}>
                {label(chip)}
              </Text>
            </View>
          </CutButton>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.bg.night, flexGrow: 0 },
  row: { flexGrow: 1, flexDirection: "row", gap: 6, paddingVertical: 10, paddingHorizontal: 16 },
  chipOuter: { flexGrow: 1, flexShrink: 0 },
  chip: { minHeight: 44, paddingHorizontal: 10 },
  inner: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { ...type.chip },
});
