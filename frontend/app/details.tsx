import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { makeStyles, useTheme } from "@/src/theme";
import { Button } from "@/src/components/ui/Button";
import { Icon } from "@/src/components/ui/Icon";
import { useUser } from "@/src/context/UserContext";
import { useToast } from "@/src/components/ui/Toast";

export default function Details() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { completeOnboarding } = useUser();
  const toast = useToast();

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    if (name.trim().length < 2) {
      toast.show("Please enter your name", "error");
      return;
    }
    if (!/^\d{10}$/.test(mobile.trim())) {
      toast.show("Enter a valid 10-digit mobile number", "error");
      return;
    }
    if (password.trim().length < 4) {
      toast.show("Password must be at least 4 characters", "error");
      return;
    }
    setSaving(true);
    try {
      await completeOnboarding({
        name: name.trim(),
        mobile: mobile.trim(),
        password: password.trim(),
      });
      router.replace("/(tabs)");
    } catch {
      setSaving(false);
      toast.show("Something went wrong. Try again.", "error");
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="details-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconCircle}>
          <Icon name="user" size={40} color={colors.brand} weight="bold" />
        </View>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} allowFontScaling={false}>
          Let&apos;s set up your profile
        </Text>
        <Text style={styles.subtitle}>
          Tell us your name and mobile number to start earning.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            testID="details-name-input"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rahul Sharma"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            testID="details-mobile-input"
            value={mobile}
            onChangeText={(t) => setMobile(t.replace(/[^0-9]/g, "").slice(0, 10))}
            placeholder="10-digit mobile"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={styles.input}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              testID="details-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="Create a password"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={[styles.input, styles.passwordInput]}
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
            <Pressable
              testID="details-password-toggle"
              onPress={() => setShowPassword((s) => !s)}
              hitSlop={10}
              style={styles.eyeBtn}
            >
              <Icon
                name={showPassword ? "eye-slash" : "eye"}
                size={20}
                color={colors.muted}
                weight="bold"
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label="Start earning"
          testID="details-submit-button"
          loading={saving}
          onPress={onSubmit}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: { height: 48, justifyContent: "center", paddingHorizontal: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 26, fontWeight: "800", color: c.onSurface, marginTop: 20 },
  subtitle: { fontSize: 15, color: c.muted, marginTop: 8, lineHeight: 22 },
  field: { marginTop: 22 },
  label: { fontSize: 14, fontWeight: "700", color: c.onSurfaceTertiary, marginBottom: 8 },
  input: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
    fontWeight: "600",
    color: c.onSurfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  passwordWrap: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 52 },
  eyeBtn: {
    position: "absolute",
    right: 14,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
}));
