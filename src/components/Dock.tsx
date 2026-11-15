import { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { CommissionButton } from "../billing";
import { colors } from "../theme";
import { copy } from "../theme/copy";
import { useReducedMotion } from "./a11y";
import { PrimaryButton, PulsingDots } from "./ui";

export const DOCK_HEIGHT = 96;

export type DockHandle = { shake: () => void };

export const Dock = forwardRef<DockHandle, { busy: boolean; onDraw: () => void }>(function Dock({ busy, onDraw }, ref) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    shake: () => {
      if (reduce) return;
      x.set(
        withSequence(
          withTiming(-10, { duration: 50 }),
          withTiming(10, { duration: 70 }),
          withTiming(-6, { duration: 60 }),
          withTiming(6, { duration: 60 }),
          withTiming(0, { duration: 50 }),
        ),
      );
    },
  }));
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg.night} stopOpacity={0} />
            <Stop offset="0.45" stopColor={colors.bg.night} stopOpacity={0.92} />
            <Stop offset="1" stopColor={colors.bg.night} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
      </Svg>
      <View style={styles.row}>
        <Animated.View style={[styles.main, anim]}>
          <PrimaryButton
            testID="drawFreshButton"
            label={busy ? copy.dockBusy : copy.dock}
            accessibilityLabel={busy ? copy.dockBusy : copy.dock}
            onPress={onDraw}
            disabled={busy}
          >
            {busy ? <PulsingDots /> : null}
          </PrimaryButton>
        </Animated.View>
        <CommissionButton />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 36, paddingHorizontal: 16 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  main: { flex: 1 },
});
