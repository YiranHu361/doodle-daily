import { memo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { colors } from "../theme";

export const GridBackground = memo(function GridBackground() {
  const { width, height } = useWindowDimensions();
  const step = 28;
  const xs = Array.from({ length: Math.ceil(width / step) + 1 }, (_, i) => i * step);
  const ys = Array.from({ length: Math.ceil(height / step) + 1 }, (_, i) => i * step);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg.night }]} pointerEvents="none">
      <Svg width={width} height={height}>
        {xs.map((x) => (
          <Line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} stroke={colors.bg.grid} strokeWidth={1} />
        ))}
        {ys.map((y) => (
          <Line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} stroke={colors.bg.grid} strokeWidth={1} />
        ))}
      </Svg>
    </View>
  );
});
