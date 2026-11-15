import { useEffect } from "react";

export function Intro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    onDone();
  }, [onDone]);
  return null;
}
