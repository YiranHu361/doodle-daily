import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { CutBox, CutButton } from "../components/shapes";
import { colors, cut, space, type } from "../theme";

export function BillingSheet({ visible, onClose, testID, children }: { visible: boolean; onClose: () => void; testID: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View testID={testID} accessibilityViewIsModal style={[styles.sheet, { maxHeight: height * 0.92, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetHeader({ title, line, art, onClose, closeTestID }: { title: string; line?: string; art?: ReactNode; onClose: () => void; closeTestID?: string }) {
  return (
    <View style={styles.header}>
      {art}
      <View style={styles.headerText}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {line ? <Text style={styles.line}>{line}</Text> : null}
      </View>
      <Pressable testID={closeTestID} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
        <CutBox cut={cut.chip} fill={colors.surface[2]} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </CutBox>
      </Pressable>
    </View>
  );
}

export function QuietLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="link" hitSlop={8} style={styles.quiet}>
      <Text style={styles.quietText}>{label}</Text>
    </Pressable>
  );
}

export function SmallButton({ label, onPress, testID, icon }: { label: string; onPress: () => void; testID?: string; icon?: ReactNode }) {
  return (
    <CutButton testID={testID} accessibilityLabel={label} onPress={onPress} cut={cut.button} fill={colors.surface[2]} stroke={colors.line.bright} boxStyle={styles.small}>
      <View style={styles.row}>
        {icon}
        <Text style={styles.smallText}>{label}</Text>
      </View>
    </CutButton>
  );
}

export function PencilIcon({ color = colors.neon.volt, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 20 L5 15 L16 4 L20 8 L9 19 Z M14 6 L18 10" stroke={color} strokeWidth={2} strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function CrownIcon({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.7} viewBox="0 0 40 28">
      <Path d="M3 25 L6 8 L14 16 L20 3 L26 16 L34 8 L37 25 Z" fill={colors.neon.volt} stroke={colors.ink} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7,5,26,0.6)" },
  sheet: { flexShrink: 1, backgroundColor: colors.surface[1], borderTopWidth: 1.5, borderColor: colors.line.bright, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line.dim, marginTop: 8 },
  body: { padding: 24, paddingTop: 16, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1, gap: 2 },
  title: { ...type.title, color: colors.text.hi },
  line: { ...type.body, fontSize: 15, color: colors.text.mid },
  close: { width: space.touch, height: space.touch, alignItems: "center", justifyContent: "center" },
  closeText: { ...type.title, color: colors.text.hi, lineHeight: 28 },
  quiet: { alignSelf: "center", paddingVertical: 6 },
  quietText: { ...type.chip, color: colors.text.mid, textDecorationLine: "underline" },
  small: { minHeight: 52, paddingHorizontal: 14 },
  smallText: { ...type.button, color: colors.text.hi },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
