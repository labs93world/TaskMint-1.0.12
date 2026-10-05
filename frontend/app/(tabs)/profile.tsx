import React, { useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/components/ui/Icon";
import { Popup } from "@/src/components/ui/Popup";
import { Button } from "@/src/components/ui/Button";
import { useUser } from "@/src/context/UserContext";

const SUPPORT_EMAIL = "taskmint93@gmail.com";
const ADMIN_KEY = "TaskMint000";

const ROWS: { icon: IconName; label: string; action: string }[] = [
  { icon: "question", label: "Help & Support", action: "support" },
  { icon: "file-text", label: "Terms of Use", action: "terms" },
  { icon: "shield", label: "Privacy Policy", action: "privacy" },
];

export default function Profile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useUser();

  const [keyModal, setKeyModal] = useState(false);
  const [greetModal, setGreetModal] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const version = Constants.expoConfig?.version ?? "1.0.0";

  const onRow = (action: string) => {
    if (action === "support") Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
    if (action === "terms") router.push("/terms");
    if (action === "privacy") router.push("/privacy");
  };

  const checkKey = () => {
    const ok = keyInput.trim() === ADMIN_KEY;
    setKeyModal(false);
    setKeyInput("");
    if (ok) {
      router.push("/admin");
    } else {
      setGreetModal(true);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.screenTitle}>Profile</Text>
      </View>

      <View style={styles.body}>
        {/* Profile card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            {profile?.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
            ) : (
              <Icon name="user" size={34} color={colors.brand} weight="fill" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile?.name || "Earner"}</Text>
            <Text style={styles.mobile}>+91 {profile?.mobile || "—"}</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menu}>
          {ROWS.map((r, i) => (
            <Pressable
              key={r.action}
              testID={`profile-${r.action}`}
              style={[styles.row, i < ROWS.length - 1 && styles.rowBorder]}
              onPress={() => onRow(r.action)}
            >
              <View style={styles.rowIcon}>
                <Icon name={r.icon} size={20} color={colors.brand} weight="fill" />
              </View>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Icon name="caret-right" size={18} color={colors.muted} weight="bold" />
            </Pressable>
          ))}
        </View>

        <Pressable
          testID="profile-version"
          onLongPress={() => setKeyModal(true)}
          delayLongPress={600}
          style={styles.versionWrap}
        >
          <Text style={styles.version}>TaskMint v{version}</Text>
        </Pressable>
      </View>

      {/* Hidden admin access */}
      <Popup
        visible={keyModal}
        onClose={() => {
          setKeyModal(false);
          setKeyInput("");
        }}
        title="How are you doing?"
        testID="admin-key-modal"
      >
        <Text style={styles.greetText}>
          Hope you're having a great day! Tell us how you feel 👇
        </Text>
        <TextInput
          testID="admin-key-input"
          value={keyInput}
          onChangeText={setKeyInput}
          placeholder="Type here..."
          placeholderTextColor={colors.muted}
          style={styles.keyInput}
          secureTextEntry
          autoCapitalize="none"
        />
        <Button label="Send" testID="admin-key-submit" onPress={checkKey} style={{ marginTop: 16 }} />
      </Popup>

      <Popup
        visible={greetModal}
        onClose={() => setGreetModal(false)}
        title="Thanks for sharing!"
        testID="greet-modal"
      >
        <Text style={styles.greetText}>Have a great day! 🌟</Text>
        <Button
          label="Close"
          variant="secondary"
          onPress={() => setGreetModal(false)}
          style={{ marginTop: 16 }}
        />
      </Popup>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  topBar: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.surface },
  screenTitle: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  body: { paddingHorizontal: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: c.surfaceSecondary,
    borderRadius: 20,
    padding: 18,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 68, height: 68 },
  name: { fontSize: 20, fontWeight: "800", color: c.onSurfaceSecondary },
  mobile: { fontSize: 15, color: c.muted, marginTop: 4, fontWeight: "600" },
  menu: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 20,
    marginTop: 18,
    paddingHorizontal: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: c.divider },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: "700", color: c.onSurfaceSecondary },
  supportNote: { textAlign: "center", color: c.muted, fontSize: 13, marginTop: 20 },
  versionWrap: { alignItems: "center", marginTop: 24, paddingVertical: 8 },
  version: { color: c.muted, fontSize: 13, fontWeight: "600" },
  greetText: { fontSize: 15, color: c.onSurfaceTertiary, lineHeight: 22 },
  keyInput: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    fontSize: 16,
    color: c.onSurfaceSecondary,
    marginTop: 16,
  },
}));
