import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Robo } from "../robo/Robo";
import { colors, type } from "../theme";
import { copy } from "../theme/copy";
import { PrimaryButton } from "./ui";

export function EmptyState({ title, line, pose = "sleepy", testID }: { title: string; line?: string; pose?: "sleepy" | "idle"; testID?: string }) {
  return (
    <View style={styles.box} testID={testID}>
      <Robo pose={pose} size={96} />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {line ? <Text style={styles.line}>{line}</Text> : null}
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.box} testID="errorState">
      <Robo pose="glitch" size={96} />
      <Text style={styles.title} accessibilityRole="header">
        {copy.errorTitle}
      </Text>
      <PrimaryButton testID="retryButton" label={copy.tryAgain} onPress={onRetry} />
    </View>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  retry = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));

  render() {
    if (this.state.failed) return <ErrorState onRetry={this.retry} />;
    return <View key={this.state.attempt} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

const styles = StyleSheet.create({
  box: { alignItems: "center", gap: 14, paddingVertical: 40, paddingHorizontal: 24 },
  title: { ...type.displaySm, color: colors.text.hi, textAlign: "center" },
  line: { ...type.body, color: colors.text.mid, textAlign: "center" },
});
