import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Save, Plus, Trash2 } from "lucide-react-native";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";

type Tier = { withdrawals: number; points: number };
type MaintEntry = { enabled: boolean; note: string };
type Config = {
  exchange_points_per_inr: number;
  min_withdrawal_campaign: number;
  min_withdrawal_games_task: number;
  daily_withdrawal_limit: number;
  home_default_tab: string;
  home_tab_order: string[];
  spin_min: number; spin_max: number;
  scratch_min: number; scratch_max: number;
  visit_min: number; visit_max: number;
  watch_min: number; watch_max: number;
  survey_min: number; survey_max: number;
  quiz_min: number; quiz_max: number;
  hl_reward_streak_3: number;
  hl_reward_streak_5: number;
  hl_reward_streak_7: number;
  memory_completion: number;
  ttt_win: number;
  math_per_correct: number;
  tap_per_diamond: number;
  tap_per_gold: number;
  tap_per_silver: number;
  tap_bomb_penalty: number;
  trivia_per_correct: number;
  trivia_streak_bonus: number;
  checkin_base: number; checkin_step: number; checkin_cap: number;
  referral_mode: "streak" | "withdrawal" | "both";
  referral_withdrawal_tiers: Tier[];
  maintenance: Record<string, MaintEntry>;
};

const ROUTE_GROUPS: { label: string; items: { key: string; name: string }[] }[] = [
  { label: "Tabs", items: [
    { key: "/home", name: "Home" },
    { key: "/earn", name: "Earn" },
    { key: "/wallet", name: "Wallet" },
    { key: "/refer", name: "Refer" },
  ]},
  { label: "Tasks", items: [
    { key: "/spin", name: "Spin & Win" },
    { key: "/scratch", name: "Scratch & Earn" },
    { key: "/visit-earn", name: "Visit & Earn" },
    { key: "/watch-earn", name: "Watch & Earn" },
    { key: "/surveys", name: "Surveys" },
    { key: "/quizzes", name: "Quizzes" },
    { key: "/checkin", name: "Daily Check-in" },
  ]},
  { label: "Games", items: [
    { key: "/higher-lower", name: "Higher or Lower" },
    { key: "/memory-match", name: "Memory Match" },
    { key: "/tic-tac-toe", name: "Tic-Tac-Toe" },
    { key: "/math-sprint", name: "Math Sprint" },
    { key: "/daily-challenge", name: "Daily Challenge" },
    { key: "/tap-rush", name: "Tap-the-Coin Rush" },
    { key: "/trivia-streak", name: "Trivia Streak" },
  ]},
  { label: "Wallet", items: [
    { key: "/withdraw", name: "Withdraw" },
    { key: "/refer", name: "Refer & Earn" },
  ]},
];

export default function AdminSettings() {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Config>("/admin/app-config")
      .then(setConfig)
      .catch((e) => toast.error("Error", { description: e?.message || "Failed to load config" }));
  }, []);

  const set = (patch: Partial<Config>) => setConfig((c) => (c ? { ...c, ...patch } : c));
  const setNum = (key: keyof Config) => (v: string) =>
    set({ [key]: parseInt(v || "0", 10) || 0 } as any);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api("/admin/app-config", { method: "PUT", body: config });
      toast.success("Saved", { description: "Config updated. New values take effect immediately." });
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const addTier = () => set({
    referral_withdrawal_tiers: [...(config?.referral_withdrawal_tiers || []), { withdrawals: 1, points: 1000 }],
  });
  const updateTier = (i: number, t: Partial<Tier>) => {
    if (!config) return;
    const next = [...config.referral_withdrawal_tiers];
    next[i] = { ...next[i], ...t };
    set({ referral_withdrawal_tiers: next });
  };
  const removeTier = (i: number) => {
    if (!config) return;
    set({ referral_withdrawal_tiers: config.referral_withdrawal_tiers.filter((_, j) => j !== i) });
  };

  const toggleMaint = (key: string) => {
    if (!config) return;
    const current = config.maintenance[key] || { enabled: false, note: "" };
    set({ maintenance: { ...config.maintenance, [key]: { ...current, enabled: !current.enabled } } });
  };
  const setNote = (key: string, note: string) => {
    if (!config) return;
    const current = config.maintenance[key] || { enabled: false, note: "" };
    set({ maintenance: { ...config.maintenance, [key]: { ...current, note } } });
  };

  if (!config) {
    return (
      <SafeAreaView style={styles.safe}><ActivityIndicator color={theme.colors.primary} style={{ marginTop: 80 }} /></SafeAreaView>
    );
  }

  const inr = (pts: number) => `₹${(pts / (config.exchange_points_per_inr || 100)).toFixed(2)}`;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><ChevronLeft size={26} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>App Config</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={styles.saveBtn} testID="save-config">
          {saving ? <ActivityIndicator color="#fff" /> : <Save size={18} color="#fff" />}
          <Text style={styles.saveTxt}>Save</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: 20, paddingBottom: 120 }}>
          {/* Wallet */}
          <Section title="Wallet">
            <Row label={`Exchange ratio (points per ₹1)`}>
              <NumInput value={config.exchange_points_per_inr} onChangeText={setNum("exchange_points_per_inr")} testID="cfg-exchange" />
            </Row>
            <Row label={`Min withdrawal — Campaign (${inr(config.min_withdrawal_campaign)})`}>
              <NumInput value={config.min_withdrawal_campaign} onChangeText={setNum("min_withdrawal_campaign")} testID="cfg-min-campaign" />
            </Row>
            <Row label={`Min withdrawal — Games & Task (${inr(config.min_withdrawal_games_task)})`}>
              <NumInput value={config.min_withdrawal_games_task} onChangeText={setNum("min_withdrawal_games_task")} testID="cfg-min-gt" />
            </Row>
            <Row label="Daily withdrawal limit (per user)">
              <NumInput value={config.daily_withdrawal_limit} onChangeText={setNum("daily_withdrawal_limit")} testID="cfg-daily-limit" />
            </Row>
          </Section>

          {/* Task reward ranges */}
          <Section title="Task reward ranges (points)">
            {([
              ["Spin & Win", "spin_min", "spin_max"],
              ["Scratch & Earn", "scratch_min", "scratch_max"],
              ["Visit & Earn", "visit_min", "visit_max"],
              ["Watch & Earn", "watch_min", "watch_max"],
              ["Surveys", "survey_min", "survey_max"],
              ["Quizzes", "quiz_min", "quiz_max"],
            ] as const).map(([label, kMin, kMax]) => (
              <View key={label} style={styles.rangeRow}>
                <Text style={styles.rowLabel}>{label}</Text>
                <View style={styles.rangeInputs}>
                  <NumInput value={(config as any)[kMin]} onChangeText={setNum(kMin as any)} placeholder="min" />
                  <Text style={styles.dash}>–</Text>
                  <NumInput value={(config as any)[kMax]} onChangeText={setNum(kMax as any)} placeholder="max" />
                </View>
              </View>
            ))}
          </Section>

          {/* Game rewards moved → /admin/game-rewards
              Maintenance moved → /admin/maintenance */}

          {/* Check-in */}
          <Section title="Daily Check-in reward curve">
            <Row label="Day 1 base"><NumInput value={config.checkin_base} onChangeText={setNum("checkin_base")} /></Row>
            <Row label="+ points per day after day 1"><NumInput value={config.checkin_step} onChangeText={setNum("checkin_step")} /></Row>
            <Row label="Max cap"><NumInput value={config.checkin_cap} onChangeText={setNum("checkin_cap")} /></Row>
          </Section>

          {/* Referral */}
          <Section title="Referral mode">
            <View style={styles.modeRow}>
              {(["streak", "withdrawal", "both"] as const).map((m) => (
                <TouchableOpacity key={m} onPress={() => set({ referral_mode: m })} style={[styles.modeChip, config.referral_mode === m && styles.modeChipActive]} testID={`cfg-mode-${m}`}>
                  <Text style={[styles.modeChipTxt, config.referral_mode === m && styles.modeChipTxtActive]}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.muted}>
              • <Text style={{ fontWeight: "800" }}>Streak</Text>: payouts when referred friend hits 7/15-day streaks (managed in /admin/referral-settings){"\n"}
              • <Text style={{ fontWeight: "800" }}>Withdrawal</Text>: payouts when referred friend completes Nth successful withdrawal{"\n"}
              • <Text style={{ fontWeight: "800" }}>Both</Text>: streak + withdrawal payouts together
            </Text>
            {(config.referral_mode === "withdrawal" || config.referral_mode === "both") && (
              <View style={{ marginTop: 10, gap: 8 }}>
                <Text style={styles.subhead}>Withdrawal tiers</Text>
                {config.referral_withdrawal_tiers.map((t, i) => (
                  <View key={i} style={styles.tierRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tinyLabel}>Withdrawal #</Text>
                      <NumInput value={t.withdrawals} onChangeText={(v) => updateTier(i, { withdrawals: parseInt(v || "0", 10) || 0 })} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tinyLabel}>Bonus points</Text>
                      <NumInput value={t.points} onChangeText={(v) => updateTier(i, { points: parseInt(v || "0", 10) || 0 })} />
                    </View>
                    <TouchableOpacity onPress={() => removeTier(i)} style={styles.removeBtn}>
                      <Trash2 size={16} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity onPress={addTier} style={styles.addBtn}>
                  <Plus size={16} color={theme.colors.primary} />
                  <Text style={styles.addBtnTxt}>Add tier</Text>
                </TouchableOpacity>
              </View>
            )}
          </Section>

          <Section title="Home tabs (Offerwall / Campaigns)">
            <Row label="Default tab">
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["offerwall", "campaign"] as const).map((t) => (
                  <TouchableOpacity key={t} onPress={() => set({ home_default_tab: t })}
                    style={[styles.modeChip, config.home_default_tab === t && styles.modeChipActive]}
                    testID={`cfg-hometab-${t}`}>
                    <Text style={[styles.modeChipTxt, config.home_default_tab === t && styles.modeChipTxtActive]}>
                      {t === "offerwall" ? "Offerwall" : "Campaigns"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Row>
            <Row label={`Order: ${(config.home_tab_order || ["offerwall", "campaign"]).map((x) => x === "offerwall" ? "Offerwall" : "Campaigns").join(" → ")}`}>
              <TouchableOpacity
                onPress={() => set({ home_tab_order: [...(config.home_tab_order || ["offerwall", "campaign"])].reverse() })}
                style={[styles.modeChip, styles.modeChipActive]} testID="cfg-hometab-swap">
                <Text style={[styles.modeChipTxt, styles.modeChipTxtActive]}>Swap</Text>
              </TouchableOpacity>
            </Row>
          </Section>

          {/* Maintenance section moved → /admin/maintenance */}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ width: 110 }}>{children}</View>
    </View>
  );
}
function NumInput({ value, onChangeText, placeholder, testID }: { value: number; onChangeText: (v: string) => void; placeholder?: string; testID?: string }) {
  return (
    <TextInput
      value={String(value ?? 0)}
      onChangeText={onChangeText}
      keyboardType="number-pad"
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.muted}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  saveTxt: { color: "#fff", fontWeight: "800" },
  section: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.md, gap: 12, borderWidth: 1, borderColor: theme.colors.border },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowLabel: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: "500" },
  rangeRow: { gap: 6 },
  rangeInputs: { flexDirection: "row", alignItems: "center", gap: 8 },
  dash: { color: theme.colors.muted, fontWeight: "800" },
  input: { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: theme.colors.text, fontWeight: "700", textAlign: "right", flex: 1 },
  muted: { color: theme.colors.muted, fontSize: 12, lineHeight: 18 },
  subhead: { fontSize: 13, fontWeight: "800", color: theme.colors.text, textTransform: "uppercase", letterSpacing: 0.5 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bg },
  modeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  modeChipTxt: { color: theme.colors.text, fontWeight: "700", fontSize: 13 },
  modeChipTxtActive: { color: "#fff" },
  tierRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  tinyLabel: { fontSize: 10, fontWeight: "800", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  removeBtn: { backgroundColor: "rgba(239,68,68,0.10)", padding: 8, borderRadius: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.primarySoft },
  addBtnTxt: { color: theme.colors.primary, fontWeight: "800", fontSize: 13 },
  maintRow: { backgroundColor: theme.colors.bg, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, gap: 6 },
  maintHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  maintName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  maintKey: { fontSize: 11, color: theme.colors.muted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  noteInput: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: theme.colors.text, fontSize: 13 },
});
