import { useAction, useMutation } from "convex/react";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type RecordingOptions } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CutButton } from "../../components/shapes";
import { colors, cut, type } from "../../theme";
import { audioContentType, CLIP_MAX_MS, clipTimer, decodeTranscript, micLevel } from "../promoteLogic";

const CLIP_MAX_BYTES = 2 * 1024 * 1024;
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true };
const REFUSED = "Robo can't hear you: the microphone is off for Doodle Daily. Turn it on in Settings, or just type.";

export function MicButton({
  deviceId,
  disabled,
  onBusy,
  onText,
  onError,
}: {
  deviceId: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 200);
  const uploadUrl = useMutation(api.promote.audioUploadUrl);
  const transcribe = useAction(api.promote.transcribe);
  const [working, setWorking] = useState(false);
  const stopping = useRef(false);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(
    () => () => {
      if (limit.current) clearTimeout(limit.current);
    },
    [],
  );

  const send = async (uri: string) => {
    setWorking(true);
    onBusy(true);
    try {
      const blob = await (await fetch(uri)).blob();
      if (blob.size > CLIP_MAX_BYTES) return onError("That clip is too long. Try a shorter one, or type.");
      const url = await uploadUrl({ deviceId });
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": audioContentType(uri) }, body: blob });
      if (!res.ok) throw new Error("upload");
      const { storageId } = (await res.json()) as { storageId: string };
      const out = decodeTranscript(await transcribe({ deviceId, storageId: storageId as Id<"_storage"> }));
      if (out.kind === "error") return onError(out.message);
      if (!out.text) return onError("Robo didn't catch any words. Try again, or type.");
      onText(out.text);
    } catch {
      onError("Robo couldn't hear that clip. Try again, or type.");
    } finally {
      setWorking(false);
      onBusy(false);
    }
  };

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    if (limit.current) clearTimeout(limit.current);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      if (recorder.uri) await send(recorder.uri);
    } catch {
      onError("Robo couldn't hear that clip. Try again, or type.");
    } finally {
      stopping.current = false;
    }
  };

  useEffect(() => {
    stopRef.current = stop;
  });

  const start = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return onError(REFUSED);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      limit.current = setTimeout(() => void stopRef.current(), CLIP_MAX_MS);
    } catch {
      onError("The microphone isn't available right now. You can type instead.");
    }
  };

  const recording = state.isRecording;

  const level = micLevel(state.metering);
  return (
    <View style={styles.wrap}>
      <CutButton
        testID="promoMic"
        accessibilityLabel={recording ? "Stop recording" : working ? "Robo is listening to your clip" : "Tell Robo by voice"}
        accessibilityState={{ disabled: disabled || working, busy: working }}
        disabled={(disabled || working) && !recording}
        onPress={() => void (recording ? stop() : start())}
        cut={cut.button}
        fill={recording ? colors.state.error : colors.surface[2]}
        stroke={recording ? colors.state.error : colors.line.bright}
        boxStyle={styles.button}
      >
        {recording ? <StopIcon /> : <MicIcon color={working ? colors.text.low : colors.neon.volt} />}
      </CutButton>
      {recording ? (
        <View style={styles.meter} accessibilityLiveRegion="polite" accessible accessibilityLabel={`Recording, ${Math.floor(state.durationMillis / 1000)} seconds of 60`}>
          <Text style={styles.time}>{clipTimer(state.durationMillis)}</Text>
          <View style={styles.track}>
            <View style={[styles.level, { width: `${Math.round(Math.max(0.06, level) * 100)}%` }]} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MicIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x={9} y={3} width={6} height={11} rx={3} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M5 11 a7 7 0 0 0 14 0 M12 18 V21 M8 21 H16" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function StopIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={5} y={5} width={14} height={14} rx={2} fill={colors.text.hi} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 4 },
  button: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  meter: { alignItems: "center", gap: 3, width: 48 },
  time: { ...type.meta, color: colors.text.hi },
  track: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.surface[3], overflow: "hidden" },
  level: { height: 4, backgroundColor: colors.state.error },
});
