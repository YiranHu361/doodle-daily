import { View } from "react-native";
import { colors } from "../theme";

export type RoboPose = "idle" | "cheer" | "drawing" | "sleepy" | "glitch";

export function Robo({ pose = "idle", size = 64 }: { pose?: RoboPose; size?: number }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Robo, ${pose}`}
      style={{ width: size, height: size, backgroundColor: colors.robo.body }}
    />
  );
}
