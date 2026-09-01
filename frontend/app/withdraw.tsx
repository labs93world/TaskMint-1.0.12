import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft, Check, Clock, X, AlertCircle,
} from "lucide-react-native";
import { theme, pointsToInr, setExchangeRatio } from "../src/lib/theme";
import { api } from "../src/lib/api";
import { useAuth } from "../src/context/AuthContext";
import BalanceCard from "../src/components/BalanceCard";
import RewardedAdModal from "../src/components/RewardedAdModal";
import NativeAd from "../src/components/NativeAd";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

type WD = {
  id: string; method: "upi" | "bank";
  points: number; inr_amount: number;
  upi_id?: string; bank_account?: string; bank_ifsc?: string; bank_holder?: string;
  status: "pending" | "successful" | "rejected"; created_at: string;
  admin_note?: string;
};

type WSettings = {
  amounts: number[];
  exchange_points_per_inr?: number;
  min_withdrawal?: number;
  daily_withdrawal_limit?: number;
};

export default function WithdrawScreen() {
  const maint = useMaintenance("/withdraw");
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [method, setMethod] = useState<"upi" | "bank">("upi");
  const [selectedPts, setSelectedPts] = useState<number | null>(null);
  const [upi, setUpi] = useState("");
  const [acc, setAcc] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<WD[]>([]);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<number[]>([100, 10000, 30000, 50000]);
  const [minWd, setMinWd] = useState<number>(10000);
  const [error, setError] = useState<string | null>(null);
  const [showAdAfter, setShowAdAfter] = useState(false);
  const [mobile1, setMobile1] = useState("");
  const [mobile2, setMobile2] = useState("");
  const needsMobile = !!user && !(user as any).mobile_number;

  const balance = user?.points ?? 0;

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api<WD[]>("/withdraw/history"));
    } catch {}
    setLoading(false);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api<WSettings>("/withdraw-settings", { auth: false });
      setAmounts(s.amounts || [100, 10000, 30000, 50000]);
      if (s.exchange_points_per_inr) setExchangeRatio(s.exchange_points_per_inr);
      if (typeof s.min_withdrawal === "number") setMinWd(s.min_withdrawal);
    } catch {}
  }, []);

  useEffect(() => { loadHistory(); loadSettings(); }, [loadHistory, loadSettings]);

  const visibleAmounts = user?.has_first_withdrawal
    ? amounts.filter((p) => p > 100)
    : amounts;

  const points = selectedPts;

  const formIncomplete = (() => {
    if (!selectedPts) return "Please select an amount first";
    if (method === "upi" && !upi.trim()) return "Please enter your UPI ID";
    if (method === "bank") {
      if (!holder.trim()) return "Please enter Account Holder Name";
      if (!acc.trim()) return "Please enter Account Number";
      if (!ifsc.trim()) return "Please enter IFSC Code";
    }
    if (points && points > balance) return `Insufficient balance (${balance} pts available)`;
    if (points && points < minWd) {
      return `Minimum withdrawal is ${minWd.toLocaleString()} pts (₹${pointsToInr(minWd)})`;
    }
    return null;
  })();

  const submit = async () => {
    const err = formIncomplete;
    if (err) { setError(err); return; }
    setError(null);
    setBusy(true);
    try {
      if (needsMobile) {
        if (!mobile1.trim() || mobile1.trim().length < 10) {
          setError("Enter a valid mobile number");
          setBusy(false); return;
        }
        if (mobile1.trim() !== mobile2.trim()) {
          setError("Mobile numbers do not match");
          setBusy(false); return;
        }
        await api("/profile/mobile", {
          method: "POST",
          body: { mobile_number: mobile1.trim(), confirm_mobile_number: mobile2.trim() },
        });
        await refreshUser();
      }
      await api("/withdraw", {
        method: "POST",
        body: {
          method, points,
          upi_id: method === "upi" ? upi : undefined,
          bank_account: method === "bank" ? acc : undefined,
          bank_ifsc: method === "bank" ? ifsc : undefined,
          bank_holder: method === "bank" ? holder : undefined,
        },
      });
      setSelectedPts(null);
      setUpi(""); setAcc(""); setIfsc(""); setHolder("");
      await Promise.all([refreshUser(), loadHistory()]);
      setShowAdAfter(true);
    } catch (e: any) {
      setError(e?.message || "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = !!formIncomplete;

  if (maint.enabled) return <MaintenanceCard title="Withdraw" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <ChevronLeft size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Withdraw</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 16 }}>
          <BalanceCard points={balance} walletLabel="BALANCE" />

          {/* UPI / Bank segmented tabs */}
          <View style={styles.segRow}>
            <TouchableOpacity
              style={[styles.segBtn, method === "upi" && styles.segBtnActive]}
              onPress={() => setMethod("upi")}
              testID="method-upi"
            >
              <Text style={[styles.segText, method === "upi" && styles.segTextActive]}>UPI</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segBtn, method === "bank" && styles.segBtnActive]}
              onPress={() => setMethod("bank")}
              testID="method-bank"
            >
              <Text style={[styles.segText, method === "bank" && styles.segTextActive]}>Bank</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.amountChips}>
            {visibleAmounts.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, selectedPts === p && styles.chipActive]}
                onPress={() => setSelectedPts(p)}
                testID={`amount-${p}`}
              >
                <Text style={[styles.chipText, selectedPts === p && { color: "#fff" }]}>
                  ₹{Math.round(pointsToInr(p))}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {method === "upi" ? (
            <TextInput
              value={upi} onChangeText={setUpi} placeholder="UPI ID (e.g. yourname@upi)"
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, { marginTop: theme.spacing.md }]} autoCapitalize="none"
              testID="upi-input"
            />
          ) : (
            <>
              <TextInput value={holder} onChangeText={setHolder}
                placeholder="Account Holder Name"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, { marginTop: theme.spacing.md }]} testID="bank-holder-input" />
              <TextInput value={acc} onChangeText={setAcc} keyboardType="number-pad"
                placeholder="Account Number" placeholderTextColor={theme.colors.muted}
                style={[styles.input, { marginTop: 10 }]} testID="bank-acc-input" />
              <TextInput value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())}
                placeholder="IFSC Code" placeholderTextColor={theme.colors.muted}
                style={[styles.input, { marginTop: 10 }]}
                autoCapitalize="characters" testID="bank-ifsc-input" />
            </>
          )}

          {needsMobile && (
            <View>
              <Text style={[styles.sectionLabel, { marginTop: theme.spacing.md }]}>MOBILE NUMBER (one-time)</Text>
              <TextInput value={mobile1} onChangeText={setMobile1} keyboardType="phone-pad"
                placeholder="10-digit mobile" placeholderTextColor={theme.colors.muted}
                maxLength={15} style={[styles.input, { marginTop: 6 }]} testID="wd-mobile1" />
              <TextInput value={mobile2} onChangeText={setMobile2} keyboardType="phone-pad"
                placeholder="Re-enter mobile" placeholderTextColor={theme.colors.muted}
                maxLength={15} style={[styles.input, { marginTop: 10 }]} testID="wd-mobile2" />
            </View>
          )}

          {error && (
            <View style={styles.errorBox} testID="withdraw-error">
              <AlertCircle size={16} color={theme.colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={{ marginTop: theme.spacing.md }}>
            <NativeAd testID="withdraw-native-ad" />
          </View>

          <TouchableOpacity
            style={[
              styles.cta,
              submitDisabled ? styles.ctaDisabled : styles.ctaHighlight,
              busy && { opacity: 0.6 },
            ]}
            onPress={submit}
            disabled={busy}
            testID="submit-withdraw-btn"
          >
            <Text style={[styles.ctaText, submitDisabled && { color: theme.colors.muted }]}>
              {busy ? "Submitting..." : "Submit Withdrawal"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>WITHDRAWAL HISTORY</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 12 }} />
          ) : history.length === 0 ? (
            <Text style={styles.empty}>No withdrawals yet.</Text>
          ) : (
            history.map((h) => (
              <View key={h.id} style={styles.wd} testID={`wd-${h.id}`}>
                <View style={[styles.wdIcon, statusBg(h.status)]}>
                  {h.status === "successful" ? <Check size={16} color={theme.colors.success} /> :
                    h.status === "rejected" ? <X size={16} color={theme.colors.danger} /> :
                    <Clock size={16} color={theme.colors.secondary} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.wdAmt}>₹{Math.round(h.inr_amount)}</Text>
                  <Text style={styles.wdSub} numberOfLines={1}>
                    {new Date(h.created_at).toLocaleString()}
                  </Text>
                  <Text style={styles.wdDetail} numberOfLines={1}>
                    {h.method === "upi"
                      ? `UPI: ${h.upi_id}`
                      : `A/C ${h.bank_account} • ${h.bank_ifsc}`}
                  </Text>
                  {h.status === "rejected" && !!h.admin_note && (
                    <View style={styles.reasonBox}>
                      <AlertCircle size={12} color={theme.colors.danger} />
                      <Text style={styles.reasonText} numberOfLines={3}>
                        Reason: {h.admin_note}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.wdStatus, statusColor(h.status)]}>{h.status.toUpperCase()}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <RewardedAdModal
        visible={showAdAfter}
        duration={3}
        onReward={() => setShowAdAfter(false)}
      />
    </SafeAreaView>
  );
}

const statusBg = (s: string) =>
  s === "successful" ? { backgroundColor: "rgba(16,185,129,0.12)" } :
  s === "rejected" ? { backgroundColor: "rgba(255,107,107,0.12)" } :
  { backgroundColor: "rgba(255,193,7,0.18)" };

const statusColor = (s: string) =>
  s === "successful" ? { color: theme.colors.success } :
  s === "rejected" ? { color: theme.colors.danger } :
  { color: "#B45309" };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  sectionLabel: {
    fontSize: 11, fontWeight: "800", color: theme.colors.muted,
    letterSpacing: 1.4, marginTop: theme.spacing.md, marginBottom: 8,
  },
  segRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  segBtnActive: { backgroundColor: theme.colors.primary },
  segText: { color: theme.colors.muted, fontWeight: "800", fontSize: 13 },
  segTextActive: { color: "#fff" },
  amountChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: theme.spacing.md,
  },
  chip: {
    minWidth: 78,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center",
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: theme.colors.text,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,107,107,0.10)",
    borderWidth: 1, borderColor: "rgba(255,107,107,0.3)",
    borderRadius: theme.radii.md, padding: 12, marginTop: theme.spacing.md,
  },
  errorText: { color: theme.colors.danger, fontSize: 13, fontWeight: "700", flex: 1 },
  cta: {
    height: 56, borderRadius: theme.radii.lg,
    alignItems: "center", justifyContent: "center", marginTop: theme.spacing.md,
  },
  ctaHighlight: { backgroundColor: theme.colors.primary, ...theme.shadow.soft },
  ctaDisabled: { backgroundColor: "#E5E7EB" },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  empty: { color: theme.colors.muted, textAlign: "center", paddingVertical: 16 },
  wd: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: 8,
  },
  wdIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  wdAmt: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  wdSub: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  wdDetail: { fontSize: 11, color: theme.colors.text, marginTop: 2, fontWeight: "600" },
  wdStatus: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  reasonBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "rgba(255,107,107,0.08)",
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6,
    marginTop: 6,
  },
  reasonText: { color: theme.colors.danger, fontSize: 11, fontWeight: "700", flex: 1 },
});
