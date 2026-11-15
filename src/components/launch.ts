import { useEffect, useState } from "react";
import { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { springs } from "../theme";
import { useReducedMotion } from "./a11y";

let played = false;

export function useLaunchSequence() {
  const reduce = useReducedMotion();
  const [first] = useState(() => !played);
  const grid = useSharedValue(first ? 0 : 1);
  const tube = useSharedValue(first ? 0 : 1);
  const robo = useSharedValue(first ? 0 : 1);
  const dock = useSharedValue(first ? 0 : 1);

  useEffect(() => {
    played = true;
    if (!first) return;
    if (reduce) {
      [grid, tube, robo, dock].forEach((v) => v.set(withTiming(1, { duration: springs.fadeMs })));
      return;
    }
    grid.set(withTiming(1, { duration: 300 }));
    tube.set(
      withDelay(
        250,
        withSequence(
          withTiming(0.9, { duration: 60 }),
          withTiming(0.15, { duration: 70 }),
          withTiming(1, { duration: 50 }),
          withTiming(0.4, { duration: 60 }),
          withTiming(1, { duration: 120 }),
        ),
      ),
    );
    robo.set(withDelay(650, withSpring(1, springs.bouncy)));
    dock.set(withDelay(1000, withSpring(1, springs.snappy)));
  }, [first, reduce, grid, tube, robo, dock]);

  return {
    grid: useAnimatedStyle(() => ({ opacity: grid.value })),
    wordmark: useAnimatedStyle(() => ({ opacity: tube.value })),
    robo: useAnimatedStyle(() => ({ opacity: Math.min(1, robo.value * 2), transform: [{ translateY: (1 - robo.value) * -60 }] })),
    dock: useAnimatedStyle(() => ({ transform: [{ translateY: (1 - dock.value) * 140 }] })),
  };
}
