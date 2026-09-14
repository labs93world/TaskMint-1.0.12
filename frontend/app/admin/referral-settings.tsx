import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Save, Users as UsersIcon, Plus, Trash2 } from "lucide-react-native";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";

type Tier = { streak_days: number; points: number };
type Settings = {
  streak_7_reward_points: number;
  streak_15_reward_points: number;
  hero_title: string;
  hero_subtitle: string;
  how_it_works_step3: string;
  sharing_text: string;
  tiers: Tier[];
};

export default function AdminReferralSettings() {
  const router = useRouter();
  const [s7, setS7] = useState("1000");
  const [s15, setS15] = useState("2000");
  const [heroTitle, setHeroTitle] = useState("Earn ₹10 per friend");
  const [heroSub, setHeroSub] = useState("₹10 at 7-day streak • ₹20 at 15-day streak");
  const [step3, setStep3] = useState("₹10 when they hit a 7-day streak • ₹20 when they hit a 15-day streak");
  const [sharingText, setSharingText] = useState(
    "🎉 Join me on TaskMint and earn real cash! Use my code {code} when signing up."
  );
  const [tiers, setTiers] = useState<{ streak_days: string; points: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Settings>("/admin/referral-settings")
      .then((x) => {
        setS7(String(x.streak_7_reward_points ?? 1000));
        setS15(String(x.streak_15_reward_points ?? 2000));
        if (x.hero_title) setHeroTitle(x.hero_title);
        if (x.hero_subtitle) setHeroSub(x.hero_subtitle);
        if (x.how_it_works_step3) setStep3(x.how_it_works_step3);
        if (x.sharing_text) setSharingText(x.sharing_text);
        const t = (x.tiers || []).map((tt) => ({
          streak_days: String(tt.streak_days ?? ""),
          points: String(tt.points ?? ""),
        }));
        setTiers(t);
      })
      .catch(() => {});
  }, []);

  const addTier = () => setTiers((prev) => [...prev, { streak_days: "", points: "" }]);
  const removeTier = (i: number) =>
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  const updateTier = (i: number, key: "streak_days" | "points", val: string) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: val } : t)));

  const save = async () => {
    const n7 = parseInt(s7, 10);
    const n15 = parseInt(s15, 10);
    if (isNaN(n7) || n7 < 0 || isNaN(n15) || n15 < 0) {
      toast.error("Invalid", { description: "Enter a non-negative number of points for both fields" });
      return;
    }
    if (!heroTitle.trim() || !heroSub.trim() || !step3.trim()) {
      toast.error("Invalid", { description: "Hero title, subtitle and step-3 text cannot be empty" });
      return;
    }
    if (!sharingText.trim()) {
      toast.error("Invalid", { description: "Sharing text cannot be empty. Use {code} as placeholder." });
      return;
    }
    const cleanTiers: Tier[] = [];
    for (const t of tiers) {
      const d = parseInt(t.streak_days, 10);
      const p = parseInt(t.points, 10);
      if (isNaN(d) && isNaN(p)) continue; // skip empty rows
      if (isNaN(d) || d <= 0) {
        toast.error("Invalid tier", { description: "Streak days must be a positive integer" });
        return;
      }
      if (isNaN(p) || p < 0) {
        toast.error("Invalid tier", { description: "Tier points must be ≥ 0" });
        return;
      }
      cleanTiers.push({ streak_days: d, points: p });
    }
    cleanTiers.sort((a, b) => a.streak_days - b.streak_days);

    setBusy(true);
    try {
      await api("/admin/referral-settings", {
        method: "PUT",
        body: {
          streak_7_reward_points: n7,
          streak_15_reward_points: n15,
          hero_title: heroTitle.trim(),
          hero_subtitle: heroSub.trim(),
          how_it_works_step3: step3.trim(),
          sharing_text: sharingText,
          tiers: cleanTiers,
        },
      });
      toast.success("Saved", { description: cleanTiers.length > 0
          ? `Multi-tier mode active (${cleanTiers.length} tier${cleanTiers.length === 1 ? "" : "s"}). Legacy 7/15-day fields are ignored.`
          : "Referral settings updated" });
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed" });
    } finally {
      setBusy(false);
    }
  };

  const toINR = (pts: string) => {
    const n = parseInt(pts, 10);
    if (isNaN(n)) return "—";
    return `₹${(n / 100).toFixed(0)}`;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <ChevronLeft size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Referral Rewards</Text>
          <UsersIcon size={20} color={theme.colors.primary} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: theme.spacing.lg, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.note}>
            Configure milestone rewards and the texts shown on the user-facing Refer & Earn screen.
            {"\n"}100 points = ₹1. Set 0 to disable a milestone.
          </Text>

          {/* --- Multi-tier --- */}
          <View style={styles.card}>
            <View style={styles.tierHead}>
              <Text style={styles.label}>STREAK BONUS TIERS (advanced)</Text>
              <TouchableOpacity onPress={addTier} style={styles.addBtn} testID="add-tier">
                <Plus size={14} color="#fff" />
                <Text style={styles.addBtnText}>Add tier</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.help}>
              Each tier pays the referrer when their referee hits that streak. Adding any
              tier here OVERRIDES the legacy 7-day and 15-day fields below.
            </Text>
            {tiers.length === 0 && (
              <Text style={[styles.help, { marginTop: 8 }]}>No tiers — using legacy 7/15-day fields.</Text>
            )}
            {tiers.map((t, i) => (
              <View key={i} style={styles.tierRow} testID={`tier-row-${i}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tierLabel}>Streak (days)</Text>
                  <TextInput
                    value={t.streak_days}
                    onChangeText={(v) => updateTier(i, "streak_days", v)}
                    keyboardType="number-pad"
                    style={styles.input}
                    placeholder="7"
                    placeholderTextColor={theme.colors.muted}
                    testID={`tier-days-${i}`}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tierLabel}>Reward (pts)</Text>
                  <TextInput
                    value={t.points}
                    onChangeText={(v) => updateTier(i, "points", v)}
                    keyboardType="number-pad"
                    style={styles.input}
                    placeholder="1000"
                    placeholderTextColor={theme.colors.muted}
                    testID={`tier-points-${i}`}
                  />
                  <Text style={styles.inr}>{toINR(t.points)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.delBtn}
                  onPress={() => removeTier(i)}
                  testID={`tier-del-${i}`}
                >
                  <Trash2 size={16} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Legacy 7/15-day fields removed — multi-tier system handles all milestones now. */}

          {/* --- User-facing texts --- */}
          <View style={styles.card}>
            <Text style={styles.label}>HERO CARD — TITLE (LINE 1)</Text>
            <TextInput
              value={heroTitle} onChangeText={setHeroTitle}
              style={[styles.input, { fontSize: 14 }]}
              placeholder="Earn ₹10 per friend"
              placeholderTextColor={theme.colors.muted}
              maxLength={60} testID="input-hero-title"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>HERO CARD — SUBTITLE (LINE 2)</Text>
            <TextInput
              value={heroSub} onChangeText={setHeroSub}
              style={[styles.input, { fontSize: 14 }]}
              placeholder="₹10 at 7-day streak • ₹20 at 15-day streak"
              placeholderTextColor={theme.colors.muted}
              maxLength={120} multiline testID="input-hero-subtitle"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>HOW IT WORKS — STEP 3 TEXT</Text>
            <TextInput
              value={step3} onChangeText={setStep3}
              style={[styles.input, { fontSize: 14, minHeight: 70 }]}
              placeholder="₹10 when they hit a 7-day streak • ₹20 when they hit a 15-day streak"
              placeholderTextColor={theme.colors.muted}
              multiline maxLength={200} testID="input-step3"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>SHARING TEXT (USED BY USER'S "INVITE" BUTTON)</Text>
            <TextInput
              value={sharingText} onChangeText={setSharingText}
              style={[styles.input, { fontSize: 14, minHeight: 90 }]}
              placeholder="🎉 Join me on TaskMint! Use my code {code} when signing up."
              placeholderTextColor={theme.colors.muted}
              multiline maxLength={400} testID="input-sharing-text"
            />
            <Text style={styles.help}>
              Use {"{code}"} as a placeholder — it will be replaced with the user's referral code.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.cta, busy && { opacity: 0.6 }]}
            onPress={save}
            disabled={busy}
            testID="save-referral-settings"
          >
            <Save size={18} color="#fff" />
            <Text style={styles.ctaText}>{busy ? "Saving..." : "Save Changes"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  note: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  label: { fontSize: 11, fontWeight: "800", color: theme.colors.muted, letterSpacing: 1.4, marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.bg, borderRadius: theme.radii.md,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 16,
    color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border,
    fontWeight: "700",
  },
  inr: { marginTop: 8, color: theme.colors.success, fontWeight: "700", fontSize: 13 },
  help: { marginTop: 6, color: theme.colors.muted, fontSize: 11, lineHeight: 16 },
  tierHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 6,
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  tierRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12,
  },
  tierLabel: { fontSize: 10, color: theme.colors.muted, fontWeight: "700", marginBottom: 4, letterSpacing: 1 },
  delBtn: {
    width: 40, height: 44, borderRadius: theme.radii.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.10)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)",
  },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: theme.radii.lg,
    marginTop: theme.spacing.md,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
