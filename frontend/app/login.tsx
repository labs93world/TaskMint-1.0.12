import React from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { makeStyles, useTheme } from "@/src/theme";
import { Button } from "@/src/components/ui/Button";
import { Icon, IconName } from "@/src/components/ui/Icon";

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: "gift", label: "High-paying tasks" },
  { icon: "sparkle", label: "Multiple ways to earn" },
  { icon: "coins", label: "Withdraw to UPI or Bank" },
];

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Responsive hero height so it looks balanced on small and large phones.
  const heroHeight = Math.min(Math.max(width * 0.5, 170), 220);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="login-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image
            source={require("../assets/images/app-logo.png")}
            style={styles.logo}
            contentFit="contain"
          />
          <Text style={styles.brand}>TaskMint</Text>
        </View>
        <Text style={styles.tagline}>Earn rewards. Get paid. Anytime.</Text>

        {/* Self-made gradient hero (no external image, fast & reliable) */}
        <LinearGradient
          colors={[colors.brandPrimary, colors.info]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { height: heroHeight }]}
        >
          <View style={[styles.coin, styles.coinA]}>
            <Icon name="coins" size={18} color={colors.warning} weight="fill" />
          </View>
          <View style={[styles.coin, styles.coinB]}>
            <Text allowFontScaling={false} style={styles.rupee}>₹</Text>
          </View>
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <Icon name="gift" size={40} color={colors.onBrandPrimary} weight="fill" />
            </View>
            <Text
              style={styles.heroTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              allowFontScaling={false}
            >
              Earn Real Cash
            </Text>
            <Text
              style={styles.heroSub}
              numberOfLines={1}
              adjustsFontSizeToFit
              allowFontScaling={false}
            >
              Complete simple tasks & games
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Icon name={f.icon} size={18} color={colors.brand} weight="bold" />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
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
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 40 },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: c.brandPrimary,
    letterSpacing: -0.5,
  },
  tagline: { fontSize: 14, color: c.muted, marginTop: 6, fontWeight: "600" },
  hero: {
    width: "100%",
    borderRadius: 24,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 24,
  },
  heroContent: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
  },
  heroBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 14,
    textAlign: "center",
  },
  heroSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: 4,
    fontWeight: "600",
    textAlign: "center",
  },
  coin: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  coinA: { top: 18, left: 18 },
  coinB: { bottom: 18, right: 18 },
  rupee: { fontSize: 20, fontWeight: "800", color: "#FFFFFF" },
  features: { marginTop: 24, gap: 14 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: { fontSize: 16, fontWeight: "700", color: c.onSurfaceSecondary },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
  terms: {
    textAlign: "center",
    color: c.muted,
    marginTop: 14,
    fontSize: 12.5,
    lineHeight: 18,
  },
}));
