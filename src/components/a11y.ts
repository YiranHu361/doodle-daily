import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

export function useHighContrast(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isDarkerSystemColorsEnabled?.()
      .then((v) => live && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("darkerSystemColorsChanged", (v: boolean) => setOn(v));
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}

export { useReducedMotion };
