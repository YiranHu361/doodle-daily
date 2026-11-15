import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDeviceId } from "../data/deviceId";
import { useFlags } from "../data/flags";
import type { QuizResult } from "./logic";

export function useQuiz(comicId: string, active: boolean) {
  const { fixtures } = useFlags();
  const deviceId = useDeviceId();
  const id = comicId as Id<"comics">;
  const data = useQuery(api.quiz.forComic, !fixtures && deviceId ? { comicId: id, deviceId } : "skip");
  const ensure = useAction(api.quiz.ensure);
  const send = useMutation(api.quiz.answer);
  const [pending, setPending] = useState<number | null>(null);
  const [local, setLocal] = useState<QuizResult | null>(null);
  const asked = useRef(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (data !== null || asked.current) return;
    asked.current = true;
    void ensure({ comicId: id }).catch(() => undefined);
  }, [data, ensure, id]);

  useEffect(() => {
    if (active && data && shownAt.current === null) shownAt.current = Date.now();
  }, [active, data]);

  const answer = useCallback(
    async (choice: number) => {
      if (!deviceId || pending !== null || local) return;
      setPending(choice);
      try {
        const elapsedMs = Date.now() - (shownAt.current ?? Date.now());
        const r = await send({ comicId: id, deviceId, choice, elapsedMs });
        if (r.ok) setLocal({ choice, right: r.right, answer: r.answer, points: r.points });
      } catch {
        return;
      } finally {
        setPending(null);
      }
    },
    [deviceId, pending, local, send, id],
  );

  return { data: fixtures ? null : data, pending, local, answer };
}

export function useBoard() {
  const { fixtures } = useFlags();
  const deviceId = useDeviceId();
  const board = useQuery(api.quiz.board, !fixtures && deviceId ? { deviceId } : "skip");
  const rename = useMutation(api.quiz.rename);
  const changeName = useCallback(async (name: string) => (deviceId ? rename({ deviceId, name }) : null), [deviceId, rename]);
  return { board: fixtures ? null : board, changeName };
}
