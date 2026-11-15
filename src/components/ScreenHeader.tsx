import { StyleSheet, Text, View } from "react-native";
import { colors, cut, type } from "../theme";
import { BackIcon } from "./icons";
import { CutButton } from "./shapes";

export function ScreenHeader({ title, meta, onBack }: { title: string; meta?: string; onBack: () => void }) {
  return (
    <View style={styles.row}>
      <CutButton testID="backButton" accessibilityLabel="Back" onPress={onBack} cut={cut.chip} fill={colors.surface[2]} stroke={colors.line.dim} boxStyle={styles.back}>
        <BackIcon />
      </CutButton>
      <View style={styles.text}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  back: { width: 44, height: 44 },
  text: { flex: 1 },
  title: { ...type.title, color: colors.text.hi },
  meta: { ...type.meta, color: colors.text.low },
});
