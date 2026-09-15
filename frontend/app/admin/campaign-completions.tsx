import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Check, X, Clock, ListChecks, History } from "lucide-react-native";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";
import PromptModal from "../../src/components/PromptModal";

type Comp = {
  id: string; user_id: string; user_email: string; user_name: string;
  user_mobile?: string | null;
  campaign_name: string; reward_points: number;
  form_field_1_value?: string; form_field_2_value?: string;
  status: "pending" | "approved" | "rejected"; created_at: string;
  admin_note?: string;
};

type Txn = {
  id: string; source: string; points: number; note: string;
  category?: string; created_at: string;
};

type TxnFilter = "all" | "games_task" | "campaign" | "withdrawals";

export default function AdminCampaignCompletions() {
  const router = useRouter();
  const [items, setItems] = useState<Comp[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [customFor, setCustomFor] = useState<Comp | null>(null);
  const [historyUser, setHistoryUser] = useState<{ user_id: string; name: string; email: string; mobile?: string | null } | null>(null);
  const [historyTxns, setHistoryTxns] = useState<Txn[]>([]);
  const [historyFilter, setHistoryFilter] = useState<TxnFilter>("all");

  const load = useCallback(async () => {
    try { setItems(await api<Comp[]>("/admin/campaign-completions")); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const viewHistory = async (c: Comp) => {
    setHistoryUser({ user_id: c.user_id, name: c.user_name, email: c.user_email, mobile: c.user_mobile });
    setHistoryTxns([]);
    setHistoryFilter("all");
    try {
      const t = await api<Txn[]>(`/admin/users/${c.user_id}/transactions`);
      setHistoryTxns(t);
    } catch {}
  };

  const submitUpdate = async (id: string, status: Comp["status"], reason: string, approvedPoints?: number) => {
    try {
      const body: any = { status, admin_note: reason };
      if (status === "approved" && approvedPoints !== undefined) {
        body.approved_points = approvedPoints;
      }
      await api(`/admin/campaign-completions/${id}`, { method: "PUT", body });
      load();
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed" });
    }
  };

  const update = (id: string, status: Comp["status"], needReason = false) => {
    if (needReason) { setRejectFor(id); return; }
    submitUpdate(id, status, "");
  };

  const onRejectConfirm = (reason: string) => {
    if (!reason.trim()) { toast.error("Reason required"); return; }
    const id = rejectFor;
    setRejectFor(null);
    if (id) submitUpdate(id, "rejected", reason.trim());
  };

  const onResetConfirm = async (reason: string) => {
    if (!reason.trim()) { toast.error("Reason required"); return; }
    const id = resetFor;
    setResetFor(null);
    if (!id) return;
    try {
      await api(`/admin/campaign-completions/${id}?reason=${encodeURIComponent(reason.trim())}`, { method: "DELETE" });
      toast.success("Task reset", { description: "Removed; any approved reward was deducted." });
      load();
    } catch (e: any) {
      toast.error("Failed to reset", { description: e?.message });
    }
  };

  const onCustomConfirm = (input: string) => {
    if (!customFor) return;
    const n = parseInt(input.trim(), 10);
    if (Number.isNaN(n) || n < 0 || n > customFor.reward_points) {
      toast.error("Invalid", { description: `Enter 0 to ${customFor.reward_points}` });
      return;
    }
    const id = customFor.id;
    setCustomFor(null);
    submitUpdate(id, "approved", "", n);
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);
  const filteredHistory = historyTxns.filter((t) => {
    if (historyFilter === "all") return true;
    if (historyFilter === "withdrawals") return t.source === "withdraw";
    return (t.category || "games_task") === historyFilter;
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Campaign Tasks</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.tabs}>
        {(["pending", "approved", "rejected", "all"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, filter === t && styles.tabActive]}
            onPress={() => setFilter(t)}
            testID={`filter-${t}`}
          >
            <Text style={[styles.tabText, filter === t && styles.tabTextActive]}>
              {t.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: 10 }}>
        {filtered.map((c) => (
          <View key={c.id} style={styles.card} testID={`comp-${c.id}`}>
            <View style={styles.row}>
              <View style={[styles.icon, statusBg(c.status)]}>
                {c.status === "approved" ? <Check size={16} color={theme.colors.success} /> :
                  c.status === "rejected" ? <X size={16} color={theme.colors.danger} /> :
                  <Clock size={16} color={theme.colors.secondary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cmp}>{c.campaign_name}</Text>
                <Text style={styles.user}>
                  {c.user_name}
                  {c.user_mobile ? ` • 📱 ${c.user_mobile}` : ` • ${c.user_email}`}
                </Text>
                <Text style={styles.date}>{new Date(c.created_at).toLocaleString()}</Text>
                {(c.form_field_1_value || c.form_field_2_value) && (
                  <View style={styles.proofBox}>
                    {!!c.form_field_1_value && <Text style={styles.proofText}>1: {c.form_field_1_value}</Text>}
                    {!!c.form_field_2_value && <Text style={styles.proofText}>2: {c.form_field_2_value}</Text>}
                  </View>
                )}
                {!!c.admin_note && <Text style={styles.adminNote}>Note: {c.admin_note}</Text>}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.points}>+{c.reward_points}</Text>
                <Text style={[styles.status, statusColor(c.status)]}>{c.status.toUpperCase()}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.historyBtn}
              onPress={() => viewHistory(c)}
              testID={`view-history-${c.id}`}
            >
              <History size={14} color={theme.colors.primary} />
              <Text style={styles.historyBtnText}>View user's transaction history</Text>
            </TouchableOpacity>
            {c.status === "pending" && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.colors.success }]}
                  onPress={() => update(c.id, "approved")}
                  testID={`approve-${c.id}`}
                >
                  <Check size={16} color="#fff" />
                  <Text style={styles.btnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.colors.secondary }]}
                  onPress={() => setCustomFor(c)}
                  testID={`approve-custom-${c.id}`}
                >
                  <Check size={16} color="#fff" />
                  <Text style={styles.btnText}>Approve…</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.colors.danger }]}
                  onPress={() => update(c.id, "rejected", true)}
                  testID={`reject-${c.id}`}
                >
                  <X size={16} color="#fff" />
                  <Text style={styles.btnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
            {c.status !== "pending" && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: theme.colors.danger }]}
                  onPress={() => setResetFor(c.id)}
                  testID={`reset-${c.id}`}
                >
                  <X size={16} color="#fff" />
                  <Text style={styles.btnText}>Reset</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
        {filtered.length === 0 && (
          <View style={{ alignItems: "center", padding: 36 }}>
            <ListChecks size={36} color={theme.colors.muted} />
            <Text style={styles.empty}>No {filter} tasks.</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!historyUser} transparent animationType="slide" onRequestClose={() => setHistoryUser(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Transaction History</Text>
                <Text style={styles.sheetSub}>
                  {historyUser?.name}
                  {historyUser?.mobile ? ` • 📱 ${historyUser.mobile}` : ` • ${historyUser?.email}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryUser(null)} testID="close-history">
                <X size={22} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipsRow}>
              {(["all","games_task","campaign","withdrawals"] as TxnFilter[]).map((f) => {
                const active = historyFilter === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setHistoryFilter(f)}
                    testID={`camp-filter-${f}`}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {f === "all" ? "All" : f === "games_task" ? "Games & Task" : f === "campaign" ? "Campaigns" : "Withdrawals"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ScrollView style={{ maxHeight: 440 }}>
              {filteredHistory.length === 0 ? (
                <Text style={styles.empty}>No transactions in this category.</Text>
              ) : (
                filteredHistory.map((t) => (
                  <View key={t.id} style={styles.txnRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnTitle}>{t.note || t.source}</Text>
                      <Text style={styles.txnDate}>
                        {new Date(t.created_at).toLocaleString()}
                        {t.category === "campaign" ? " • Campaigns" : " • Games & Task"}
                      </Text>
                    </View>
                    <Text style={[styles.txnAmt, { color: t.points > 0 ? theme.colors.success : theme.colors.danger }]}>
                      {t.points > 0 ? "+" : ""}{t.points} pts
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PromptModal
        visible={!!rejectFor}
        title="Rejection reason"
        placeholder="Why is this task being rejected?"
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejectFor(null)}
        onConfirm={onRejectConfirm}
      />

      <PromptModal
        visible={!!customFor}
        title={customFor ? `Approve with custom points (0–${customFor.reward_points})` : "Approve"}
        placeholder={customFor ? `e.g. 0 to ${customFor.reward_points}` : "Points"}
        confirmLabel="Approve"
        keyboardType="number-pad"
        onCancel={() => setCustomFor(null)}
        onConfirm={onCustomConfirm}
      />
      <PromptModal
        visible={!!resetFor}
        title="Reset task"
        placeholder="Reason (approved rewards will be deducted)"
        confirmLabel="Reset"
        destructive
        onCancel={() => setResetFor(null)}
        onConfirm={onResetConfirm}
      />
    </SafeAreaView>
  );
}

const statusBg = (s: string) =>
  s === "approved" ? { backgroundColor: "rgba(16,185,129,0.12)" } :
  s === "rejected" ? { backgroundColor: "rgba(255,107,107,0.12)" } :
  { backgroundColor: "rgba(255,193,7,0.18)" };

const statusColor = (s: string) =>
  s === "approved" ? { color: theme.colors.success } :
  s === "rejected" ? { color: theme.colors.danger } :
  { color: "#B45309" };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: theme.spacing.lg, marginBottom: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  tabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tabText: { color: theme.colors.muted, fontSize: 11, fontWeight: "800" },
  tabTextActive: { color: "#fff" },
  card: {
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, gap: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cmp: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  user: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  date: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  proofBox: {
    backgroundColor: theme.colors.bg, padding: 8, borderRadius: 8, marginTop: 6, gap: 2,
  },
  proofText: { fontSize: 11, color: theme.colors.text, fontWeight: "600" },
  adminNote: { fontSize: 11, color: theme.colors.danger, marginTop: 4, fontStyle: "italic" },
  points: { fontSize: 16, fontWeight: "800", color: theme.colors.success },
  status: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  historyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.primarySoft,
    backgroundColor: theme.colors.primarySoft,
  },
  historyBtnText: { color: theme.colors.primary, fontWeight: "800", fontSize: 12 },
  actions: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: 10,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  empty: { color: theme.colors.muted, marginTop: 12, textAlign: "center", padding: 16 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: theme.spacing.lg, paddingBottom: 40, gap: 10, maxHeight: "70%",
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  sheetSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  filterChipsRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.bg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: { color: theme.colors.text, fontSize: 11, fontWeight: "800" },
  filterChipTextActive: { color: "#fff" },
  txnRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  txnTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  txnDate: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  txnAmt: { fontSize: 14, fontWeight: "800" },
});
