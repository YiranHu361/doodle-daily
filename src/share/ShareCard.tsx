import { useEffect, useRef, useState, type ComponentRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PanelImage } from "../components/PanelImage";
import type { Comic } from "../data/types";
import { colors, fonts, sectionColor, sectionLabel } from "../theme";
import { shareLayout } from "./layout";

export const SHARE_LOGICAL_WIDTH = 360;
const LATE_PANEL_WAIT_MS = 8_000;

export function ShareCard({ comic, onReady }: { comic: Comic; onReady: (view: ComponentRef<typeof View>, size: { width: number; height: number }) => void }) {
  const layout = shareLayout(comic.panels.length);
  const s = SHARE_LOGICAL_WIDTH / layout.width;
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [expired, setExpired] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setExpired(true), LATE_PANEL_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  const allDrawn = comic.panels.every((p, i) => p.imageUrl !== null && loaded.has(i));
  useEffect(() => {
    if (fired.current || !ref.current || !(allDrawn || expired)) return;
    fired.current = true;
    const view = ref.current;
    const t = setTimeout(() => onReady(view, { width: layout.width, height: layout.height }), 120);
    return () => clearTimeout(t);
  }, [allDrawn, expired, onReady, layout.width, layout.height]);

  const panel = Math.round(layout.panelSize * s);
  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      style={[styles.card, { width: SHARE_LOGICAL_WIDTH, height: layout.height * s, padding: layout.padding * s }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ height: layout.titleHeight * s, justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.uiSemiBold, fontSize: 36 * s, color: sectionColor[comic.section] }} allowFontScaling={false}>
          {sectionLabel[comic.section].toUpperCase()}
        </Text>
        <Text style={{ fontFamily: fonts.uiSemiBold, fontSize: layout.titleFont * s, lineHeight: layout.titleFont * s * 1.15, color: colors.text.hi }} allowFontScaling={false} numberOfLines={2}>
          {comic.title}
        </Text>
      </View>
      {comic.panels.map((p, i) => (
        <View key={i} style={[styles.sheet, { marginBottom: layout.gap * s, padding: 0 }]}>
          <PanelImage
            uri={p.imageUrl}
            size={panel}
            label={p.scene}
            onLoad={() => setLoaded((prev) => new Set(prev).add(i))}
            style={{ borderRadius: 0 }}
          />
          <View style={{ height: layout.captionHeight * s, justifyContent: "center", paddingHorizontal: 16 * s }}>
            <Text style={{ fontFamily: fonts.caption, fontSize: layout.captionFont * s, lineHeight: layout.captionFont * s * 1.2, color: colors.ink }} allowFontScaling={false} numberOfLines={3}>
              {p.caption}
            </Text>
          </View>
        </View>
      ))}
      <View style={{ height: layout.footerHeight * s, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontFamily: fonts.display, fontSize: layout.footerFont * s, color: colors.neon.volt }} allowFontScaling={false}>
          Doodle Daily
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", top: 0, left: 0, backgroundColor: colors.bg.night },
  sheet: { backgroundColor: colors.paper, overflow: "hidden" },
});
