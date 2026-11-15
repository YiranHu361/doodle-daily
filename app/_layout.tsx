import { BalsamiqSans_400Regular } from "@expo-google-fonts/balsamiq-sans";
import { Bungee_400Regular } from "@expo-google-fonts/bungee";
import { ChakraPetch_400Regular, ChakraPetch_500Medium, ChakraPetch_600SemiBold } from "@expo-google-fonts/chakra-petch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ConvexProvider } from "convex/react";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../src/components/Toast";
import { convex } from "../src/data/convex";
import { getDeviceId } from "../src/data/deviceId";
import { resetFixtures } from "../src/data/fixtures";
import { applyFlags, applyFlagsFromUrl, envFlags, getFlags, onLocalReset } from "../src/data/flags";
import { Intro } from "../src/intro/Intro";
import { CelebrationHost } from "../src/streak/ui";
import { colors } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

const INTRO_KEY = "dd.introSeen.v1";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Bungee_400Regular,
    ChakraPetch_400Regular,
    ChakraPetch_500Medium,
    ChakraPetch_600SemiBold,
    BalsamiqSans_400Regular,
  });
  const [flagsReady, setFlagsReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  const onIntroDone = useCallback(() => {
    setIntroDone(true);
    void AsyncStorage.setItem(INTRO_KEY, "1").catch(() => undefined);
  }, []);

  useEffect(() => {
    const off = onLocalReset(resetFixtures);
    void (async () => {
      try {
        await applyFlags(envFlags());
        await applyFlagsFromUrl(await Linking.getInitialURL());
        const seen = await AsyncStorage.getItem(INTRO_KEY).catch(() => null);
        setIntroDone(getFlags().skipIntro || seen === "1");
      } finally {
        setFlagsReady(true);
        void getDeviceId();
      }
    })();
    const sub = Linking.addEventListener("url", ({ url }) => {
      void applyFlagsFromUrl(url).then((applied) => {
        if (!applied) return;
        void getDeviceId();
        if (getFlags().skipIntro) setIntroDone(true);
      });
    });
    return () => {
      off();
      sub.remove();
    };
  }, []);

  const ready = (fontsLoaded || fontError !== null) && flagsReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ConvexProvider client={convex}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg.void }}>
        <SafeAreaProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg.night } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="reader/[comicId]" options={{ animation: "fade", gestureEnabled: false, animationDuration: 200 }} />
              <Stack.Screen name="archive/index" />
              <Stack.Screen name="archive/[date]" />
            </Stack>
            {introDone ? <CelebrationHost /> : <Intro onDone={onIntroDone} />}
          </ToastProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ConvexProvider>
  );
}
