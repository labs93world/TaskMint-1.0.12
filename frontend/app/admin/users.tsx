import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Search, Plus, Minus, X, Trash2 } from "lucide-react-native";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";

type AdminUser = {
  user_id: string; email: string; name: string; picture?: string;
  mobile_number?: string;
  points: number; total_earned: number; total_withdrawn: number;
  campaign_points?: number; games_task_points?: number;
  total_tasks: number; streak: number;
  referrals_count?: number;
  is_admin: boolean; created_at: string;
};

type Referral = {
  user_id: string; name: string; mobile_number?: string;
  streak: number; last_checkin?: string; joined_at?: string;
};

type Txn = {
  id?: string; type: string; source: string; points: number;
  category?: string;
  note?: string; created_at: string;
};

type TxnFilter = "all" | "games_task" | "campaign" | "withdrawals";

type Withdrawal = {
  id?: string;
  inr_amount?: number;
  points?: number;
  method?: string;
  source?: "campaign" | "games_task";
  upi_id?: string;
  bank_account?: string;
  bank_holder?: string;
  bank_ifsc?: string;
  status: string;
  admin_note?: string;
  created_at: string;
};

type Completion = {
  id?: string; campaign_name?: string; reward_points?: number;
  status: string; created_at: string; admin_note?: string;
  form_field_1_value?: string; form_field_2_value?: string;
};

type UserStats = {
  days_since_signup: number;
  active_days: number;
  current_streak: number;
  longest_streak: number;
  available_points: number;
  available_inr: number;
  total_earned_points: number;
  total_earned_inr: number;
  campaigns_approved: number;
  campaigns_rejected: number;
  campaigns_pending: number;
  campaign_earned_points: number;
  campaign_earned_inr: number;
  games_task_earned_points: number;
  games_task_earned_inr: number;
  total_referrals: number;
  referral_earned_points: number;
  referral_earned_inr: number;
  withdrawal_successful_points: number;
  withdrawal_successful_inr: number;
  withdrawal_rejected_points: number;
  withdrawal_rejected_inr: number;
  withdrawal_pending_points: number;
  withdrawal_pending_inr: number;
};

type DrillKind = "transactions" | "stats" | "withdrawals" | "completions" | "checkins" | "referrals" | null;

export default function AdminUsers() {
  const router = useRouter();
  const params = useLocalSearchParams<{ active?: string }>();
  const activeOnly = params.active === "1";
  const [items, setItems] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [adjustSource, setAdjustSource] = useState<"games_task" | "campaign">("games_task");
  const [busy, setBusy] = useState(false);
  const [ovRatio, setOvRatio] = useState("");
  const [ovChips, setOvChips] = useState("");
  const [savingOv, setSavingOv] = useState(false);

  const [drill, setDrill] = useState<DrillKind>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [txnFilter, setTxnFilter] = useState<TxnFilter>("all");
  const [stats, setStats] = useState<UserStats | null>(null);
  const [refs, setRefs] = useState<Referral[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [checkins, setCheckins] = useState<Txn[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const load = useCallback(async (search = "") => {
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("q", search);
      if (activeOnly) qs.set("active", "1");
      const url = qs.toString() ? `/admin/users?${qs.toString()}` : "/admin/users";
      setItems(await api<AdminUser[]>(url));
    } catch {}
  }, [activeOnly]);

  useEffect(() => { load(); }, [load]);

  const search = () => load(q);

  useEffect(() => {
    if (selected) {
      const r = (selected as any).custom_exchange_ratio;
      const a = (selected as any).custom_withdraw_amounts;
      setOvRatio(r ? String(r) : "");
      setOvChips(Array.isArray(a) ? a.join(", ") : "");
    }
  }, [selected]);

  const saveOverrides = async () => {
    if (!selected) return;
    setSavingOv(true);
    try {
      const ratio = ovRatio.trim() ? parseInt(ovRatio.trim(), 10) : null;
      const chips = ovChips.trim()
        ? ovChips.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0)
        : null;
      await api(`/admin/users/${selected.user_id}/overrides`, {
        method: "PUT",
        body: { custom_exchange_ratio: ratio, custom_withdraw_amounts: chips },
      });
      toast.success("Overrides saved", { description: "Applies only to this user." });
      setSelected({ ...(selected as any), custom_exchange_ratio: ratio, custom_withdraw_amounts: chips });
      load(q);
    } catch (e: any) {
      toast.error("Failed", { description: e?.message });
    } finally {
      setSavingOv(false);
    }
  };

  const adjust = async (sign: 1 | -1) => {
    if (!selected) return;
    const n = parseInt(delta, 10);
    if (isNaN(n) || n <= 0) {
      toast.error("Invalid", { description: "Enter a positive number" });
      return;
    }
    if (!reason.trim()) {
      toast.error("Required", { description: "Please add a reason" });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ new_points: number }>(
        `/admin/users/${selected.user_id}/adjust-points`,
        { method: "POST", body: { delta: sign * n, reason, source: adjustSource } },
      );
      toast.success("Done", { description: `New balance: ${res.new_points} pts` });
      setSelected(null); setDelta(""); setReason("");
      setAdjustSource("games_task");
      await load(q);
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed" });
    } finally {
      setBusy(false);
    }
  };

  const performDelete = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/admin/users/${selected.user_id}`, { method: "DELETE" });
      toast.success("Deleted", { description: "User account permanently removed" });
      setSelected(null);
      await load(q);
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed" });
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = () => {
    if (!selected) return;
    const ident = selected.mobile_number || selected.email;
    Alert.alert(
      "Delete this user?",
      `Permanently delete ${selected.name} (${ident})?\n\nAll their data, transactions and withdrawals will be removed. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => { performDelete(); } },
      ],
    );
  };

  const openDrill = async (kind: Exclude<DrillKind, null>) => {
    if (!selected) return;
    setDrill(kind);
    setDrillLoading(true);
    try {
      if (kind === "transactions") {
        setTxns(await api<Txn[]>(`/admin/users/${selected.user_id}/transactions`));
      } else if (kind === "stats") {
        setStats(await api<UserStats>(`/admin/users/${selected.user_id}/stats`));
      } else if (kind === "referrals") {
        setRefs(await api<Referral[]>(`/admin/users/${selected.user_id}/referrals`));
      } else if (kind === "withdrawals") {
        setWithdrawals(await api<Withdrawal[]>(`/admin/users/${selected.user_id}/withdrawals`));
      } else if (kind === "completions") {
        setCompletions(await api<Completion[]>(`/admin/users/${selected.user_id}/completions`));
      } else if (kind === "checkins") {
        setCheckins(await api<Txn[]>(`/admin/users/${selected.user_id}/checkins`));
      }
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to load" });
      setDrill(null);
    } finally {
      setDrillLoading(false);
    }
  };

  const drillTitle: Record<Exclude<DrillKind, null>, string> = {
    transactions: "Transaction History",
    stats: "User Stats",
    withdrawals: "Withdraw history",
    completions: "High-paying task history",
    checkins: "Streak / check-in history",
    referrals: "Referred users",
  };

  const headerTitle = activeOnly ? "Active Users" : "Users";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{headerTitle}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={18} color={theme.colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={search}
            placeholder="Search by name or mobile number"
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            testID="user-search"
          />
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={search} testID="search-btn">
          <Text style={styles.searchBtnText}>Find</Text>
        </TouchableOpacity>
      </View>

      {activeOnly && (
        <View style={styles.filterChip} testID="active-filter-chip">
          <Text style={styles.filterChipText}>Showing users active today</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: 10 }}>
        {items.map((u) => (
          <TouchableOpacity
            key={u.user_id}
            style={styles.user}
            onPress={() => setSelected(u)}
            testID={`user-${u.user_id}`}
            activeOpacity={0.85}
          >
            <Image source={{ uri: u.picture || "https://images.unsplash.com/photo-1704726135027-9c6f034cfa41?w=100&q=70" }} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{u.name} {u.is_admin && "🛡️"}</Text>
              <Text style={styles.userEmail}>{u.mobile_number || "No mobile"}</Text>
              <View style={styles.rowStats}>
                <Text style={styles.stat}>{u.points} pts</Text>
                <Text style={styles.statSep}>•</Text>
                <Text style={styles.stat}>Earned {u.total_earned}</Text>
                <Text style={styles.statSep}>•</Text>
                <Text style={styles.stat}>Refer {u.referrals_count ?? 0}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
        {items.length === 0 && <Text style={styles.empty}>No users found</Text>}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.overlay}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{selected?.name}</Text>
              <TouchableOpacity onPress={() => setSelected(null)} testID="close-modal">
                <X size={22} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetEmail}>
              {selected?.mobile_number ? `📱 ${selected.mobile_number}` : "📱 No mobile number on file"}
            </Text>

            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 12 }}>
              <View style={styles.detailGrid}>
                <Detail label="Balance" value={`${selected?.points ?? 0} pts`}
                  onPress={() => openDrill("transactions")} testID="detail-balance" />
                <Detail label="Total withdrawn" value={`${selected?.total_withdrawn ?? 0}`}
                  onPress={() => openDrill("withdrawals")} testID="detail-withdrawn" />
                <Detail label="Stats" value="View"
                  onPress={() => openDrill("stats")} testID="detail-stats" />
                <Detail label="Tasks done" value={`${selected?.total_tasks ?? 0}`}
                  onPress={() => openDrill("completions")} testID="detail-tasks" />
                <Detail label="Streak" value={`${selected?.streak ?? 0} days`}
                  onPress={() => openDrill("checkins")} testID="detail-streak" />
                <Detail label="Refer" value={`${selected?.referrals_count ?? 0}`}
                  onPress={() => openDrill("referrals")} testID="detail-refer" />
              </View>

              <Text style={styles.sectionTitle}>Adjust points</Text>
              <View style={styles.sourceToggle} testID="adjust-source-row">
                <TouchableOpacity
                  style={[styles.sourceBtn, adjustSource === "games_task" && styles.sourceBtnActive]}
                  onPress={() => setAdjustSource("games_task")}
                  testID="adjust-source-games"
                >
                  <Text style={[styles.sourceBtnText, adjustSource === "games_task" && styles.sourceBtnTextActive]}>
                    Games & Task
                  </Text>
                  <Text style={[styles.sourceBtnSub, adjustSource === "games_task" && { color: "rgba(255,255,255,0.85)" }]}>
                    {selected?.games_task_points ?? 0} pts
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sourceBtn, adjustSource === "campaign" && styles.sourceBtnActive]}
                  onPress={() => setAdjustSource("campaign")}
                  testID="adjust-source-campaign"
                >
                  <Text style={[styles.sourceBtnText, adjustSource === "campaign" && styles.sourceBtnTextActive]}>
                    Campaigns
                  </Text>
                  <Text style={[styles.sourceBtnSub, adjustSource === "campaign" && { color: "rgba(255,255,255,0.85)" }]}>
                    {selected?.campaign_points ?? 0} pts
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={delta} onChangeText={setDelta}
                keyboardType="number-pad" placeholder="Amount (e.g. 100)"
                placeholderTextColor={theme.colors.muted}
                style={styles.input} testID="adjust-amount"
              />
              <TextInput
                value={reason} onChangeText={setReason}
                placeholder="Reason (shown in user's transaction history)"
                placeholderTextColor={theme.colors.muted}
                style={styles.input} testID="adjust-reason"
              />
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.colors.danger }]}
                  disabled={busy}
                  onPress={() => adjust(-1)}
                  testID="cut-points"
                >
                  <Minus size={16} color="#fff" />
                  <Text style={styles.btnText}>Cut</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.colors.success }]}
                  disabled={busy}
                  onPress={() => adjust(1)}
                  testID="add-points"
                >
                  <Plus size={16} color="#fff" />
                  <Text style={styles.btnText}>Add</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>Per-user overrides</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12, marginBottom: 6 }}>
                Leave blank to use the global App Config.
              </Text>
              <TextInput
                value={ovRatio} onChangeText={setOvRatio} keyboardType="number-pad"
                placeholder="Exchange ratio (points = ₹1)"
                placeholderTextColor={theme.colors.muted} style={styles.input} testID="ov-ratio"
              />
              <TextInput
                value={ovChips} onChangeText={setOvChips}
                placeholder="Withdraw chips, comma-separated (e.g. 100, 10000, 30000)"
                placeholderTextColor={theme.colors.muted} style={styles.input} testID="ov-chips"
              />
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.colors.primary, marginTop: 8 }]}
                disabled={savingOv} onPress={saveOverrides} testID="save-overrides"
              >
                <Text style={styles.btnText}>{savingOv ? "Saving…" : "Save overrides"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                disabled={busy}
                onPress={deleteUser}
                testID="delete-user"
              >
                <Trash2 size={16} color={theme.colors.danger} />
                <Text style={styles.deleteText}>Delete account permanently</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Drill-down modal */}
      <Modal visible={!!drill} transparent animationType="slide" onRequestClose={() => setDrill(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: "82%" }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {drill ? drillTitle[drill] : ""}
              </Text>
              <TouchableOpacity onPress={() => setDrill(null)} testID="close-drill">
                <X size={22} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>
            {drillLoading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
            ) : drill === "transactions" ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                  {(["all","games_task","campaign","withdrawals"] as TxnFilter[]).map((f) => {
                    const active = txnFilter === f;
                    return (
                      <TouchableOpacity
                        key={f}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setTxnFilter(f)}
                        testID={`txn-filter-${f}`}
                      >
                        <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                          {f === "all" ? "All" : f === "games_task" ? "Games & Task" : f === "campaign" ? "Campaigns" : "Withdrawals"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <ScrollView style={{ marginTop: 4 }}>
                  {(() => {
                    const filtered = txns.filter((t) => {
                      if (txnFilter === "all") return true;
                      if (txnFilter === "withdrawals") return t.source === "withdraw";
                      return (t.category || "games_task") === txnFilter;
                    });
                    if (filtered.length === 0) {
                      return <Text style={styles.empty}>No transactions in this category</Text>;
                    }
                    return filtered.map((t, i) => (
                      <View key={(t.id || "") + i} style={styles.txnRow} testID={`txn-row-${i}`}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.txnTitle}>{t.note || t.source}</Text>
                          <Text style={styles.txnSub}>
                            {new Date(t.created_at).toLocaleString()} • {t.source}
                            {t.category === "campaign" ? " • Campaigns" : ""}
                          </Text>
                        </View>
                        <Text style={[styles.txnDelta, t.points >= 0 ? styles.green : styles.red]}>
                          {t.points >= 0 ? "+" : ""}{t.points} pts
                        </Text>
                      </View>
                    ));
                  })()}
                </ScrollView>
              </>
            ) : drill === "stats" ? (
              <ScrollView style={{ marginTop: 8 }} contentContainerStyle={{ paddingBottom: 12 }}>
                {!stats ? (
                  <Text style={styles.empty}>Loading…</Text>
                ) : (
                  <>
                    <StatSection title="Usage">
                      <StatRow label="Days since signup" value={`${stats.days_since_signup} days`} />
                      <StatRow label="Active days (used app)" value={`${stats.active_days} days`} />
                      <StatRow label="Current streak" value={`${stats.current_streak} days`} />
                      <StatRow label="Longest streak" value={`${stats.longest_streak} days`} />
                    </StatSection>

                    <StatSection title="Wallet">
                      <StatRow label="Available balance" value={`${stats.available_points} pts • ₹${stats.available_inr}`} />
                      <StatRow label="Total earned" value={`${stats.total_earned_points} pts • ₹${stats.total_earned_inr}`} />
                    </StatSection>

                    <StatSection title="Campaigns">
                      <StatRow label="Approved" value={`${stats.campaigns_approved}`} />
                      <StatRow label="Pending" value={`${stats.campaigns_pending}`} />
                      <StatRow label="Rejected" value={`${stats.campaigns_rejected}`} />
                      <StatRow label="Earned via Campaigns" value={`${stats.campaign_earned_points} pts • ₹${stats.campaign_earned_inr}`} />
                    </StatSection>

                    <StatSection title="Games & Tasks">
                      <StatRow label="Earned via Games & Tasks" value={`${stats.games_task_earned_points} pts • ₹${stats.games_task_earned_inr}`} />
                    </StatSection>

                    <StatSection title="Referrals">
                      <StatRow label="Total referrals" value={`${stats.total_referrals}`} />
                      <StatRow label="Earned via referrals" value={`${stats.referral_earned_points} pts • ₹${stats.referral_earned_inr}`} />
                    </StatSection>

                    <StatSection title="Withdrawals">
                      <StatRow label="Successful" value={`${stats.withdrawal_successful_points} pts • ₹${stats.withdrawal_successful_inr}`} valueColor={theme.colors.success} />
                      <StatRow label="Pending" value={`${stats.withdrawal_pending_points} pts • ₹${stats.withdrawal_pending_inr}`} />
                      <StatRow label="Rejected" value={`${stats.withdrawal_rejected_points} pts • ₹${stats.withdrawal_rejected_inr}`} valueColor={theme.colors.danger} />
                    </StatSection>
                  </>
                )}
              </ScrollView>
            ) : drill === "referrals" ? (
              <ScrollView style={{ marginTop: 8 }}>
                {refs.length === 0 && <Text style={styles.empty}>No referrals yet</Text>}
                {refs.map((r, i) => (
                  <View key={r.user_id} style={styles.txnRow} testID={`ref-row-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnTitle}>{r.name}</Text>
                      <Text style={styles.txnSub}>
                        {r.mobile_number || "No mobile"} • Streak {r.streak}
                      </Text>
                    </View>
                    <Text style={styles.txnSub}>
                      {r.joined_at ? new Date(r.joined_at).toLocaleDateString() : ""}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : drill === "withdrawals" ? (
              <ScrollView style={{ marginTop: 8 }}>
                {withdrawals.length === 0 && <Text style={styles.empty}>No withdrawals yet</Text>}
                {withdrawals.map((w, i) => {
                  const inr = (w.inr_amount ?? 0).toFixed(2);
                  const sourceTag = w.source === "campaign" ? "Campaigns" : "Games & Task";
                  const method = w.method ? w.method.toUpperCase() : "";
                  const dest = w.method === "upi" ? (w.upi_id || "") :
                    w.method === "bank" ? `${w.bank_holder || ""} • ${w.bank_account || ""}` : "";
                  return (
                    <View key={(w.id || "") + i} style={styles.txnRow} testID={`wd-row-${i}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txnTitle}>
                          ₹{inr} {method ? `• ${method}` : ""} {sourceTag ? `• ${sourceTag}` : ""}
                        </Text>
                        <Text style={styles.txnSub}>
                          {w.points ?? 0} pts • {new Date(w.created_at).toLocaleString()}
                        </Text>
                        {!!dest && <Text style={styles.txnSub}>{dest}</Text>}
                        {!!w.admin_note && <Text style={[styles.txnSub, { color: theme.colors.danger }]}>Note: {w.admin_note}</Text>}
                      </View>
                      <Text style={[styles.txnDelta, w.status === "successful" ? styles.green : w.status === "rejected" ? styles.red : null]}>
                        {w.status}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            ) : drill === "completions" ? (
              <ScrollView style={{ marginTop: 8 }}>
                {completions.length === 0 && <Text style={styles.empty}>No high-paying tasks yet</Text>}
                {completions.map((c, i) => (
                  <View key={(c.id || "") + i} style={styles.txnRow} testID={`cmp-row-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnTitle}>{c.campaign_name || "Task"}</Text>
                      <Text style={styles.txnSub}>
                        {new Date(c.created_at).toLocaleString()} • {c.status}
                      </Text>
                      {(c.form_field_1_value || c.form_field_2_value) ? (
                        <View style={styles.proofBox}>
                          {!!c.form_field_1_value && (
                            <Text style={styles.proofText}>1: {c.form_field_1_value}</Text>
                          )}
                          {!!c.form_field_2_value && (
                            <Text style={styles.proofText}>2: {c.form_field_2_value}</Text>
                          )}
                        </View>
                      ) : null}
                      {!!c.admin_note && (
                        <Text style={[styles.txnSub, { color: theme.colors.danger, fontStyle: "italic" }]}>
                          Note: {c.admin_note}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.txnDelta, c.status === "approved" ? styles.green : c.status === "rejected" ? styles.red : null]}>
                      {c.status === "approved" ? `+${c.reward_points ?? 0} pts` : c.status}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : drill === "checkins" ? (
              <ScrollView style={{ marginTop: 8 }}>
                {checkins.length === 0 && <Text style={styles.empty}>No check-ins yet</Text>}
                {checkins.map((t, i) => (
                  <View key={(t.id || "") + i} style={styles.txnRow} testID={`ci-row-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnTitle}>{t.note || "Daily check-in"}</Text>
                      <Text style={styles.txnSub}>{new Date(t.created_at).toLocaleString()}</Text>
                    </View>
                    <Text style={[styles.txnDelta, styles.green]}>+{t.points} pts</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Detail({
  label, value, onPress, testID,
}: { label: string; value: string; onPress?: () => void; testID?: string }) {
  const inner = (
    <>
      <Text style={styles.detailValue}>{value}</Text>
      <Text style={styles.detailLabel}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={styles.detail} onPress={onPress} testID={testID} activeOpacity={0.75}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.detail}>{inner}</View>;
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.statSection}>
      <Text style={styles.statSectionTitle}>{title}</Text>
      <View style={styles.statCard}>{children}</View>
    </View>
  );
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, !!valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    paddingHorizontal: 14, borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 12, color: theme.colors.text, fontSize: 14 },
  searchBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 18, justifyContent: "center", borderRadius: theme.radii.lg },
  searchBtnText: { color: "#fff", fontWeight: "800" },
  filterChip: {
    marginHorizontal: theme.spacing.lg, marginBottom: 4,
    backgroundColor: theme.colors.primarySoft,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, alignSelf: "flex-start",
  },
  filterChipText: { color: theme.colors.primary, fontWeight: "800", fontSize: 11, letterSpacing: 0.6 },
  user: {
    flexDirection: "row", gap: 12, alignItems: "center",
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#eee" },
  userName: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  userEmail: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  rowStats: { flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" },
  stat: { fontSize: 11, color: theme.colors.text, fontWeight: "700" },
  statSep: { color: theme.colors.muted },
  empty: { color: theme.colors.muted, textAlign: "center", padding: 24 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: theme.spacing.lg, paddingBottom: 40,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
  sheetEmail: { fontSize: 13, color: theme.colors.muted, marginTop: 4, marginBottom: 12 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  detail: {
    backgroundColor: theme.colors.bg, padding: 12, borderRadius: 12,
    minWidth: "30%",
  },
  detailValue: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  detailLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 2, fontWeight: "700" },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text, marginTop: 8, marginBottom: 8 },
  sourceToggle: {
    flexDirection: "row", gap: 8, marginBottom: 10,
  },
  sourceBtn: {
    flex: 1,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.bg,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center",
  },
  sourceBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  sourceBtnText: {
    color: theme.colors.text, fontSize: 12, fontWeight: "800",
  },
  sourceBtnTextActive: { color: "#fff" },
  sourceBtnSub: {
    color: theme.colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2,
  },
  chipRow: {
    flexDirection: "row", gap: 8, marginTop: 8, paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.bg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipTxt: { color: theme.colors.text, fontSize: 11, fontWeight: "800" },
  chipTxtActive: { color: "#fff" },
  input: {
    backgroundColor: theme.colors.bg, borderRadius: theme.radii.md,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: theme.colors.text,
    borderWidth: 1, borderColor: theme.colors.border, marginBottom: 8,
  },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: theme.radii.md,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, marginTop: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1, borderColor: theme.colors.danger,
    backgroundColor: "rgba(255,107,107,0.06)",
  },
  deleteText: { color: theme.colors.danger, fontWeight: "800", fontSize: 14 },
  txnRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  txnTitle: { color: theme.colors.text, fontWeight: "700", fontSize: 14 },
  txnSub: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  txnDelta: { fontWeight: "800", fontSize: 14 },
  green: { color: theme.colors.success },
  red: { color: theme.colors.danger },
  proofBox: {
    backgroundColor: theme.colors.bg, padding: 8, borderRadius: 8, marginTop: 6, gap: 2,
  },
  proofText: { fontSize: 11, color: theme.colors.text, fontWeight: "600" },
  statSection: { marginBottom: 14 },
  statSectionTitle: {
    fontSize: 11, fontWeight: "800", color: theme.colors.muted,
    letterSpacing: 1, marginBottom: 6, marginLeft: 4,
  },
  statCard: {
    backgroundColor: theme.colors.bg, borderRadius: 12, padding: 4,
  },
  statRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  statLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: "600", flex: 1, marginRight: 8 },
  statValue: { color: theme.colors.text, fontSize: 13, fontWeight: "800" },
});
