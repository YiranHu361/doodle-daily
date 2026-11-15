import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PaywallSheet } from "../../src/billing";
import { GridBackground } from "../../src/components/GridBackground";
import { LockIcon } from "../../src/components/icons";
import { PaperSheet } from "../../src/components/Paper";
import { PanelImage } from "../../src/components/PanelImage";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { CutBox } from "../../src/components/shapes";
import { SkeletonList } from "../../src/components/Skeleton";
import { EmptyState, ErrorBoundary, ErrorState } from "../../src/components/States";
import { Banner } from "../../src/components/ui";
import { formatIssueDate } from "../../src/data/clock";
import { restartColdStartWindow } from "../../src/data/connectionHooks";
import { useEditionList, useToday } from "../../src/data/hooks";
import type { EditionSummary } from "../../src/data/types";
import { colors, cut, space, type } from "../../src/theme";
import { copy } from "../../src/theme/copy";

function Row({ issue, index, onPress }: { issue: EditionSummary; index: number; onPress: () => void }) {
  const count = `${issue.comicCount} ${issue.comicCount === 1 ? "comic" : "comics"}`;
  return (
    <Pressable
      testID={`archiveRow_${index}`}
      accessibilityRole="button"
      accessibilityLabel={`Issue ${issue.number}, ${formatIssueDate(issue.date)}, ${count}${issue.locked ? ", locked" : ""}`}
      onPress={onPress}
    >
      <CutBox cut={cut.card} fill={colors.surface[1]} stroke={colors.line.dim} style={styles.row}>
        <PaperSheet seed={issue.number} padding={5} backlight={colors.neon.volt} backlightRadius={6}>
          <PanelImage uri={issue.coverUrl} size={64} label={`Cover of issue ${issue.number}`} />
        </PaperSheet>
        <View style={styles.text}>
          <Text style={styles.date}>{formatIssueDate(issue.date)}</Text>
          <Text style={styles.title}>Issue {issue.number}</Text>
          <Text style={styles.meta}>{count}</Text>
        </View>
        {issue.locked ? <LockIcon /> : null}
      </CutBox>
    </Pressable>
  );
}

function BackIssues() {
  const list = useEditionList();
  const today = useToday();
  const [paywall, setPaywall] = useState(false);
  const [, setRetry] = useState(0);
  const current = today.kind === "ready" ? today.data : null;
  const past = list.kind === "ready" ? list.data.filter((s) => s._id !== current?._id) : [];

  let body: React.ReactNode;
  if (list.kind === "loading") body = <SkeletonList />;
  else if (list.kind === "error")
    body = (
      <ErrorState
        onRetry={() => {
          restartColdStartWindow();
          setRetry((n) => n + 1);
        }}
      />
    );
  else if (past.length === 0)
    body = <EmptyState testID="archiveEmpty" pose="sleepy" title={copy.noBackIssues} line={current ? copy.noBackIssuesLine(current.number) : undefined} />;
  else
    body = past.map((issue, i) => (
      <Row
        key={issue._id}
        issue={issue}
        index={i}
        onPress={() => (issue.locked ? setPaywall(true) : router.push({ pathname: "/archive/[date]", params: { date: issue.date } }))}
      />
    ));

  return (
    <View style={styles.flex}>
      <GridBackground />
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ScreenHeader title={copy.backIssues} onBack={() => router.back()} />
        <ScrollView testID="archiveList" contentContainerStyle={styles.list}>
          {list.kind === "ready" && list.offline ? <Banner tone="offline" text={copy.offline} /> : null}
          {body}
        </ScrollView>
      </SafeAreaView>
      <PaywallSheet visible={paywall} onClose={() => setPaywall(false)} />
    </View>
  );
}

export default function BackIssuesScreen() {
  return (
    <ErrorBoundary>
      <BackIssues />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: space.margin, gap: space.gap, paddingBottom: 48 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 10 },
  text: { flex: 1, gap: 2 },
  date: { ...type.meta, color: colors.text.low },
  title: { ...type.title, fontSize: 20, color: colors.text.hi },
  meta: { ...type.meta, color: colors.text.mid },
});
