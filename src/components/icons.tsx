import Svg, { Circle, Line, Path, Polygon, Rect } from "react-native-svg";
import type { ReactionKind } from "../data/types";
import { colors } from "../theme";

export function CloseIcon({ color = colors.text.hi, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Line x1={3} y1={3} x2={15} y2={15} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={15} y1={3} x2={3} y2={15} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function BackIcon({ color = colors.text.hi, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M11 3 L5 9 L11 15" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ShareIcon({ color = colors.text.hi, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M9 2 V11 M5 6 L9 2 L13 6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 9 V15 H14 V9" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

export function CompassIcon({ color = colors.text.hi, size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      <Circle cx={11} cy={11} r={9} stroke={color} strokeWidth={2} fill="none" />
      <Polygon points="11,4 13.5,11 11,18 8.5,11" fill={color} />
    </Svg>
  );
}

export function LockIcon({ color = colors.text.low, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M5 8 V6 A4 4 0 0 1 13 6 V8" stroke={color} strokeWidth={2} fill="none" />
      <Rect x={3} y={8} width={12} height={8} fill={color} />
    </Svg>
  );
}

export function RoboFace({ kind, size = 26, color = colors.robo.body }: { kind: ReactionKind; size?: number; color?: string }) {
  const eyes = colors.robo.eyes;
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Line x1={13} y1={1} x2={13} y2={5} stroke={colors.neon.volt} strokeWidth={1.6} />
      <Circle cx={13} cy={2} r={1.8} fill={colors.neon.volt} />
      <Rect x={2} y={5} width={22} height={19} rx={4} fill={color} />
      <Rect x={5} y={8} width={16} height={13} rx={3} fill={colors.robo.screen} />
      {kind === "lol" ? (
        <>
          <Path d="M8 13 Q9.5 11 11 13" stroke={eyes} strokeWidth={1.5} fill="none" />
          <Path d="M15 13 Q16.5 11 18 13" stroke={eyes} strokeWidth={1.5} fill="none" />
          <Path d="M8.5 15.5 Q13 21 17.5 15.5 Z" fill={eyes} />
        </>
      ) : kind === "wow" ? (
        <>
          <Circle cx={9.5} cy={12.5} r={2} fill={eyes} />
          <Circle cx={16.5} cy={12.5} r={2} fill={eyes} />
          <Circle cx={13} cy={17.5} r={1.8} stroke={eyes} strokeWidth={1.4} fill="none" />
        </>
      ) : (
        <>
          <Line x1={8} y1={12} x2={11} y2={13} stroke={eyes} strokeWidth={1.6} />
          <Line x1={18} y1={12} x2={15} y2={13} stroke={eyes} strokeWidth={1.6} />
          <Path d="M8.5 17.5 L10.5 16 L12.5 17.5 L14.5 16 L16.5 17.5" stroke={eyes} strokeWidth={1.4} fill="none" />
        </>
      )}
    </Svg>
  );
}
