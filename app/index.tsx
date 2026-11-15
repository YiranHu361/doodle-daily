import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ComicCard } from "../src/components/ComicCard";
import { useToday } from "../src/data/useToday";
import { Robo } from "../src/robo/Robo";
import { ComboPill, ComboSheet } from "../src/streak/ui";
import { colors, space, type } from "../src/theme";

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function Today() {
  const today = useToday();
  const [sheet, setSheet] = useState(false);
  const edition = today.edition;

  const header = (
    <View style={styles.masthead}>
      <View style={styles.mastLeft}>
        {edition ? <Text style={styles.date}>{formatDate(edition.date)}</Text> : null}
        {edition ? <Text style={styles.issue}>ISSUE {edition.number}</Text> : null}
        <Text style={styles.doodle}>DOODLE</Text>
        <Text style={styles.daily}>DAILY</Text>
      </View>
      <View style={styles.mastRight}>
        <ComboPill onPress={() => setSheet(true)} />
        <Robo size={56} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {today.state === "ready" ? (
        <FlatList
          testID="todayList"
          data={today.edition.comics}
          keyExtractor={(c) => c._id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.gap }} />}
          renderItem={({ item, index }) => <ComicCard comic={item} index={index} />}
          ListFooterComponent={<Text style={styles.footer}>That&apos;s the whole issue. Go outside.</Text>}
        />
      ) : (
        <View style={styles.list}>
          {header}
          {today.state === "loading" ? (
            <ActivityIndicator color={colors.neon.volt} accessibilityLabel="Loading" />
          ) : (
            <Text style={styles.footer}>Nothing here today</Text>
          )}
        </View>
      )}
      <ComboSheet visible={sheet} onClose={() => setSheet(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.night },
  list: { padding: space.margin, paddingBottom: 120 },
  masthead: { flexDirection: "row", justifyContent: "space-between", marginBottom: space.gap },
  mastLeft: { gap: 4 },
  mastRight: { alignItems: "flex-end", gap: 8 },
  date: { ...type.meta, color: colors.text.low },
  issue: { ...type.displaySm, fontSize: 14, color: colors.neon.volt, backgroundColor: colors.surface[2], alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2 },
  doodle: { ...type.displayMd, color: colors.paper, textDecorationLine: "underline", textDecorationColor: colors.neon.volt },
  daily: { ...type.displayMd, color: colors.text.hi, textShadowColor: colors.neon.cyan, textShadowRadius: 8 },
  footer: { ...type.body, color: colors.text.mid, textAlign: "center", marginTop: 32 },
});
