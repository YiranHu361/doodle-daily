import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, Share, type View } from "react-native";
import { captureRef } from "react-native-view-shot";
import type { Comic } from "../data/types";
import { notifyBusy } from "../streak";
import { shareMessage, storyLink } from "./link";
import { ShareCard } from "./ShareCard";

type OnReady = (view: ComponentRef<typeof View>) => void;

export function useShare(comic: Pick<Comic, "_id" | "title"> | undefined, onError: () => void): { share: () => void; sharing: boolean; onReady: OnReady } {
  const [sharing, setSharing] = useState(false);
  const errorRef = useRef(onError);
  const message = comic ? shareMessage(comic.title, storyLink(comic._id)) : "";
  const messageRef = useRef(message);
  useEffect(() => {
    errorRef.current = onError;
    messageRef.current = message;
  });

  const onReady = useCallback<OnReady>((view) => {
    void (async () => {
      try {
        const uri = await captureRef(view, { format: "jpg", quality: 0.92, result: "tmpfile", useRenderInContext: true });
        notifyBusy(true);
        await Share.share(
          Platform.OS === "ios" ? { message: messageRef.current, url: uri } : { message: messageRef.current },
          { dialogTitle: "Share this comic" },
        );
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
