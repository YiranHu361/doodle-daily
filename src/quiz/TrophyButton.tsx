import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CutBox } from "../components/shapes";
import { colors, cut } from "../theme";

export function TrophyButton() {
  return (
    <Pressable testID="boardButton" accessibilityRole="button" accessibilityLabel="Today's board" onPress={() => router.push("/board")} hitSlop={4}>
      <CutBox cut={cut.chip} stroke={colors.line.dim} fill={colors.surface[1]} style={styles.pill}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M7 4h10v4a5 5 0 0 1-10 0V4Zm0 2H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4m-4 3h8l-1-3H9l-1 3Z" stroke={colors.neon.volt} strokeWidth={2} fill="none" strokeLinejoin="round" />
        </Svg>
      </CutBox>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { minHeight: 36, minWidth: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
});
