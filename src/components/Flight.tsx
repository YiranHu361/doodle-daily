import { Image } from "expo-image";
import { useEffect, useSyncExternalStore, type ComponentRef } from "react";
import { StyleSheet, type View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { colors } from "../theme";
import { imageSource } from "./PanelImage";

export type Rect = { x: number; y: number; width: number; height: number };
export type ViewRef = ComponentRef<typeof View>;

type Flight = {
  id: number;
  comicId: string;
  uri: string;
  color: string;
  from: Rect;
  to: Rect | null;
  landed: boolean;
};

const PAD = 8;
const WAIT_FOR_TARGET_MS = 700;
const MAX_FLIGHT_MS = 1600;

let flight: Flight | null = null;
let nextId = 1;
const origins = new Map<string, { uri: string; color: string; rect: Rect }>();
const listeners = new Set<() => void>();
let safety: ReturnType<typeof setTimeout> | null = null;

function emit(next: Flight | null) {
  flight = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function arm(id: number, ms: number) {
  if (safety) clearTimeout(safety);
  safety = setTimeout(() => {
    if (flight?.id === id && !flight.to) emit(null);
  }, ms);
  setTimeout(() => {
    if (flight?.id === id) emit(null);
  }, MAX_FLIGHT_MS);
}

export function measure(view: ViewRef | null): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

export function launchFlight(comicId: string, uri: string, color: string, from: Rect) {
  origins.set(comicId, { uri, color, rect: from });
  const id = nextId++;
  emit({ id, comicId, uri, color, from, to: null, landed: false });
  arm(id, WAIT_FOR_TARGET_MS);
}

export function landFlight(comicId: string, to: Rect) {
  if (!flight || flight.comicId !== comicId || flight.to) return;
  emit({ ...flight, to });
}

export function flyBack(comicId: string, from: Rect): boolean {
  const origin = origins.get(comicId);
  if (!origin) return false;
  const id = nextId++;
  emit({ id, comicId, uri: origin.uri, color: origin.color, from, to: origin.rect, landed: false });
  arm(id, MAX_FLIGHT_MS);
  return true;
}

function finish(id: number) {
  if (flight?.id === id) emit({ ...flight, landed: true });
  setTimeout(() => {
    if (flight?.id === id) emit(null);
  }, 140);
}

export function useFlightCover(comicId: string): boolean {
  const f = useSyncExternalStore(subscribe, () => flight);
  return f !== null && f.comicId === comicId && !f.landed;
}

export function FlightHost() {
  const f = useSyncExternalStore(subscribe, () => flight);
  if (!f) return null;
  return <FlyingCover key={f.id} flight={f} />;
}

function FlyingCover({ flight: f }: { flight: Flight }) {
  const p = useSharedValue(0);
  const lift = useSharedValue(0);
  const fade = useSharedValue(1);
  const { from, to, id } = f;

  useEffect(() => {
    if (!to) {
      lift.set(withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }));
      return;
    }
    lift.set(withSequence(withTiming(1, { duration: 110 }), withTiming(0, { duration: 340, easing: Easing.inOut(Easing.quad) })));
    p.set(
      withSpring(1, { damping: 15, stiffness: 180, mass: 0.8 }, (done) => {
        if (done) runOnJS(finish)(id);
      }),
    );
  }, [to, id, p, lift]);

  useEffect(() => {
    if (f.landed) fade.set(withTiming(0, { duration: 120 }));
  }, [f.landed, fade]);

  const style = useAnimatedStyle(() => {
    const t = p.value;
    const target = to ?? from;
    const l = lift.value * 0.05;
    const width = from.width + (target.width - from.width) * t;
    const height = from.height + (target.height - from.height) * t;
    return {
      opacity: fade.value,
      left: from.x + (target.x - from.x) * t - PAD,
      top: from.y + (target.y - from.y) * t - PAD,
      width: width + PAD * 2,
      height: height + PAD * 2,
      transform: [{ scale: 1 + l }],
      shadowOpacity: 0.35 + l * 6,
    };
  });

  const source = imageSource(f.uri);
  return (
    <Animated.View pointerEvents="none" style={[styles.sheet, { shadowColor: f.color }, style]}>
      {source ? <Image source={source} style={styles.picture} contentFit="cover" cachePolicy="memory-disk" transition={0} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    padding: PAD,
    backgroundColor: colors.paper,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(27,23,54,0.4)",
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  picture: { flex: 1, borderRadius: 6 },
});
