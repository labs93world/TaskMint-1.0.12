import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { makeStyles, useTheme } from "@/src/theme";
import { Button } from "@/src/components/ui/Button";
import { Icon, IconName } from "@/src/components/ui/Icon";

const GIFT_IMG =
  "https://images.unsplash.com/photo-1674620213535-9b2a2553ef40?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwxfHxnaWZ0JTIwYm94JTIwM2QlMjByZW5kZXJpbmclMjB3aGl0ZSUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzkxMDE4NTc0fDA&ixlib=rb-4.1.0&q=85";

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: "gift", label: "High paying Tasks" },
  { icon: "sparkle", label: "Multiple Earning ways" },
  { icon: "coins", label: "Withdraw to UPI Or Bank" },
];

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="login-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require("../assets/images/app-logo.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.brand}>TaskMint</Text>
        <Text style={styles.tagline}>Earn rewards. Get paid. Anytime.</Text>

        <View style={styles.card}>
          <Image source={{ uri: GIFT_IMG }} style={styles.gift} contentFit="cover" />
          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Icon name={f.icon} size={22} color={colors.brand} weight="bold" />
                </View>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label="Continue"
          testID="login-continue-button"
          onPress={() => router.push("/details")}
        />
        <Text style={styles.terms}>
          By continuing, you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, alignItems: "center" },
  logo: { width: 84, height: 72, marginTop: 8 },
  brand: {
    fontSize: 40,
    fontWeight: "800",
    color: c.brandPrimary,
    marginTop: 12,
    letterSpacing: -0.5,
  },
  tagline: { fontSize: 18, color: c.muted, marginTop: 8, fontWeight: "600" },
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 24,
    padding: 16,
    marginTop: 28,
    width: "100%",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  gift: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    backgroundColor: c.surfaceTertiary,
  },
  features: { marginTop: 18, gap: 18, paddingHorizontal: 4, paddingBottom: 6 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: { fontSize: 20, fontWeight: "800", color: c.onSurfaceSecondary },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
  terms: {
    textAlign: "center",
    color: c.muted,
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
  },
}));
