import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { ScrollView, Share, StyleSheet, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useReducedMotion } from "../components/a11y";
import { CutBox, CutButton } from "../components/shapes";
import { SecondaryButton } from "../components/ui";
import type { Comic } from "../data/types";
import { colors, cut, sectionColor, space, type } from "../theme";
import { useQuiz } from "./hooks";
import { challengeMessage, quizView, type OptionLook } from "./logic";

const fills: Record<OptionLook, string> = {
  idle: colors.surface[2],
  picked: colors.surface[3],
  right: colors.neon.lime,
  wrong: colors.state.error,
  dim: colors.surface[1],
};

export function QuizPage({ comic, width, active }: { comic: Comic; width: number; active: boolean }) {
  const reduce = useReducedMotion();
  const { data, pending, local, answer } = useQuiz(comic._id, active);
  const view = quizView(data, pending, local);
  const justAnswered = !!local;

  useEffect(() => {
    if (!local) return;
    void Haptics.notificationAsync(local.right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }, [local]);

  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.scroll} testID="quizPage">
      <CutBox cut={cut.card} fill={colors.surface[1]} stroke={sectionColor[comic.section]} style={styles.card}>
        <Text style={styles.heading} accessibilityRole="header">
          Quick question
        </Text>
        {view.kind === "loading" || view.kind === "none" ? (
          <Text style={styles.body}>{view.kind === "loading" ? "Sharpening the question..." : "No question for this one yet. Check back in a moment."}</Text>
        ) : (
          <>
            <Text testID="quizQuestion" style={styles.question}>
              {view.question}
            </Text>
            {view.options.map((o, i) => (
              <CutButton
                key={i}
                testID={`quizOption_${i}`}
                accessibilityLabel={o}
                accessibilityState={{ disabled: view.kind !== "ask" || view.busy, selected: view.looks[i] === "picked" }}
                disabled={view.kind !== "ask" || view.busy}
                onPress={() => void answer(i)}
                cut={cut.button}
                fill={fills[view.looks[i]]}
                stroke={view.looks[i] === "idle" ? colors.line.bright : undefined}
                boxStyle={styles.option}
              >
                <Text style={[styles.optionText, (view.looks[i] === "right" || view.looks[i] === "wrong") && styles.optionOnColor]}>{o}</Text>
              </CutButton>
            ))}
            {view.kind === "answered" ? (
              <Animated.View entering={justAnswered && !reduce ? FadeIn.duration(250) : undefined} style={styles.result}>
                <Text testID="quizResult" accessibilityLiveRegion="polite" style={[styles.line, view.right && styles.lineRight]}>
                  {view.line}
                </Text>
                <SecondaryButton testID="challengeButton" label="Challenge a friend" onPress={() => void Share.share({ message: challengeMessage(comic.title, comic._id) })} />
              </Animated.View>
            ) : null}
          </>
        )}
      </CutBox>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.margin, paddingTop: 12 },
  card: { padding: 16, gap: 12 },
  heading: { fontFamily: type.displaySm.fontFamily, fontSize: 24, color: colors.text.hi },
  question: { ...type.title, fontSize: 20, color: colors.text.hi },
  body: { ...type.body, color: colors.text.mid },
  option: { paddingHorizontal: 14, paddingVertical: 12, alignItems: "flex-start" },
  optionText: { ...type.button, color: colors.text.hi },
  optionOnColor: { color: colors.text.onNeon },
  result: { gap: 12, paddingTop: 4 },
  line: { ...type.body, color: colors.text.mid },
  lineRight: { fontFamily: type.displaySm.fontFamily, fontSize: 28, color: colors.neon.lime },
});
