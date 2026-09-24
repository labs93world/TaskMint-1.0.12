import React, { useEffect, useState } from "react";
import { Platform, View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../lib/theme";
import { getAdUnitId } from "../lib/adConfig";

// Conditionally require the native module only on Android/iOS.
let NativeAdClass: any = null;
let NativeAdView: any = null;
let TestIds: any = null;
try {
  if (Platform.OS !== "web") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-google-mobile-ads");
    NativeAdClass = mod.NativeAd;
    NativeAdView = mod.NativeAdView;
    TestIds = mod.TestIds;
  }
} catch {}

/**
 * Real AdMob Native Ad. Loads via NativeAd.createForAdRequest and renders
 * the ad's headline / body / icon / CTA inside a NativeAdView so AdMob
 * registers the impression and clicks correctly. Falls back to a styled
 * placeholder on web/Expo Go or if the ad fails to load.
 */
export default function NativeAd({ testID = "native-ad" }: { testID?: string }) {
  const insets = useSafeAreaInsets();
  const [ad, setAd] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const bottomSpace = theme.spacing.md + insets.bottom;

  useEffect(() => {
    if (!NativeAdClass) return;
    let cancelled = false;
    const unitId = __DEV__ ? TestIds.NATIVE : getAdUnitId("native");
    NativeAdClass.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: false,
    })
      .then((loaded: any) => {
        if (!cancelled) setAd(loaded);
      })
      .catch((e: any) => {
        console.log("[NativeAd] failed:", e?.message || e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      // Destroy the ad when component unmounts to free resources.
      try { ad?.destroy?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!NativeAdClass || failed || !ad) {
    return (
      <View style={[styles.host, { paddingBottom: bottomSpace }]} testID={testID}>
        <View style={styles.card}>
          <Text style={styles.label}>SPONSORED</Text>
          <Text style={styles.title}>TaskMint partners</Text>
          <Text style={styles.sub}>Support us by checking back later</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.host, { paddingBottom: bottomSpace }]} testID={testID}>
      <NativeAdView nativeAd={ad} style={styles.native}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            {ad.icon?.url ? (
              <Image source={{ uri: ad.icon.url }} style={styles.icon} />
            ) : (
              <View style={[styles.icon, styles.iconFallback]} />
            )}
            <View style={styles.adTextWrap}>
              <Text style={styles.label}>SPONSORED</Text>
              {!!ad.headline && (
                <Text style={styles.title} numberOfLines={2}>{ad.headline}</Text>
              )}
              {!!ad.advertiser && (
                <Text style={styles.sub} numberOfLines={1}>{ad.advertiser}</Text>
              )}
            </View>
          </View>
          {!!ad.body && (
            <Text style={styles.body} numberOfLines={3}>{ad.body}</Text>
          )}
          {!!ad.callToAction && (
            <TouchableOpacity style={styles.cta} activeOpacity={0.85}>
              <Text style={styles.ctaText}>{ad.callToAction}</Text>
            </TouchableOpacity>
          )}
        </View>
      </NativeAdView>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flexGrow: 1,
    flexShrink: 1,
    alignSelf: "stretch",
    width: "100%",
    minHeight: 210,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  native: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minHeight: 178,
  },
  card: {
    flex: 1,
    width: "100%",
    minHeight: 178,
    justifyContent: "center",
    gap: 10,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%" },
  adTextWrap: { flex: 1, minWidth: 0 },
  icon: { width: 48, height: 48, borderRadius: 10, backgroundColor: "#EEF1F6" },
  iconFallback: { backgroundColor: theme.colors.primarySoft },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: theme.colors.muted },
  title: { fontSize: 15, fontWeight: "800", color: theme.colors.text, marginTop: 2 },
  sub: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  body: { fontSize: 13, color: theme.colors.text, lineHeight: 18 },
  cta: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 999, alignSelf: "flex-start",
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
});
