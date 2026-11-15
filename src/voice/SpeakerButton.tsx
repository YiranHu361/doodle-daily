import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CutButton } from "../components/shapes";
import { colors, cut, type } from "../theme";
import { toggleVoice, useVoiceSetting } from "./setting";

export const AI_VOICE_NOTE = "Newsie's voice is AI-generated.";

function SpeakerIcon({ color, on }: { color: string; on: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Path d="M3 7.5 H6.5 L11 4 V16 L6.5 12.5 H3 Z" fill={color} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      {on ? (
        <Path d="M13.5 7 Q15.5 10 13.5 13 M15.8 5 Q19 10 15.8 15" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      ) : (
        <Path d="M13.5 7.5 L18 12.5 M18 7.5 L13.5 12.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      )}
    </Svg>
  );
}

export function SpeakerButton({ color }: { color: string }) {
  const voice = useVoiceSetting();
  const [showNote, setShowNote] = useState(false);
  const note = voice.on ? (voice.notice ?? (showNote ? AI_VOICE_NOTE : null)) : null;
  useEffect(() => {
    if (!showNote) return;
    const t = setTimeout(() => setShowNote(false), 4000);
    return () => clearTimeout(t);
  }, [showNote]);
  return (
    <View>
      <CutButton
        testID="speakerButton"
        accessibilityRole="switch"
        accessibilityLabel="Read aloud"
        accessibilityState={{ checked: voice.on, disabled: !voice.loaded }}
        disabled={!voice.loaded}
        onPress={() => {
          if (toggleVoice().firstTime) setShowNote(true);
        }}
        cut={cut.chip}
        fill={colors.surface[2]}
        stroke={voice.on ? color : colors.line.dim}
        glow={voice.on ? color : null}
        boxStyle={styles.box}
      >
        <SpeakerIcon color={voice.on ? color : colors.text.mid} on={voice.on} />
      </CutButton>
      {note ? (
        <View style={styles.noteWrap} pointerEvents="none">
          <Text testID="voiceNote" style={styles.note} accessibilityLiveRegion="polite">
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 44, height: 44 },
  noteWrap: { position: "absolute", top: 50, right: 0, width: 260, alignItems: "flex-end", zIndex: 10 },
  note: {
    ...type.meta,
    color: colors.text.hi,
    backgroundColor: colors.surface[2],
    borderColor: colors.line.bright,
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
  },
});
