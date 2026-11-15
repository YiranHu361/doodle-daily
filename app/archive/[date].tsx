import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ComicCard } from "../../src/components/ComicCard";
import { GridBackground } from "../../src/components/GridBackground";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { SkeletonList } from "../../src/components/Skeleton";
import { EmptyState, ErrorBoundary, ErrorState } from "../../src/components/States";
import { Banner } from "../../src/components/ui";
import { formatIssueDate } from "../../src/data/clock";
import { restartColdStartWindow } from "../../src/data/connectionHooks";
import { useEditionByDate } from "../../src/data/hooks";
import { isRead, useCombo } from "../../src/streak";
import { space } from "../../src/theme";
import { copy } from "../../src/theme/copy";

function Issue() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const issue = useEditionByDate(date ?? null);
  useCombo();
  const edition = issue.kind === "ready" ? issue.data : null;

  let body: React.ReactNode;
  if (issue.kind === "loading") body = <SkeletonList />;
  else if (issue.kind === "error") body = <ErrorState onRetry={restartColdStartWindow} />;
  else if (!edition || edition.comics.length === 0) body = <EmptyState title={copy.emptySection} />;
  else
    body = edition.comics.map((c, i) => (
      <ComicCard
        key={c._id}
        comic={c}
        index={i}
        lead={i === 0}
        read={isRead(c._id)}
        onPress={() => router.push({ pathname: "/reader/[comicId]", params: { comicId: c._id, date: edition.date } })}
      />
    ));

  return (
    <View style={styles.flex}>
      <GridBackground />
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ScreenHeader title={edition ? copy.issueTag(edition.number).replace("ISSUE", "Issue") : copy.backIssues} meta={date ? formatIssueDate(date) : undefined} onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.list}>
          {issue.kind === "ready" && issue.offline ? <Banner tone="offline" text={copy.offline} /> : null}
          {body}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export default function IssueScreen() {
  return (
    <ErrorBoundary>
      <Issue />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: space.margin, gap: space.gap, paddingBottom: 48 },
});
