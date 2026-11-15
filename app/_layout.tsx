import { BalsamiqSans_400Regular } from "@expo-google-fonts/balsamiq-sans";
import { Bungee_400Regular } from "@expo-google-fonts/bungee";
import {
  ChakraPetch_400Regular,
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
} from "@expo-google-fonts/chakra-petch";
import { ConvexProvider } from "convex/react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { convex } from "../src/data/convex";
import { getDeviceId } from "../src/data/deviceId";
import { Intro } from "../src/intro/Intro";
import { CelebrationHost } from "../src/streak/ui";
import { colors } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Bungee_400Regular,
    ChakraPetch_400Regular,
    ChakraPetch_500Medium,
    ChakraPetch_600SemiBold,
    BalsamiqSans_400Regular,
  });
  const [introDone, setIntroDone] = useState(false);
  const onIntroDone = useCallback(() => setIntroDone(true), []);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    void getDeviceId();
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ConvexProvider client={convex}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg.void }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg.night } }} />
          {introDone ? <CelebrationHost /> : <Intro onDone={onIntroDone} />}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ConvexProvider>
  );
}
