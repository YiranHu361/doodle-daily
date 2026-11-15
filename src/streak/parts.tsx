import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors, cut as cuts, glow as glowTokens, type } from "../theme";
import { heatColor, type DayCell, type MonthGrid as MonthGridData } from "./model";

export function cutPath(w: number, h: number, c: number, inset: number): string {
  const i = inset;
  return `M${c} ${i} L${w - i} ${i} L${w - i} ${h - c} L${w - c} ${h - i} L${i} ${h - i} L${i} ${c} Z`;
}

export function CutBox({
  cut = cuts.button,
  fill = "transparent",
  stroke = colors.line.dim,
  strokeWidth = glowTokens.stroke,
  glow,
  style,
  children,
}: {
  cut?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  glow?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
  };
  const glowStyle: ViewStyle | null = glow
    ? { shadowColor: glow, shadowOpacity: glowTokens.opacity, shadowRadius: glowTokens.blur, shadowOffset: { width: 0, height: 0 } }
    : null;
  return (
    <View onLayout={onLayout} style={style}>
      {size ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={size.w} height={size.h}>
            <Path d={cutPath(size.w, size.h, cut, strokeWidth / 2)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
          </Svg>
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Bolt({ size = 18, color = colors.neon.volt }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M14 1.5 L3.5 14 H11 L9.5 22.5 L20.5 9.5 H13 Z" fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
    </Svg>
  );
}

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function cellLabel(cell: DayCell, name: string): string {
  const state = cell.cleared ? `cleared, ${cell.comics} ${cell.comics === 1 ? "comic" : "comics"}` : cell.frozen ? "frozen" : cell.isFuture ? "coming up" : "not cleared";
  return `${name}${cell.isToday ? ", today" : ""}, ${state}`;
}

export function WeekStrip({ cells, holdToday = false, size = 36 }: { cells: DayCell[]; holdToday?: boolean; size?: number }) {
  return (
    <View style={styles.week} testID="weekStrip">
      {cells.map((cell, i) => {
        const lit = cell.cleared && !(holdToday && cell.isToday);
        return (
          <View key={cell.day} style={styles.weekCol} accessible accessibilityLabel={cellLabel(cell, WEEKDAY_NAMES[i])}>
            <Text style={[styles.weekLetter, cell.isToday && { color: colors.text.hi }]}>{LETTERS[i]}</Text>
            <CutBox
              cut={cuts.chip}
              fill={colors.heat.none}
              stroke={cell.isToday ? colors.line.bright : cell.frozen ? colors.neon.cyan : colors.heat.noneBorder}
              style={[{ width: size, height: size }, cell.isFuture && styles.future]}
            >
              {lit ? (
                <Animated.View entering={cell.isToday ? ZoomIn.springify().damping(12).stiffness(180) : undefined} style={StyleSheet.absoluteFill}>
                  <CutBox cut={cuts.chip} fill={colors.neon.volt} stroke={colors.neon.volt} glow={cell.isToday ? colors.neon.volt : null} style={[StyleSheet.absoluteFill, styles.center]}>
                    <Bolt size={size * 0.5} color={colors.text.onNeon} />
                  </CutBox>
                </Animated.View>
              ) : null}
            </CutBox>
          </View>
        );
      })}
    </View>
  );
}

export function MonthGrid({ grid, width }: { grid: MonthGridData; width: number }) {
  const gap = 6;
  const size = Math.floor((width - gap * 6) / 7);
  const blanks = Array.from({ length: grid.leading }, (_, i) => <View key={`b${i}`} style={{ width: size, height: size }} />);
  return (
    <View testID="monthGrid">
      <View style={[styles.monthRow, { gap }]}>
        {LETTERS.map((l, i) => (
          <Text key={i} style={[styles.weekLetter, { width: size, textAlign: "center" }]}>{l}</Text>
        ))}
      </View>
      <View style={[styles.monthRow, { gap, flexWrap: "wrap", marginTop: 6 }]}>
        {blanks}
        {grid.cells.map((cell) => {
          const fill = heatColor(cell.heat);
          return (
            <View
              key={cell.day}
              testID={`monthCell_${cell.dayOfMonth}`}
              accessible
              accessibilityLabel={cellLabel(cell, `${cell.dayOfMonth}`)}
              style={[{ width: size, height: size }, cell.isFuture && styles.future]}
            >
              <CutBox
                cut={cuts.chip}
                fill={fill}
                stroke={cell.cleared ? fill : cell.frozen ? colors.neon.cyan : cell.isToday ? colors.line.bright : colors.heat.noneBorder}
                glow={cell.cleared && cell.heat === 3 ? colors.neon.volt : null}
                style={[StyleSheet.absoluteFill, styles.monthCell]}
              >
                <Text style={[styles.monthNum, { color: cell.cleared ? colors.text.onNeon : cell.isToday ? colors.text.hi : colors.text.low }]}>
                  {cell.dayOfMonth}
                </Text>
                {cell.cleared ? (
                  <View style={styles.monthBolt}>
                    <Bolt size={Math.max(10, size * 0.32)} color={colors.text.onNeon} />
                  </View>
                ) : cell.frozen ? (
                  <Text style={styles.frozen}>*</Text>
                ) : null}
              </CutBox>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  week: { flexDirection: "row", justifyContent: "space-between" },
  weekCol: { alignItems: "center", gap: 6 },
  weekLetter: { ...type.meta, color: colors.text.low },
  future: { opacity: 0.55 },
  monthRow: { flexDirection: "row" },
  monthCell: { padding: 4 },
  monthNum: { ...type.meta, fontSize: 12 },
  monthBolt: { position: "absolute", right: 3, bottom: 3 },
  frozen: { position: "absolute", right: 4, bottom: 0, color: colors.neon.cyan, ...type.meta },
});
