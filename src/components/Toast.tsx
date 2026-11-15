import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, cut, type } from "../theme";
import { CutBox } from "./shapes";

type ToastApi = { show: (text: string) => void };
const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 96 }]}>
        {toast ? (
          <Animated.View key={toast.id} entering={FadeInDown.duration(200)} exiting={FadeOut.duration(200)}>
            <CutBox testID="toast" cut={cut.button} fill={colors.surface[3]} stroke={colors.line.bright} style={styles.toast}>
              <Text style={styles.text} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {toast.text}
              </Text>
            </CutBox>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  toast: { paddingHorizontal: 16, paddingVertical: 12 },
  text: { ...type.body, color: colors.text.hi, textAlign: "center" },
});
