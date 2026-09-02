import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, Image, Animated, Easing, Platform, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Download, Shield, X } from "lucide-react-native";
import { theme } from "../lib/theme";
import { useAuth } from "../context/AuthContext";

type Props = {
  latestVersion: string;
  releaseNotes?: string;
  playStoreUrl: string;
  forceUpdate: boolean;
  onDismiss?: () => void;
};

export default function UpdateGate({
  latestVersion, releaseNotes, playStoreUrl, forceUpdate, onDismiss,
}: Props) {
  const [pulse] = useState(new Animated.Value(0));
  const router = useRouter();
  const { adminLogin } = useAuth();
  const [adminModal, setAdminModal] = useState(false);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  // On web, the browser hijacks long-press on <Image> with its own image
  // context menu. Disable that and route the gesture to the TouchableOpacity.
  // NOTE: do NOT include a `style` key here — spreading this onto a component
  // with its own `style` prop would overwrite the button's background/text colors.
  const webNoContextMenu =
    Platform.OS === "web"
      ? ({
          // @ts-ignore — web-only DOM events through RN web's accessibility passthrough
          onContextMenu: (e: any) => e.preventDefault(),
          draggable: false,
        } as any)
      : {};
  const webNoSelectStyle =
    Platform.OS === "web"
      ? ({
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          outlineStyle: "none",
          outlineWidth: 0,
        } as any)
      : null;

  const submitAdmin = async () => {
    if (!email.trim() || !pwd.trim()) {
      toast.error("Required", { description: "Please enter both email and password." });
      return;
    }
    setBusy(true);
    try {
      await adminLogin(email.trim(), pwd);
      setAdminModal(false);
      setEmail(""); setPwd("");
      // Admin is now exempt from the gate (UpdateGateWrapper). Route to the admin
      // panel — mirrors the working Profile admin-login flow. From there the admin
      // can open "App Update" and turn force-update off.
      router.push("/admin");
    } catch (e: any) {
      toast.error("Login failed", { description: e?.message || "Invalid admin credentials." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="update-gate">
      <View style={styles.body}>
        <View
          style={styles.iconWrap}
          testID="update-logo-wrap"
        >
          <Image
            source={require("../../assets/images/splash-icon.png")}
            style={styles.icon}
            resizeMode="contain"
            // Block browser's image context menu so long-press on the button works on web.
            {...(Platform.OS === "web" ? ({ draggable: false, pointerEvents: "none" } as any) : {})}
          />
        </View>

        <Text style={styles.title}>New version available</Text>
        <Text style={styles.body2}>
          Please update TaskMint to {`v${latestVersion}`} from the Play Store to continue using the app.
        </Text>
        {!!releaseNotes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>What's new</Text>
            <Text style={styles.notesBody}>{releaseNotes}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.btn, webNoSelectStyle]}
          onPress={() => Linking.openURL(playStoreUrl)}
          onLongPress={() => setAdminModal(true)}
          delayLongPress={1500}
          testID="update-btn"
          activeOpacity={0.85}
          {...webNoContextMenu}
        >
          <Download size={20} color="#fff" />
          <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            Update on {Platform.OS === "ios" ? "App Store" : "Play Store"}
          </Text>
        </TouchableOpacity>
        {!forceUpdate && (
          <TouchableOpacity onPress={onDismiss} style={styles.skipBtn} testID="update-skip">
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Hidden admin escape (same as MaintenanceGate) */}
      <Modal visible={adminModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrap}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Shield size={22} color={theme.colors.primary} />
              <Text style={styles.modalTitle}>Admin login</Text>
              <TouchableOpacity onPress={() => setAdminModal(false)} testID="update-admin-close">
                <X size={22} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Admin email"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              testID="update-admin-email"
            />
            <TextInput
              value={pwd}
              onChangeText={setPwd}
              placeholder="Password"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              style={styles.input}
              testID="update-admin-password"
            />
            <TouchableOpacity
              style={[styles.submitBtn, busy && { opacity: 0.7 }]}
              onPress={submitAdmin}
              disabled={busy}
              testID="update-admin-submit"
              activeOpacity={0.85}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitTxt}>Sign in & open Admin</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg, gap: 16 },
  iconWrap: {
    width: 200, height: 160, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  icon: { width: 110, height: 110 },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  body2: { fontSize: 14, color: theme.colors.muted, textAlign: "center", lineHeight: 22, paddingHorizontal: 12 },
  notesBox: {
    width: "100%", backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg, padding: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border, marginTop: 8,
  },
  notesTitle: { fontSize: 12, fontWeight: "800", color: theme.colors.muted, letterSpacing: 1.2, marginBottom: 6 },
  notesBody: { fontSize: 13, color: theme.colors.text, lineHeight: 20 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: theme.radii.lg,
    marginTop: theme.spacing.md,
    alignSelf: "stretch",
    minHeight: 56,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16, flexShrink: 1 },
  skipBtn: { marginTop: 8, paddingVertical: 8 },
  skipText: { color: theme.colors.muted, fontSize: 13, fontWeight: "700" },
  hintPill: {
    marginTop: 16,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(99,102,241,0.12)",
    borderWidth: 1, borderColor: "rgba(99,102,241,0.35)",
  },
  hint: { color: theme.colors.primary, fontSize: 12, fontWeight: "700", textAlign: "center" },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: theme.spacing.lg },
  modalCard: { backgroundColor: theme.colors.surface, width: "100%", maxWidth: 360, borderRadius: theme.radii.xl, padding: theme.spacing.lg, gap: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: theme.colors.text },
  input: { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, color: theme.colors.text, fontSize: 14 },
  submitBtn: { backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: theme.radii.lg, alignItems: "center", marginTop: 4 },
  submitTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
