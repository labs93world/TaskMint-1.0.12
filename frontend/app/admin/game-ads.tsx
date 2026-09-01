import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Save } from "lucide-react-native";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";

/**
 * Game Ads admin page (item 1b). Reads & writes the same `/admin/app-config`
 * document, editing only the `game_ad_config` map. For each game the admin can
 * choose the ad type (Interstitial / Rewarded) and the frequency `every_n`.
 *
 * every_n meaning:
 *  - chance games (Higher-Lower / Tic-Tac-Toe / Math): interstitial shows every
 *    N plays.
 *  - Memory: rewarded ad every N chances (1 = each play).
 *  - Tap / Trivia: interstitial every N plays.
 *  - Check-in / Daily Challenge / Survey: ad shown on each claim (every_n = 1).
 */
type AdCfg = { ad_type: "interstitial" | "rewarded"; chances_per_ad: number; every_n: number };
type Config = Record<string, any>;

const GAMES: { key: string; label: string; hint: string }[] = [
  { key: "checkin",         label: "Daily Check-in",  hint: "Ad shown when claiming the daily reward." },
  { key: "higher_lower",    label: "Higher or Lower", hint: "Ad appears every N plays." },
  { key: "memory",          label: "Memory Match",    hint: "Rewarded ad every N chances (1 = each game)." },
  { key: "tictactoe",       label: "Tic-Tac-Toe",     hint: "Ad appears every N plays." },
  { key: "math",            label: "Math Sprint",     hint: "Ad appears every N plays." },
  { key: "daily_challenge", label: "Daily Challenge", hint: "Ad shown when opening the mystery box." },
  { key: "tap",             label: "Tap the Coins",   hint: "Ad appears every N plays." },
  { key: "trivia",          label: "Trivia Streak",   hint: "Ad appears every N plays." },
  { key: "survey",          label: "Surveys",         hint: "Ad shown when completing each survey." },
];

const DEFAULTS: Record<string, AdCfg> = {
  checkin:         { ad_type: "interstitial", chances_per_ad: 0,  every_n: 1 },
  higher_lower:    { ad_type: "interstitial", chances_per_ad: 10, every_n: 2 },
  memory:          { ad_type: "rewarded",     chances_per_ad: 1,  every_n: 0 },
  tictactoe:       { ad_type: "interstitial", chances_per_ad: 10, every_n: 2 },
  math:            { ad_type: "interstitial", chances_per_ad: 10, every_n: 2 },
  daily_challenge: { ad_type: "rewarded",     chances_per_ad: 0,  every_n: 1 },
  tap:             { ad_type: "interstitial", chances_per_ad: 5,  every_n: 1 },
  trivia:          { ad_type: "interstitial", chances_per_ad: 5,  every_n: 1 },
  survey:          { ad_type: "interstitial", chances_per_ad: 0,  every_n: 1 },
};

export default function AdminGameAds() {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Config>("/admin/app-config")
      .then((c) => {
        const gac = { ...DEFAULTS, ...(c.game_ad_config || {}) };
        setConfig({ ...c, game_ad_config: gac });
      })
      .catch((e: any) => toast.error("Error", { description: e?.message || "Failed to load" }));
  }, []);

  const gac = (): Record<string, AdCfg> => (config?.game_ad_config || {}) as any;

  const setType = (key: string, t: "interstitial" | "rewarded") =>
    setConfig((c) => c && ({ ...c, game_ad_config: { ...c.game_ad_config, [key]: { ...c.game_ad_config[key], ad_type: t } } }));

  const setEvery = (key: string) => (v: string) =>
    setConfig((c) => c && ({ ...c, game_ad_config: { ...c.game_ad_config, [key]: { ...c.game_ad_config[key], every_n: parseInt(v || "0", 10) || 0 } } }));

  const setChances = (key: string) => (v: string) =>
    setConfig((c) => c && ({ ...c, game_ad_config: { ...c.game_ad_config, [key]: { ...c.game_ad_config[key], chances_per_ad: parseInt(v || "0", 10) || 0 } } }));

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api("/admin/app-config", { method: "PUT", body: config });
      toast.success("Saved", { description: "Ad settings updated. New values apply on the next play." });
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Game Ads</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={styles.saveBtn} testID="save-game-ads">
          {saving ? <ActivityIndicator color="#fff" /> : <Save size={18} color="#fff" />}
          <Text style={styles.saveTxt}>Save</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: 14, paddingBottom: 120 }}>
          <Text style={styles.intro}>
            Control which ad shows for each game and how often. Changes apply live on users&apos; next play.
          </Text>
          {GAMES.map((g) => {
            const cfg = gac()[g.key] || DEFAULTS[g.key];
            return (
              <View key={g.key} style={styles.card} testID={`gac-${g.key}`}>
                <Text style={styles.cardTitle}>{g.label}</Text>
                <View style={styles.typeRow}>
                  {(["interstitial", "rewarded"] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeBtn, cfg.ad_type === t && styles.typeBtnActive]}
                      onPress={() => setType(g.key, t)}
                      testID={`gac-${g.key}-${t}`}
                    >
                      <Text style={[styles.typeTxt, cfg.ad_type === t && { color: "#fff" }]}>
                        {t === "interstitial" ? "Interstitial" : "Rewarded"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.numRow}>
                  <Text style={styles.numLabel}>Show ad every (plays)</Text>
                  <TextInput
                    value={String(cfg.every_n ?? 0)}
                    onChangeText={setEvery(g.key)}
                    keyboardType="number-pad"
                    style={styles.input}
                    testID={`gac-${g.key}-every`}
                  />
                </View>
                <View style={styles.numRow}>
                  <Text style={styles.numLabel}>Chances per rewarded ad</Text>
                  <TextInput
                    value={String(cfg.chances_per_ad ?? 0)}
                    onChangeText={setChances(g.key)}
                    keyboardType="number-pad"
                    style={styles.input}
                    testID={`gac-${g.key}-chances`}
                  />
                </View>
                <Text style={styles.hint}>{g.hint}</Text>
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  saveBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: theme.colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
  },
  saveTxt: { color: "#fff", fontWeight: "800" },
  intro: { color: theme.colors.muted, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    padding: theme.spacing.md, gap: 10, borderWidth: 1, borderColor: theme.colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center",
    backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border,
  },
  typeBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  typeTxt: { fontWeight: "800", fontSize: 13, color: theme.colors.text },
  numRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  numLabel: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: "500" },
  input: {
    width: 90, backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    color: theme.colors.text, fontWeight: "700", textAlign: "right",
  },
  hint: { color: theme.colors.muted, fontSize: 12, lineHeight: 16 },
});
