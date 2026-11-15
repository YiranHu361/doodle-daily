import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { notifyBusy } from "../components/celebrationBridge";
import type { Comic } from "../data/types";
import { ShareCard } from "./ShareCard";

type OnReady = (view: ComponentRef<typeof View>, size: { width: number; height: number }) => void;

export function useShare(onError: () => void): { share: () => void; sharing: boolean; onReady: OnReady } {
  const [sharing, setSharing] = useState(false);
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  });

  const onReady = useCallback<OnReady>((view, size) => {
    void (async () => {
      try {
        const uri = await captureRef(view, { format: "png", result: "tmpfile", width: size.width, height: size.height, useRenderInContext: true });
        notifyBusy(true);
        await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Share this comic" });
      } catch {
        errorRef.current();
      } finally {
        notifyBusy(false);
        setSharing(false);
      }
    })();
  }, []);

  const share = useCallback(() => setSharing(true), []);
  return { share, sharing, onReady };
}

export function ShareHost({ comic, active, onReady }: { comic: Comic; active: boolean; onReady: OnReady }) {
  return active ? <ShareCard comic={comic} onReady={onReady} /> : null;
}
