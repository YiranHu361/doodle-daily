import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Comic } from "../data/types";
import { colors, sectionColor, sectionLabel, space, type } from "../theme";

function Cover({ uri, size, label }: { uri: string | null; size: number | "full"; label: string }) {
  const box = size === "full" ? { width: "100%" as const, aspectRatio: 1 } : { width: size, height: size };
  return (
    <View style={[styles.paper, box]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityLabel={label} />
      ) : (
        <Text style={styles.scribble}>Sharpening crayons</Text>
      )}
    </View>
  );
}

function Tag({ section }: { section: Comic["section"] }) {
  return <Text style={[styles.tag, { color: sectionColor[section] }]}>{sectionLabel[section].toUpperCase()}</Text>;
}

export function ComicCard({ comic, index, onPress }: { comic: Comic; index: number; onPress?: () => void }) {
  const lead = index === 0;
  const cover = comic.panels[0];
  return (
    <Pressable
      testID={`comicCard_${index}`}
      accessibilityRole="button"
      accessibilityLabel={`${sectionLabel[comic.section]}: ${comic.title}`}
      onPress={onPress}
      style={[lead ? styles.lead : styles.row, { borderColor: lead ? sectionColor[comic.section] : colors.line.dim }]}
    >
      <Cover uri={cover.imageUrl} size={lead ? "full" : 96} label={cover.scene} />
      <View style={lead ? styles.leadText : styles.rowText}>
        <Tag section={comic.section} />
        <Text style={styles.title}>{comic.title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lead: { backgroundColor: colors.surface[1], borderWidth: 1.5, padding: 12, gap: 12 },
  row: { backgroundColor: colors.surface[1], borderWidth: 1, padding: 12, flexDirection: "row", gap: space.gap, alignItems: "center" },
  leadText: { gap: 4 },
  rowText: { flex: 1, gap: 4 },
  paper: { backgroundColor: colors.paper, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  scribble: { ...type.meta, color: colors.ink },
  tag: { ...type.chip },
  title: { ...type.title, color: colors.text.hi },
});
