import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Plus, Trash2, Pencil, Eye, EyeOff, Pin, PinOff, X, Copy } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";
import ImagePickerField from "../../src/components/ImagePickerField";

type Cmp = {
  id: string; name: string; note: string; logo_url: string; link_url?: string;
  tutorial_video_url?: string; rules?: string; telegram_contact_url?: string;
  form_field_1_label?: string; form_field_1_placeholder?: string;
  form_field_2_label?: string; form_field_2_placeholder?: string;
  category?: string; difficulty?: string;
  reward_points: number; reward_inr: number;
  active: boolean; hidden?: boolean; pinned?: boolean;
};

const CATEGORIES = ["Survey", "Game", "App Install", "Sign-up", "Video", "Campaigns", "Custom"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export default function AdminCampaigns() {
  const router = useRouter();
  const [items, setItems] = useState<Cmp[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [logo, setLogo] = useState("");
  const [link, setLink] = useState("");
  const [tutorialUrl, setTutorialUrl] = useState("");
  const [pts, setPts] = useState("");
  const [category, setCategory] = useState(CATEGORIES[2]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const [rules, setRules] = useState("");
  const [tgContact, setTgContact] = useState("");
  const [f1Label, setF1Label] = useState("");
  const [f1Ph, setF1Ph] = useState("");
  const [f2Label, setF2Label] = useState("");
  const [f2Ph, setF2Ph] = useState("");

  const load = useCallback(async () => {
    try { setItems(await api<Cmp[]>("/admin/campaigns")); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditId(null);
    setName(""); setNote(""); setLogo(""); setLink(""); setTutorialUrl(""); setPts("");
    setCategory(CATEGORIES[2]); setDifficulty(DIFFICULTIES[0]);
    setRules(""); setTgContact("");
    setF1Label(""); setF1Ph(""); setF2Label(""); setF2Ph("");
  };

  const save = async () => {
    if (!name || !note || !logo || !pts) {
      toast.error("Required", { description: "Name, note, logo and reward are required" });
      return;
    }
    try {
      const body: any = {
        name, note, logo_url: logo, link_url: link,
        tutorial_video_url: tutorialUrl,
        category, difficulty,
        rules, telegram_contact_url: tgContact,
        form_field_1_label: f1Label, form_field_1_placeholder: f1Ph,
        form_field_2_label: f2Label, form_field_2_placeholder: f2Ph,
        reward_points: parseInt(pts, 10),
      };
      if (editId) {
        const orig = items.find((i) => i.id === editId);
        body.active = orig?.active ?? true;
        body.hidden = orig?.hidden ?? false;
        body.pinned = orig?.pinned ?? false;
        await api(`/admin/campaigns/${editId}`, { method: "PUT", body });
      } else {
        body.active = true;
        await api("/admin/campaigns", { method: "POST", body });
      }
      resetForm();
      load();
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed" });
    }
  };

  const startEdit = (c: Cmp) => {
    setEditId(c.id);
    setName(c.name);
    setNote(c.note);
    setLogo(c.logo_url);
    setLink(c.link_url || "");
    setTutorialUrl(c.tutorial_video_url || "");
    setPts(String(c.reward_points));
    setCategory(c.category || CATEGORIES[2]);
    setDifficulty(c.difficulty || DIFFICULTIES[0]);
    setRules(c.rules || "");
    setTgContact(c.telegram_contact_url || "");
    setF1Label(c.form_field_1_label || ""); setF1Ph(c.form_field_1_placeholder || "");
    setF2Label(c.form_field_2_label || ""); setF2Ph(c.form_field_2_placeholder || "");
  };

  const toggle = async (c: Cmp, field: "hidden" | "pinned") => {
    try {
      await api(`/admin/campaigns/${c.id}`, {
        method: "PUT",
        body: {
          name: c.name, note: c.note, logo_url: c.logo_url, link_url: c.link_url || "",
          tutorial_video_url: c.tutorial_video_url || "",
          rules: c.rules || "", telegram_contact_url: c.telegram_contact_url || "",
          form_field_1_label: c.form_field_1_label || "", form_field_1_placeholder: c.form_field_1_placeholder || "",
          form_field_2_label: c.form_field_2_label || "", form_field_2_placeholder: c.form_field_2_placeholder || "",
          category: c.category || CATEGORIES[2],
          difficulty: c.difficulty || DIFFICULTIES[0],
          reward_points: c.reward_points,
          active: c.active ?? true,
          hidden: field === "hidden" ? !(c.hidden ?? false) : (c.hidden ?? false),
          pinned: field === "pinned" ? !(c.pinned ?? false) : (c.pinned ?? false),
        },
      });
      load();
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed" });
    }
  };

  const del = async (id: string) => {
    try { await api(`/admin/campaigns/${id}`, { method: "DELETE" }); load(); } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed" });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <ChevronLeft size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Offerwall</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: 12 }}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add Campaign</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Name (e.g. PhonePe)"
              placeholderTextColor={theme.colors.muted} style={styles.input} testID="cmp-name" />
            <TextInput value={note} onChangeText={setNote} placeholder="Note / instructions"
              placeholderTextColor={theme.colors.muted} style={styles.input} testID="cmp-note" />
            <ImagePickerField value={logo} onChange={setLogo} label="Logo Image" testID="cmp-logo" />
            <TextInput value={link} onChangeText={setLink} placeholder="Task link URL (opens on tap)"
              placeholderTextColor={theme.colors.muted} style={styles.input} autoCapitalize="none" testID="cmp-link" />
            <TextInput value={tutorialUrl} onChangeText={setTutorialUrl}
              placeholder="Tutorial YouTube URL (optional, e.g. https://youtu.be/abcdEFGHij0)"
              placeholderTextColor={theme.colors.muted} style={styles.input}
              autoCapitalize="none" testID="cmp-tutorial-url" />
            <TextInput
              value={rules} onChangeText={setRules}
              placeholder="Rules (shown on task detail screen)"
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
              multiline testID="cmp-rules"
            />
            <TextInput value={tgContact} onChangeText={setTgContact}
              placeholder="Telegram contact URL (optional)"
              placeholderTextColor={theme.colors.muted} style={styles.input}
              autoCapitalize="none" testID="cmp-tg" />

            <Text style={styles.fieldLabel}>Proof field 1 (leave empty to hide)</Text>
            <TextInput value={f1Label} onChangeText={setF1Label}
              placeholder="Field 1 label (e.g. UPI transaction ID)"
              placeholderTextColor={theme.colors.muted} style={styles.input} testID="cmp-f1-label" />
            <TextInput value={f1Ph} onChangeText={setF1Ph}
              placeholder="Field 1 placeholder / hint"
              placeholderTextColor={theme.colors.muted} style={styles.input} testID="cmp-f1-ph" />

            <Text style={styles.fieldLabel}>Proof field 2 (optional)</Text>
            <TextInput value={f2Label} onChangeText={setF2Label}
              placeholder="Field 2 label (e.g. Screenshot URL)"
              placeholderTextColor={theme.colors.muted} style={styles.input} testID="cmp-f2-label" />
            <TextInput value={f2Ph} onChangeText={setF2Ph}
              placeholder="Field 2 placeholder / hint"
              placeholderTextColor={theme.colors.muted} style={styles.input} testID="cmp-f2-ph" />
            <TextInput value={pts} onChangeText={setPts} placeholder="Reward (points, 100=₹1)"
              placeholderTextColor={theme.colors.muted} style={styles.input}
              keyboardType="number-pad" testID="cmp-pts" />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, category === c && styles.chipActive]}
                  onPress={() => setCategory(c)}
                  testID={`cat-${c}`}
                >
                  <Text style={[styles.chipText, category === c && { color: "#fff" }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Difficulty</Text>
            <View style={styles.chips}>
              {DIFFICULTIES.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, difficulty === d && styles.chipActive]}
                  onPress={() => setDifficulty(d)}
                  testID={`diff-${d}`}
                >
                  <Text style={[styles.chipText, difficulty === d && { color: "#fff" }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.cta} onPress={save} testID="cmp-save">
              {editId ? <Pencil size={18} color="#fff" /> : <Plus size={18} color="#fff" />}
              <Text style={styles.ctaText}>{editId ? "Save Changes" : "Add Campaign"}</Text>
            </TouchableOpacity>
          </View>

          {items.map((c) => (
            <View key={c.id} style={[styles.item, c.hidden && { opacity: 0.55 }]} testID={`cmp-${c.id}`}>
              <Image source={{ uri: c.logo_url }} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{c.name}</Text>
                  {c.pinned && <Text style={styles.badge}>PINNED</Text>}
                  {c.hidden && <Text style={[styles.badge, styles.badgeHidden]}>HIDDEN</Text>}
                </View>
                <Text style={styles.itemSub} numberOfLines={1}>{c.note}</Text>
                <Text style={styles.itemReward}>₹{c.reward_inr} • {c.reward_points} pts • {c.category}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    const deepLink = `/task/${c.id}`;
                    try {
                      await Clipboard.setStringAsync(deepLink);
                      toast.success("Copied", { description: `Deep link copied:\n${deepLink}\n\nPaste it into a banner's "Link URL" to open this campaign on tap.` });
                    } catch {}
                  }}
                  style={styles.idPill}
                  testID={`cmp-copy-id-${c.id}`}
                  activeOpacity={0.7}
                >
                  <Copy size={11} color={theme.colors.primary} />
                  <Text style={styles.idPillText} numberOfLines={1}>{c.id}</Text>
                </TouchableOpacity>
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => startEdit(c)} style={styles.iconBtn} testID={`cmp-edit-${c.id}`}>
                    <Pencil size={16} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggle(c, "pinned")} style={styles.iconBtn} testID={`cmp-pin-${c.id}`}>
                    {c.pinned ? <PinOff size={16} color={theme.colors.secondary} /> : <Pin size={16} color={theme.colors.muted} />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggle(c, "hidden")} style={styles.iconBtn} testID={`cmp-hide-${c.id}`}>
                    {c.hidden ? <Eye size={16} color={theme.colors.success} /> : <EyeOff size={16} color={theme.colors.muted} />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => del(c.id)} style={styles.iconBtn} testID={`cmp-del-${c.id}`}>
                    <Trash2 size={16} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
          {items.length === 0 && <Text style={styles.empty}>No campaigns yet.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  formCard: {
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, gap: 10,
  },
  formTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text, marginBottom: 4 },
  formHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  badge: {
    fontSize: 9, fontWeight: "900", color: theme.colors.secondary,
    backgroundColor: theme.colors.bg, paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 4, letterSpacing: 0.5,
  },
  badgeHidden: { color: theme.colors.danger },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  iconBtn: {
    padding: 6, borderRadius: 6, backgroundColor: theme.colors.bg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  fieldLabel: { fontSize: 11, fontWeight: "800", color: theme.colors.muted, letterSpacing: 1.4, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  input: {
    backgroundColor: theme.colors.bg, borderRadius: theme.radii.md,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: theme.colors.text,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: theme.radii.md,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
  item: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
  },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#eee" },
  itemTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  itemSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  itemReward: { fontSize: 12, color: theme.colors.success, fontWeight: "700", marginTop: 2 },
  idPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, alignSelf: "flex-start", marginTop: 6,
  },
  idPillText: { color: theme.colors.primary, fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  delBtn: { padding: 8 },
  empty: { color: theme.colors.muted, textAlign: "center", padding: 24 },
});
