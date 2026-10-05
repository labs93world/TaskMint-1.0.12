import React, { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";
import { Segmented } from "@/src/components/ui/Segmented";
import { Popup } from "@/src/components/ui/Popup";
import { Button } from "@/src/components/ui/Button";
import { useToast } from "@/src/components/ui/Toast";

export type ReviewItem = {
  id: string;
  title: string; // "Name • Mobile"
  subtitle: string; // "₹X • detail"
  copyText?: string;
  proof?: string;
  reason?: string;
};

export type ReviewCategory = { key: string; label: string };

export function RequestReview({
  heading,
  categories,
  load,
  onApprove,
  onReject,
}: {
  heading: string;
  categories: ReviewCategory[];
  load: (statusKey: string) => Promise<ReviewItem[]>;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState(categories[0].key);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    async (key: string) => {
      setLoading(true);
      try {
        setItems(await load(key));
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [load],
  );

  useFocusEffect(
    useCallback(() => {
      refresh(tab);
    }, [refresh, tab]),
  );

  const onTab = (k: string) => {
    setTab(k);
    refresh(k);
  };

  const doApprove = async () => {
    if (!approveId) return;
    setBusy(true);
    try {
      await onApprove(approveId);
      toast.show("Approved", "success");
      setApproveId(null);
      refresh(tab);
    } catch {
      toast.show("Action failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!rejectId) return;
    if (reason.trim().length < 2) {
      toast.show("Please provide a reason", "error");
      return;
    }
    setBusy(true);
    try {
      await onReject(rejectId, reason.trim());
      toast.show("Rejected", "info");
      setRejectId(null);
      setReason("");
      refresh(tab);
    } catch {
      toast.show("Action failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toast.show("Copied to clipboard", "success");
  };

  const isPending = tab === "pending";

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="review-back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.headerTitle}>{heading}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Segmented testID="review-tabs" value={tab} onChange={onTab} options={categories} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
        {loading ? (
          <Text style={styles.empty}>Loading...</Text>
        ) : items.length === 0 ? (
          <Text style={styles.empty}>No {tab} requests</Text>
        ) : (
          <View>
            {items.map((it) => (
              <View key={it.id} style={styles.card} testID={`review-${it.id}`}>
                <View style={styles.cardHead}>
                  <View style={styles.avatar}>
                    <Icon name="user" size={20} color={colors.brand} weight="fill" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{it.title}</Text>
                    <View style={styles.subRow}>
                      <Text style={styles.subtitle} numberOfLines={2}>
                        {it.subtitle}
                      </Text>
                      {!!it.copyText && (
                        <Pressable onPress={() => copy(it.copyText!)} hitSlop={8} style={styles.copyBtn} testID={`copy-${it.id}`}>
                          <Icon name="copy" size={16} color={colors.brand} weight="bold" />
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>

                {it.proof != null && (
                  <View style={styles.proofBox}>
                    <Text style={styles.proofLabel}>Proof</Text>
                    <Text style={styles.proofText}>{it.proof || "—"}</Text>
                  </View>
                )}
                {!!it.reason && <Text style={styles.reasonText}>Reason: {it.reason}</Text>}

                {isPending && (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actBtn, { backgroundColor: colors.success }]}
                      testID={`approve-${it.id}`}
                      onPress={() => setApproveId(it.id)}
                    >
                      <Icon name="check-circle" size={18} color="#FFFFFF" weight="fill" />
                      <Text style={styles.actText}>Approve</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actBtn, { backgroundColor: colors.error }]}
                      testID={`reject-${it.id}`}
                      onPress={() => {
                        setReason("");
                        setRejectId(it.id);
                      }}
                    >
                      <Icon name="x-circle" size={18} color="#FFFFFF" weight="fill" />
                      <Text style={styles.actText}>Reject</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      <Popup visible={!!approveId} onClose={() => setApproveId(null)} title="Approve request?" testID="approve-modal">
        <Text style={styles.modalText}>
          This will mark the request as approved and credit the user. Continue?
        </Text>
        <View style={styles.modalBtns}>
          <Button label="Cancel" variant="tertiary" onPress={() => setApproveId(null)} style={{ flex: 1 }} />
          <Button label="Approve" loading={busy} onPress={doApprove} testID="confirm-approve" style={{ flex: 1 }} />
        </View>
      </Popup>

      <Popup visible={!!rejectId} onClose={() => setRejectId(null)} title="Reject request" testID="reject-modal">
        <Text style={styles.modalText}>Provide a reason for rejection:</Text>
        <TextInput
          testID="reject-reason-input"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Proof not valid"
          placeholderTextColor={colors.muted}
          style={styles.reasonInput}
          multiline
        />
        <View style={styles.modalBtns}>
          <Button label="Cancel" variant="tertiary" onPress={() => setRejectId(null)} style={{ flex: 1 }} />
          <Button label="Reject" loading={busy} onPress={doReject} testID="confirm-reject" style={{ flex: 1 }} />
        </View>
      </Popup>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  empty: { textAlign: "center", color: c.muted, paddingVertical: 48, fontWeight: "600" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 18, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: "row", gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "800", color: c.onSurfaceSecondary },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  subtitle: { flex: 1, fontSize: 14, color: c.onSurfaceTertiary, fontWeight: "600" },
  copyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  proofBox: { backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 12, marginTop: 12 },
  proofLabel: { fontSize: 12, fontWeight: "800", color: c.muted, marginBottom: 4 },
  proofText: { fontSize: 14, color: c.onSurfaceSecondary },
  reasonText: { fontSize: 13, color: c.error, fontWeight: "600", marginTop: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  actBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: 14,
  },
  actText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  modalText: { fontSize: 15, color: c.onSurfaceTertiary, lineHeight: 22 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 20 },
  reasonInput: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 14,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    color: c.onSurfaceSecondary,
    marginTop: 12,
    textAlignVertical: "top",
  },
}));
