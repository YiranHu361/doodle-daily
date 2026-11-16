import { storyLink } from "../share/link";

export type QuizResult = { choice: number; right: boolean; answer: number; points: number };
export type QuizData = { question: string; options: string[]; result: QuizResult | null };

export type OptionLook = "idle" | "picked" | "right" | "wrong" | "dim";

export type QuizView =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "writing" }
  | { kind: "ask"; question: string; options: string[]; busy: boolean; looks: OptionLook[] }
  | { kind: "answered"; question: string; options: string[]; looks: OptionLook[]; right: boolean; points: number; line: string };

export function challengeMessage(title: string, comicId: string): string {
  return `Beat me on this one: ${title}\n${storyLink(comicId)}`;
}

export function quizView(data: QuizData | null | undefined, pending: number | null, local: QuizResult | null, writing = false): QuizView {
  if (data === undefined) return { kind: "loading" };
  if (data === null) return { kind: writing ? "writing" : "none" };
  const result = data.result ?? local;
  if (!result) {
    const looks = data.options.map((_, i): OptionLook => (pending === null ? "idle" : i === pending ? "picked" : "dim"));
    return { kind: "ask", question: data.question, options: data.options, busy: pending !== null, looks };
  }
  const looks = data.options.map((_, i): OptionLook => (i === result.answer ? "right" : i === result.choice ? "wrong" : "dim"));
  const line = result.right
    ? `+${result.points}${result.points > 10 ? ` (speed bonus +${result.points - 10})` : ""}`
    : `Close one. It was \u201c${data.options[result.answer]}\u201d.`;
  return { kind: "answered", question: data.question, options: data.options, looks, right: result.right, points: result.points, line };
}
