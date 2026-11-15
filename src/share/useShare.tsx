import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { notifyBusy } from "../components/celebrationBridge";
import type { Comic } from "../data/types";
import { ShareCard } from "./ShareCard";

type OnReady = (view: ComponentRef<typeof View>) => void;

export function useShare(onError: () => void): { share: () => void; sharing: boolean; onReady: OnReady } {
  const [sharing, setSharing] = useState(false);
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  });

  const onReady = useCallback<OnReady>((view) => {
    void (async () => {
      try {
        const uri = await captureRef(view, { format: "jpg", quality: 0.92, result: "tmpfile", useRenderInContext: true });
        notifyBusy(true);
        await Sharing.shareAsync(uri, { mimeType: "image/jpeg", UTI: "public.jpeg", dialogTitle: "Share this comic" });
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
