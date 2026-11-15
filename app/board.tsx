import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useReducedMotion } from "../src/components/a11y";
import { GridBackground } from "../src/components/GridBackground";
import { BackIcon } from "../src/components/icons";
import { CutBox, CutButton } from "../src/components/shapes";
import { SkeletonList } from "../src/components/Skeleton";
import { EmptyState } from "../src/components/States";
import { PrimaryButton } from "../src/components/ui";
import { BillingSheet, SheetHeader } from "../src/billing/Sheet";
import { useBoard } from "../src/quiz/hooks";
import { colors, cut, space, type } from "../src/theme";

type Row = { key: string; rank: number | null; name: string; points: number; streak: number; me: boolean };

function BoardRow({ row, onPress, reduce }: { row: Row; onPress?: () => void; reduce: boolean }) {
  return (
    <Animated.View layout={reduce ? undefined : LinearTransition.springify().damping(18)}>
      <Pressable
        testID={row.me ? "boardMe" : undefined}
        disabled={!onPress}
        onPress={onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={`${row.rank ? `Rank ${row.rank}` : "Not ranked yet"}, ${row.name}${row.me ? " (you, tap to rename)" : ""}, ${row.points} points, ${row.streak} day streak`}
      >
        <CutBox cut={cut.chip} fill={row.me ? colors.surface[3] : colors.surface[1]} stroke={row.me ? colors.neon.volt : colors.line.dim} style={styles.row}>
          <Text style={styles.rank}>{row.rank ?? "-"}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
            {row.me ? <Text style={styles.you}> (you)</Text> : null}
          </Text>
          <Text style={styles.points}>{row.points}</Text>
          <Text style={styles.streak}>{row.streak}d</Text>
        </CutBox>
      </Pressable>
    </Animated.View>
  );
}

export default function Board() {
  const reduce = useReducedMotion();
  const { board, changeName } = useBoard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openRename = () => {
    setDraft(board?.me.name ?? "");
    setError(null);
    setEditing(true);
  };
  const save = async () => {
    try {
      const r = await changeName(draft);
      if (!r) return;
      if (r.ok) setEditing(false);
      else setError(r.reason === "bad_name" ? "Pick 2 to 16 characters." : "Robo would rather you picked another name.");
    } catch {
      setError("Could not save that. Try again.");
    }
  };

  const meInTop = board?.rows.some((r) => r.me);
  return (
    <View style={styles.flex}>
      <GridBackground />
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <CutButton testID="backButton" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} cut={cut.chip} fill={colors.surface[2]} stroke={colors.line.dim} boxStyle={styles.back}>
            <BackIcon />
          </CutButton>
          <Text style={styles.title} accessibilityRole="header">
            Today&apos;s board
          </Text>
        </View>
        <View style={styles.legend}>
          <Text style={[styles.legendText, styles.rank]}>#</Text>
          <Text style={[styles.legendText, styles.name]}>Name</Text>
          <Text style={[styles.legendText, styles.points]}>Pts</Text>
          <Text style={[styles.legendText, styles.streak]}>Streak</Text>
        </View>
        {board === undefined ? (
          <SkeletonList />
        ) : (
          <ScrollView contentContainerStyle={styles.list} testID="boardList">
            {!board || board.rows.length === 0 ? <EmptyState title="Nobody has answered yet today" line="Finish a comic and answer its quick question to get on the board." /> : null}
            {board?.rows.map((r) => <BoardRow key={r.key} row={r} reduce={reduce} onPress={r.me ? openRename : undefined} />)}
          </ScrollView>
        )}
        {board && !meInTop ? (
          <View style={styles.pinned}>
            <BoardRow row={{ key: "me", me: true, ...board.me }} reduce={reduce} onPress={openRename} />
          </View>
        ) : null}
      </SafeAreaView>
      <BillingSheet visible={editing} onClose={() => setEditing(false)} testID="renameSheet">
        <SheetHeader title="Your board name" line="2 to 16 characters." onClose={() => setEditing(false)} />
        <TextInput
          testID="renameInput"
          value={draft}
          onChangeText={setDraft}
          maxLength={16}
          autoFocus
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          style={styles.input}
          placeholderTextColor={colors.text.low}
          accessibilityLabel="Board name"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton testID="renameSave" label="Save" onPress={() => void save()} />
      </BillingSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space.margin, paddingVertical: 8 },
  back: { width: 44, height: 44 },
  title: { ...type.displaySm, color: colors.text.hi },
  legend: { flexDirection: "row", paddingHorizontal: space.margin + 12, paddingBottom: 6 },
  legendText: { ...type.meta, color: colors.text.low },
  list: { paddingHorizontal: space.margin, gap: 6, paddingBottom: 24 },
  pinned: { paddingHorizontal: space.margin, paddingTop: 8, borderTopWidth: 1, borderColor: colors.line.dim },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, minHeight: 48 },
  rank: { width: 36, fontFamily: type.displaySm.fontFamily, fontSize: 16, color: colors.text.hi },
  name: { flex: 1, ...type.button, color: colors.text.hi },
  you: { ...type.meta, color: colors.neon.volt },
  points: { width: 52, textAlign: "right", fontFamily: type.displaySm.fontFamily, fontSize: 16, color: colors.neon.volt },
  streak: { width: 60, textAlign: "right", ...type.chip, color: colors.text.mid },
  input: { ...type.body, color: colors.text.hi, backgroundColor: colors.surface[2], borderWidth: 1, borderColor: colors.line.bright, paddingHorizontal: 12, paddingVertical: 10 },
  error: { ...type.meta, color: colors.state.error },
});
