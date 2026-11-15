import { useAction, useQuery } from "convex/react";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useFlags } from "../data/flags";
import { useCelebration } from "../streak";
import { clipForPage, createNarration } from "./narration";
import { setVoiceNotice } from "./setting";

type Narration = ReturnType<typeof createNarration>;

export const VOICE_RESTING = "Newsie's voice is resting until tomorrow.";

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => live && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", (v: boolean) => setOn(v));
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}

export function useNarration(comicId: string, pageIndex: number, enabled: boolean): void {
  const screenReader = useScreenReader();
  const celebrating = useCelebration() !== null;
  const { fixtures } = useFlags();
  const wanted = enabled && !screenReader && !fixtures;
  const active = wanted && !celebrating;

  const ensure = useAction(api.voice.ensure);
  const clips = useQuery(api.voice.forComic, wanted ? { comicId: comicId as Id<"comics"> } : "skip");
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || asked.current === comicId) return;
    asked.current = comicId;
    ensure({ comicId: comicId as Id<"comics"> })
      .then((r) => setVoiceNotice(!r.ok && r.reason === "voice_cap" ? VOICE_RESTING : null))
      .catch(() => {
        asked.current = null;
      });
  }, [wanted, comicId, ensure]);

  const narration = useRef<Narration | null>(null);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: "duckOthers" }).catch(() => undefined);
    const player = createAudioPlayer(null);
    const controller = createNarration({
      play(url) {
        player.replace({ uri: url });
        player.play();
      },
      stop() {
        player.pause();
      },
    });
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) controller.finished();
    });
    narration.current = controller;
    return () => {
      narration.current = null;
      controller.dispose();
      sub.remove();
      player.remove();
    };
  }, []);

  const url = clipForPage(clips, pageIndex);
  useEffect(() => {
    narration.current?.update({ page: pageIndex, url, active });
  }, [pageIndex, url, active]);
}
