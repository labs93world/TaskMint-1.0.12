import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  Linking, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, MessageCircle, ExternalLink, Check, X, Clock, PlayCircle, Megaphone } from "lucide-react-native";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";
import TutorialVideo from "../../src/components/TutorialVideo";

type Campaign = {
  id: string; name: string; note: string; logo_url: string;
  link_url?: string; tutorial_video_url?: string;
  rules?: string; telegram_contact_url?: string;
  form_field_1_label?: string; form_field_1_placeholder?: string;
  form_field_2_label?: string; form_field_2_placeholder?: string;
  category?: string; difficulty?: string;
  reward_points: number; reward_inr: number;
  completion?: { id: string; status: "pending" | "approved" | "rejected"; admin_note?: string } | null;
};

// Extract YouTube video ID from a variety of URL formats
function getYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([\w-]{11})/
  );
  return m ? m[1] : null;
}

export default function TaskDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");
  const [linkOpened, setLinkOpened] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const data = await api<Campaign>(`/campaign/${id}`);
      setC(data);
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Could not load task" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const openLink = async () => {
    if (!c) return;
    const isCampaignKind = (c.category || "") === "Campaigns";
    if (c.link_url) {
      // Campaigns-category tasks are purely promotional links — no tracking,
      // no completion record, no admin approval, no reward. Just open the URL.
      // For every other category, hit /tasks/campaign/{id} so backend can log
      // the click event (analytics) before opening.
      if (!isCampaignKind) {
        try {
          await api(`/tasks/campaign/${c.id}`, { method: "POST" });
        } catch {}
      }
      Linking.openURL(c.link_url).catch(() => toast.error("Cannot open link"));
      setLinkOpened(true);
    }
  };

  const submit = async () => {
    if (!c) return;
    if (c.link_url && !linkOpened) {
      toast.info("Start the task first", { description: 'Please tap "Open Task Link" and complete the task before submitting proof.' });
      return;
    }
    if (c.form_field_1_label && !v1.trim()) {
      toast.error("Required", { description: `Please fill: ${c.form_field_1_label}` });
      return;
    }
    if (c.form_field_2_label && !v2.trim()) {
      toast.error("Required", { description: `Please fill: ${c.form_field_2_label}` });
      return;
    }
    setBusy(true);
    try {
      await api(`/tasks/campaign/${c.id}/submit`, {
        method: "POST",
        body: { form_field_1_value: v1, form_field_2_value: v2 },
      });
      await load();
      setV1(""); setV2("");
      toast.info("Submitted", { description: "Task marked Pending. Admin will review and credit your points." });
    } catch (e: any) {
      toast.error("Failed", { description: e?.message || "Could not submit" });
    } finally {
      setBusy(false);
    }
  };

  if (loading || !c) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const status = c.completion?.status;
  const isCampaignKind = (c.category || "") === "Campaigns";
  const hasField1 = !!c.form_field_1_label && !isCampaignKind;
  const hasField2 = !!c.form_field_2_label && !isCampaignKind;
  const canSubmit = !status || status === "rejected";
  const ytId = getYouTubeId(c.tutorial_video_url || "");

  // Disable submit until prerequisites are met (visual hint).
  const submitDisabled =
    busy ||
    (c.link_url && !linkOpened) ||
    (hasField1 && !v1.trim()) ||
    (hasField2 && !v2.trim());

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <ChevronLeft size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Task Details</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: 80, gap: 12 }}>
          {/* Header card */}
          <View style={styles.card}>
            <Image source={{ uri: c.logo_url }} style={styles.logo} />
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.note}>{c.note}</Text>
            <View style={styles.tags}>
              {!!c.category && <Tag text={c.category} />}
              {!!c.difficulty && <Tag text={c.difficulty} dim />}
            </View>
            <View style={styles.rewardRow}>
              <Text style={styles.rwdLabel}>Reward:</Text>
              <Text style={styles.rwd}>₹{c.reward_inr} ({c.reward_points} pts)</Text>
            </View>
            {status && <StatusBlock status={status} note={c.completion?.admin_note} />}
          </View>

          {/* YouTube tutorial video — admin-managed */}
          {!!ytId && (
            <View style={styles.card}>
              <View style={styles.tutorialHead}>
                <PlayCircle size={18} color={theme.colors.danger} />
                <Text style={styles.sectionTitle}>Tutorial</Text>
              </View>
              <TutorialVideo videoId={ytId} />
            </View>
          )}

          {/* Rules */}
          {!!c.rules && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Rules</Text>
              <Text style={styles.rules}>{c.rules}</Text>
            </View>
          )}

          {/* Action buttons */}
          {!!c.link_url && (
            <TouchableOpacity
              style={[styles.outlineBtn, linkOpened && styles.outlineBtnDone]}
              onPress={openLink}
              testID="open-link"
            >
              {linkOpened ? <Check size={18} color={theme.colors.success} /> : <ExternalLink size={18} color={theme.colors.primary} />}
              <Text style={[styles.outlineBtnText, linkOpened && { color: theme.colors.success }]}>
                {linkOpened ? "Task Started" : "Open Task Link"}
              </Text>
            </TouchableOpacity>
          )}
          {!!c.telegram_contact_url && (
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: "#0088cc" }]}
              onPress={() => Linking.openURL(c.telegram_contact_url!).catch(() => {})}
              testID="contact-telegram"
            >
              <MessageCircle size={18} color="#0088cc" />
              <Text style={[styles.outlineBtnText, { color: "#0088cc" }]}>Contact on Telegram</Text>
            </TouchableOpacity>
          )}

          {/* Form fields (admin-defined) */}
          {canSubmit && (hasField1 || hasField2) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Submit Proof</Text>
              <Text style={styles.helperNote}>
                Note: Please complete the task and fill all proof fields below before submitting.
              </Text>
              {hasField1 && (
                <View style={{ gap: 6, marginTop: 6 }}>
                  <Text style={styles.fieldLabel}>{c.form_field_1_label}</Text>
                  <TextInput
                    value={v1} onChangeText={setV1}
                    placeholder={c.form_field_1_placeholder || ""}
                    placeholderTextColor={theme.colors.muted}
                    style={styles.input} testID="form-field-1"
                  />
                </View>
              )}
              {hasField2 && (
                <View style={{ gap: 6, marginTop: 10 }}>
                  <Text style={styles.fieldLabel}>{c.form_field_2_label}</Text>
                  <TextInput
                    value={v2} onChangeText={setV2}
                    placeholder={c.form_field_2_placeholder || ""}
                    placeholderTextColor={theme.colors.muted}
                    style={styles.input} testID="form-field-2"
                  />
                </View>
              )}
            </View>
          )}

          {canSubmit && !isCampaignKind && (
            <TouchableOpacity
              style={[styles.submitBtn, submitDisabled && styles.submitDisabled]}
              onPress={submit} disabled={busy}
              testID="submit-task"
            >
              <Text style={[styles.submitText, submitDisabled && { color: theme.colors.muted }]}>
                {busy ? "Submitting..." : "Submit"}
              </Text>
            </TouchableOpacity>
          )}

          {/* Campaigns category — pure promotional link, no submission. */}
          {isCampaignKind && (
            <View style={styles.campaignInfoCard}>
              <Megaphone size={18} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.campaignInfoTitle}>Promotional link</Text>
                <Text style={styles.campaignInfoBody}>
                  Tap "Open Task Link" to visit the partner site. This task does not earn points or require submission.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Tag({ text, dim }: { text: string; dim?: boolean }) {
  return (
    <View style={[styles.tag, dim && { backgroundColor: theme.colors.bg }]}>
      <Text style={[styles.tagText, dim && { color: theme.colors.muted }]}>{text}</Text>
    </View>
  );
}

function StatusBlock({ status, note }: { status: string; note?: string }) {
  const cfg: any = {
    pending: { c: "#B45309", bg: "rgba(255,193,7,0.18)", icon: <Clock size={16} color="#B45309" />, label: "Pending review" },
    approved: { c: theme.colors.success, bg: "rgba(16,185,129,0.12)", icon: <Check size={16} color={theme.colors.success} />, label: "Task Completed" },
    rejected: { c: theme.colors.danger, bg: "rgba(255,107,107,0.12)", icon: <X size={16} color={theme.colors.danger} />, label: "Rejected" },
  }[status];
  if (!cfg) return null;
  return (
    <View style={[styles.statusBlock, { backgroundColor: cfg.bg }]}>
      {cfg.icon}
      <View style={{ flex: 1 }}>
        <Text style={[styles.statusLabel, { color: cfg.c }]}>{cfg.label}</Text>
        {!!note && <Text style={styles.statusNote}>{note}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border, gap: 4,
  },
  logo: { width: 56, height: 56, borderRadius: 14, backgroundColor: "#eee" },
  name: { fontSize: 20, fontWeight: "800", color: theme.colors.text, marginTop: 6 },
  note: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
  tags: { flexDirection: "row", gap: 6, marginTop: 8 },
  tag: { backgroundColor: theme.colors.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tagText: { color: theme.colors.primary, fontSize: 11, fontWeight: "800" },
  rewardRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 12 },
  rwdLabel: { color: theme.colors.muted, fontWeight: "700" },
  rwd: { color: theme.colors.success, fontWeight: "800", fontSize: 18 },
  statusBlock: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    padding: 12, borderRadius: theme.radii.md, marginTop: 12,
  },
  statusLabel: { fontWeight: "800", fontSize: 13 },
  statusNote: { color: theme.colors.text, fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text, marginBottom: 6 },
  rules: { fontSize: 13, color: theme.colors.text, lineHeight: 22 },
  tutorialHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  videoWrap: {
    height: 200, borderRadius: theme.radii.md, overflow: "hidden",
    backgroundColor: "#000", marginTop: 4,
  },
  video: { flex: 1, backgroundColor: "#000" },
  outlineBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: theme.radii.lg,
    borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.surface,
  },
  outlineBtnDone: { borderColor: theme.colors.success, backgroundColor: "rgba(16,185,129,0.08)" },
  outlineBtnText: { color: theme.colors.primary, fontWeight: "800", fontSize: 14 },
  fieldLabel: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  helperNote: { color: theme.colors.muted, fontSize: 12, fontWeight: "500", marginBottom: 4 },
  input: {
    backgroundColor: theme.colors.bg, borderRadius: theme.radii.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.colors.text,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  submitBtn: {
    backgroundColor: theme.colors.primary, paddingVertical: 16,
    borderRadius: theme.radii.lg, alignItems: "center",
  },
  submitDisabled: { backgroundColor: "#E5E7EB" },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  campaignInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: "rgba(16,185,129,0.10)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
  },
  campaignInfoTitle: { color: theme.colors.success, fontWeight: "800", fontSize: 13 },
  campaignInfoBody: { color: theme.colors.text, fontSize: 12, marginTop: 2 },
});
