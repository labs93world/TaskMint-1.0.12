import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";
import { Segmented } from "@/src/components/ui/Segmented";
import { Button } from "@/src/components/ui/Button";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { useUser } from "@/src/context/UserContext";
import { useToast } from "@/src/components/ui/Toast";
import { createPayout } from "@/src/lib/firestore";
import {
  formatPoints,
  formatRupees,
  MIN_WITHDRAW_RUPEES,
  pointsToRupees,
  rupeesToPoints,
} from "@/src/utils/format";
import { formatIST } from "@/src/utils/time";

const CHIPS = [20, 30, 50];
const PAGE = 10;

export default function Wallet() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { points, profile, deviceId, transactions, payouts, reconcile, spendPoints } = useUser();
  const toast = useToast();

  const [method, setMethod] = useState<"UPI" | "Bank">("UPI");
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [histTab, setHistTab] = useState("transactions");
  const [txnLimit, setTxnLimit] = useState(PAGE);
  const [wLimit, setWLimit] = useState(PAGE);

  const balanceRupees = pointsToRupees(points);

  const submit = async () => {
    const amt = parseInt(amount || "0", 10);
    if (!amt || amt < MIN_WITHDRAW_RUPEES) {
      toast.show(`Minimum withdrawal is ${formatRupees(MIN_WITHDRAW_RUPEES)}`, "error");
      return;
    }
    // Validate payout detail format first, so users always get format feedback.
    let payDetail = "";
    if (method === "UPI") {
      const upi = detail.trim();
      // Valid UPI: handle@provider (e.g. name123@okhdfcbank, 9876543210@ybl)
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;
      if (!upiRegex.test(upi)) {
        toast.show("Enter a valid UPI ID (e.g. name@okhdfcbank)", "error");
        return;
      }
      payDetail = upi;
    } else {
      if (accountNo.trim().length < 6 || ifsc.trim().length < 4) {
        toast.show("Enter valid account number and IFSC code", "error");
        return;
      }
      payDetail = `A/C ${accountNo.trim()} • IFSC ${ifsc.trim().toUpperCase()}`;
    }
    if (rupeesToPoints(amt) > points) {
      toast.show("Insufficient balance", "error");
      return;
    }
    setSubmitting(true);
    try {
      await createPayout({
        deviceId,
        name: profile?.name ?? "",
        mobile: profile?.mobile ?? "",
        amount: amt,
        method,
        detail: payDetail,
      });
      // reserve points immediately; refunded automatically if rejected
      await spendPoints(rupeesToPoints(amt), `Withdrawal • ${formatRupees(amt)}`);
      await reconcile();
      setAmount("");
      setDetail("");
      setAccountNo("");
      setIfsc("");
      toast.show("Withdrawal request submitted!", "success");
      setHistTab("withdrawals");
    } catch {
      toast.show("Could not submit. Try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleTxns = useMemo(() => transactions.slice(0, txnLimit), [transactions, txnLimit]);
  const visibleW = useMemo(() => payouts.slice(0, wLimit), [payouts, wLimit]);

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.screenTitle}>Wallet</Text>
        <View style={styles.headerBalance} testID="wallet-balance">
          <Icon name="wallet" size={16} color={colors.brand} weight="fill" />
          <Text style={styles.headerBalanceText} numberOfLines={1} allowFontScaling={false}>
            ₹{balanceRupees.toFixed(2)}
          </Text>
        </View>
      </View>
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      >
        {/* Withdraw */}
        <View style={styles.card}>
          <Segmented
            testID="wallet-method"
            value={method}
            onChange={(k) => setMethod(k as "UPI" | "Bank")}
            options={[
              { key: "UPI", label: "UPI" },
              { key: "Bank", label: "Bank" },
            ]}
          />

          <View style={styles.chips}>
            {CHIPS.map((c) => (
              <Pressable
                key={c}
                testID={`amount-chip-${c}`}
                style={[styles.chip, amount === String(c) && styles.chipActive]}
                onPress={() => setAmount(String(c))}
              >
                <Text style={[styles.chipText, amount === String(c) && styles.chipTextActive]}>
                  ₹{c}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            testID="wallet-amount-input"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="Enter amount (₹)"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={styles.input}
          />
          {method === "UPI" ? (
            <TextInput
              testID="wallet-detail-input"
              value={detail}
              onChangeText={setDetail}
              placeholder="Your UPI ID (e.g. name@upi)"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={[styles.input, { marginTop: 12 }]}
            />
          ) : (
            <>
              <TextInput
                testID="wallet-account-input"
                value={accountNo}
                onChangeText={(t) => setAccountNo(t.replace(/[^0-9]/g, "").slice(0, 18))}
                placeholder="Account number"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={[styles.input, { marginTop: 12 }]}
              />
              <TextInput
                testID="wallet-ifsc-input"
                value={ifsc}
                onChangeText={(t) => setIfsc(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                placeholder="IFSC code"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                style={[styles.input, { marginTop: 12 }]}
              />
            </>
          )}

          <Button
            label="Withdraw"
            testID="wallet-withdraw-button"
            loading={submitting}
            onPress={submit}
            style={{ marginTop: 16 }}
          />
        </View>

        {/* History */}
        <View style={{ marginTop: 16 }} />
        <Segmented
          testID="wallet-history-tabs"
          value={histTab}
          onChange={setHistTab}
          options={[
            { key: "transactions", label: "Transactions" },
            { key: "withdrawals", label: "Withdrawals" },
          ]}
        />

        <View style={{ marginTop: 14 }}>
          {histTab === "transactions" ? (
            transactions.length === 0 ? (
              <EmptyHistory text="No transactions yet" />
            ) : (
              <>
                {visibleTxns.map((t) => (
                  <View key={t.id} style={styles.histRow}>
                    <View
                      style={[
                        styles.histIcon,
                        { backgroundColor: (t.points >= 0 ? colors.success : colors.error) + "1A" },
                      ]}
                    >
                      <Icon
                        name={t.points >= 0 ? "coins" : "wallet"}
                        size={18}
                        color={t.points >= 0 ? colors.success : colors.error}
                        weight="fill"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histTitle} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text style={styles.histDate}>{formatIST(t.createdAt)}</Text>
                    </View>
                    <Text
                      style={[
                        styles.histAmt,
                        { color: t.points >= 0 ? colors.success : colors.error },
                      ]}
                    >
                      {t.points >= 0 ? "+" : ""}
                      {formatPoints(t.points)}
                    </Text>
                  </View>
                ))}
                {transactions.length > txnLimit && (
                  <ViewMore onPress={() => setTxnLimit((l) => l + PAGE)} />
                )}
              </>
            )
          ) : payouts.length === 0 ? (
            <EmptyHistory text="No withdrawals yet" />
          ) : (
            <>
              {visibleW.map((w) => (
                <View key={w.id} style={styles.histRow}>
                  <View style={[styles.histIcon, { backgroundColor: colors.brandTertiary }]}>
                    <Icon name="wallet" size={18} color={colors.brand} weight="fill" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histTitle}>
                      {formatRupees(w.amount)} • {w.method}
                    </Text>
                    <Text style={styles.histDate}>{formatIST(w.createdAt)}</Text>
                  </View>
                  <StatusBadge status={w.status} />
                </View>
              ))}
              {payouts.length > wLimit && (
                <ViewMore onPress={() => setWLimit((l) => l + PAGE)} />
              )}
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function ViewMore({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={styles.viewMore} testID="view-more-button">
      <Text style={styles.viewMoreText}>View 10 more</Text>
    </Pressable>
  );
}

function EmptyHistory({ text }: { text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Icon name="clock" size={36} color={colors.muted} weight="duotone" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: c.surface,
  },
  screenTitle: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  headerBalance: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.brandTertiary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    maxWidth: 160,
  },
  headerBalanceText: { fontSize: 16, fontWeight: "800", color: c.brand },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: c.onSurface,
    marginTop: 22,
    marginBottom: 12,
  },
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  chips: { flexDirection: "row", gap: 10, marginTop: 14 },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  chipActive: { backgroundColor: c.brandTertiary, borderColor: c.brand },
  chipText: { fontSize: 16, fontWeight: "800", color: c.onSurfaceTertiary },
  chipTextActive: { color: c.brand },
  input: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    fontSize: 16,
    fontWeight: "600",
    color: c.onSurfaceSecondary,
    marginTop: 14,
  },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  histIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  histTitle: { fontSize: 15, fontWeight: "700", color: c.onSurfaceSecondary },
  histDate: { fontSize: 12, color: c.muted, marginTop: 2 },
  histAmt: { fontSize: 15, fontWeight: "800" },
  viewMore: {
    alignSelf: "center",
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: c.brandTertiary,
  },
  viewMoreText: { color: c.brand, fontWeight: "800" },
  empty: { alignItems: "center", paddingVertical: 36, gap: 10 },
  emptyText: { fontSize: 15, color: c.muted, fontWeight: "600" },
}));
