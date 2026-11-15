import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { space } from "../theme";
import { useReducedMotion } from "./a11y";
import { SkeletonCard } from "./ComicCard";

export function SkeletonList() {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.set(withRepeat(withTiming(0.45, { duration: 900 }), -1, true));
  }, [o, reduce]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[{ gap: space.gap }, anim]} accessible accessibilityLabel="Loading today's issue">
      <SkeletonCard lead />
      <SkeletonCard lead={false} />
      <SkeletonCard lead={false} />
      <View />
    </Animated.View>
  );
}
