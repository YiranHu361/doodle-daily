import { describe, expect, test } from "vitest";
import { challengeMessage, quizView } from "./logic";

const data = { question: "What did Robo buy?", options: ["A kite", "A boat", "A hat"], result: null };

describe("quizView", () => {
  test("loading, then no question", () => {
    expect(quizView(undefined, null, null)).toEqual({ kind: "loading" });
    expect(quizView(null, null, null)).toEqual({ kind: "none" });
    expect(quizView(null, null, null, true)).toEqual({ kind: "writing" });
  });

  test("asks with idle options, then marks the pick while it is sent", () => {
    const ask = quizView(data, null, null);
    expect(ask).toMatchObject({ kind: "ask", busy: false, looks: ["idle", "idle", "idle"] });
    expect(quizView(data, 1, null)).toMatchObject({ kind: "ask", busy: true, looks: ["dim", "picked", "dim"] });
  });

  test("a right answer turns green with the points and speed bonus", () => {
    const v = quizView(data, 0, { choice: 0, right: true, answer: 0, points: 14 });
    expect(v).toMatchObject({ kind: "answered", right: true, looks: ["right", "dim", "dim"], line: "+14 (speed bonus +4)" });
    expect(quizView(data, null, { choice: 2, right: true, answer: 2, points: 10 })).toMatchObject({ line: "+10" });
  });

  test("a wrong answer shows the right one in one kind line", () => {
    const v = quizView(data, 1, { choice: 1, right: false, answer: 2, points: 0 });
    expect(v).toMatchObject({ kind: "answered", right: false, looks: ["dim", "wrong", "right"] });
    expect(v.kind === "answered" && v.line).toBe("Close one. It was \u201cA hat\u201d.");
  });

  test("a stored server result wins over the local one", () => {
    const stored = { ...data, result: { choice: 0, right: true, answer: 0, points: 15 } };
    expect(quizView(stored, null, null)).toMatchObject({ kind: "answered", points: 15 });
  });
});

test("challenge message carries the title and the story link", () => {
  expect(challengeMessage("Robo Buys a Kite", "abc123")).toBe("Beat me on this one: Robo Buys a Kite\nhttps://resilient-ostrich-674.convex.site/s/abc123");
});
