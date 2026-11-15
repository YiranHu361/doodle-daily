import { useRef } from "react";
import { useWindowDimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { panelsDrawn } from "../data/filter";
import type { Comic } from "../data/types";
import { copy } from "../theme/copy";
import { colors, cut, sectionColor, sectionLabel, space, type } from "../theme";
import { useReducedMotion } from "./a11y";
import { launchFlight, measure, type ViewRef } from "./Flight";
import { CutBox } from "./shapes";
import { PaperSheet } from "./Paper";
import { PanelImage, Scribble } from "./PanelImage";
import { NewBadge, ReadStamp, SectionTag } from "./ui";

export function ComicCard({
  comic,
  index,
  lead,
  read,
  fresh,
  onPress,
}: {
  comic: Comic;
  index: number;
  lead: boolean;
  read: boolean;
  fresh?: boolean;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  const color = sectionColor[comic.section];
  const cover = comic.panels[0];
  const ready = comic.status === "ready";
  const drawing = !ready;
  const drawn = panelsDrawn(comic);
  const coverSize = lead ? width - space.margin * 2 - 24 - 16 : 96 - 12;
  const sublabel = drawing ? `${copy.drawingCard}, ${copy.panelsOf(drawn)}` : "";
  const reduce = useReducedMotion();
  const coverRef = useRef<ViewRef>(null);
  const press = async () => {
    const uri = cover.imageUrl;
    if (!reduce && ready && uri) {
      const rect = await measure(coverRef.current);
      if (rect) launchFlight(comic._id, uri, color, rect);
    }
    onPress();
  };
  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.duration(200)}>
      <Pressable
        testID={`comicCard_${index}`}
        accessibilityRole="button"
        accessibilityLabel={`${sectionLabel[comic.section]}: ${comic.title}${read ? ", read" : ""}${comic.kind === "commission" ? ", commissioned" : comic.isNew ? ", new" : ""}${sublabel ? `, ${sublabel}` : ""}`}
        onPress={() => void press()}
      >
        <CutBox
          cut={cut.card}
          fill={colors.surface[1]}
          stroke={drawing && fresh ? colors.neon.volt : lead ? color : colors.line.dim}
          dashed={drawing && fresh}
          glow={lead && ready ? color : null}
          style={lead ? styles.lead : styles.row}
        >
          <PaperSheet backlight={color} seed={index + 3} padding={lead ? 8 : 6} backlightRadius={lead ? 16 : 8}>
            <View ref={coverRef} collapsable={false}>
              <PanelImage uri={cover.imageUrl} size={coverSize} label={cover.scene || comic.title} placeholderLabel={copy.drawingCard} />
            </View>
          </PaperSheet>
          <View style={lead ? styles.leadText : styles.rowText}>
            <SectionTag section={comic.section} />
            <Text style={lead ? styles.leadTitle : styles.rowTitle}>{comic.title}</Text>
            {drawing ? (
              <Text style={styles.meta}>
                {copy.drawingCard} · {copy.panelsOf(drawn)}
              </Text>
            ) : null}
          </View>
          {read ? <ReadStamp /> : null}
          {comic.kind === "commission" ? <NewBadge label="COMMISSIONED" /> : comic.isNew ? <NewBadge /> : null}
        </CutBox>
      </Pressable>
    </Animated.View>
  );
}

export function DrawingCard() {
  return (
    <Animated.View entering={FadeIn.duration(200)} accessible accessibilityLabel={`${copy.drawingCard}, ${copy.panelsOf(0)}`}>
      <CutBox cut={cut.card} fill={colors.surface[1]} stroke={colors.neon.volt} dashed style={styles.row}>
        <PaperSheet seed={99} padding={6} backlight={colors.neon.volt} backlightRadius={8}>
          <Scribble size={84} />
        </PaperSheet>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{copy.drawingCard}</Text>
          <Text style={styles.meta}>{copy.panelsOf(0)}</Text>
        </View>
      </CutBox>
    </Animated.View>
  );
}

export function SkeletonCard({ lead }: { lead: boolean }) {
  return (
    <CutBox cut={cut.card} fill={colors.surface[1]} stroke={colors.line.dim} style={lead ? styles.lead : styles.row}>
      <View style={[styles.skel, lead ? { aspectRatio: 1, width: "100%" } : { width: 96, height: 96 }]} />
      <View style={lead ? styles.leadText : styles.rowText}>
        <View style={[styles.skel, { width: 70, height: 16 }]} />
        <View style={[styles.skel, { width: "80%", height: 22 }]} />
      </View>
    </CutBox>
  );
}

const styles = StyleSheet.create({
  lead: { padding: 12, gap: 14 },
  row: { padding: 10, flexDirection: "row", gap: 14, alignItems: "center" },
  leadText: { gap: 8, paddingBottom: 4 },
  rowText: { flex: 1, gap: 6 },
  leadTitle: { ...type.title, color: colors.text.hi },
  rowTitle: { ...type.title, fontSize: 19, lineHeight: 24, color: colors.text.hi },
  meta: { ...type.meta, color: colors.text.low },
  skel: { backgroundColor: colors.surface[2] },
});
