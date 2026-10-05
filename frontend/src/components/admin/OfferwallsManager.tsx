import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { Popup } from "@/src/components/ui/Popup";
import { Button } from "@/src/components/ui/Button";
import { TaskLogo } from "@/src/components/ui/TaskLogo";
import { useToast } from "@/src/components/ui/Toast";
import { IconBtn, Field, ToggleRow } from "./BannersManager";
import {
  addTask,
  deleteTask,
  listTasks,
  updateTask,
  OfferTask,
} from "@/src/lib/firestore";
import { formatRupees } from "@/src/utils/format";

const EMPTY = {
  title: "",
  subtitle: "",
  logoUrl: "",
  taskUrl: "",
  rules: "",
  reward: "",
  submissionEnabled: true,
  proofHint: "",
};

export function OfferwallsManager() {
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-tasks"], queryFn: () => listTasks(true) });

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<OfferTask | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setModal(true);
  };
  const openEdit = (t: OfferTask) => {
    setEditing(t);
    setForm({
      title: t.title,
      subtitle: t.subtitle,
      logoUrl: t.logoUrl,
      taskUrl: t.taskUrl ?? "",
      rules: t.rules,
      reward: String(t.reward),
      submissionEnabled: t.submissionEnabled,
      proofHint: t.proofHint ?? "",
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.reward) {
      toast.show("Title and reward are required", "error");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      logoUrl: form.logoUrl.trim(),
      taskUrl: form.taskUrl.trim(),
      rules: form.rules.trim(),
      reward: parseFloat(form.reward) || 0,
      submissionEnabled: form.submissionEnabled,
      proofHint: form.proofHint.trim(),
    };
    try {
      if (editing) await updateTask(editing.id, payload);
      else await addTask({ ...payload, pinned: false, hidden: false });
      refresh();
      setModal(false);
      toast.show("Task saved", "success");
    } catch {
      toast.show("Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t: OfferTask, field: "pinned" | "hidden") => {
    await updateTask(t.id, { [field]: !t[field] });
    refresh();
  };
  const remove = async (t: OfferTask) => {
    await deleteTask(t.id);
    refresh();
    toast.show("Task deleted", "info");
  };

  const tasks = q.data ?? [];

  return (
    <View>
      <Button label="+ Add task" testID="admin-add-task" onPress={openAdd} style={{ marginBottom: 16 }} />
      {tasks.length === 0 && <Text style={styles.empty}>No tasks yet</Text>}
      {tasks.map((t) => (
        <View key={t.id} style={styles.card} testID={`admin-task-${t.id}`}>
          <View style={styles.row}>
            <TaskLogo url={t.logoUrl} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {t.title} {t.hidden ? "(hidden)" : ""}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {t.subtitle}
              </Text>
            </View>
            <Text style={styles.reward}>{formatRupees(t.reward)}</Text>
          </View>
          <View style={styles.actions}>
            <IconBtn icon="pin" active={!!t.pinned} onPress={() => toggle(t, "pinned")} color={colors.brand} />
            <IconBtn icon={t.hidden ? "eye-slash" : "eye"} active={!t.hidden} onPress={() => toggle(t, "hidden")} color={colors.info} />
            <IconBtn icon="pencil" onPress={() => openEdit(t)} color={colors.warning} />
            <IconBtn icon="trash" onPress={() => remove(t)} color={colors.error} />
          </View>
        </View>
      ))}

      <Popup visible={modal} onClose={() => setModal(false)} title={editing ? "Edit task" : "Add task"} testID="task-modal">
        <KeyboardAwareScrollView bottomOffset={20} style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          <Field label="Title" value={form.title} onChange={(v) => set("title", v)} placeholder="e.g. Navi" />
          <Field label="Subtitle" value={form.subtitle} onChange={(v) => set("subtitle", v)} placeholder="Install/register" />
          <Field label="Logo URL (optional)" value={form.logoUrl} onChange={(v) => set("logoUrl", v)} placeholder="Leave empty for default icon" />
          <Field label="Task URL" value={form.taskUrl} onChange={(v) => set("taskUrl", v)} placeholder="https://..." />
          <Field label="Rules" value={form.rules} onChange={(v) => set("rules", v)} placeholder="How to complete..." multiline />
          <Field label="Reward (₹)" value={form.reward} onChange={(v) => set("reward", v.replace(/[^0-9.]/g, ""))} placeholder="125" keyboardType="number-pad" />
          <ToggleRow label="Require proof submission" value={form.submissionEnabled} onChange={(v) => set("submissionEnabled", v)} />
          {form.submissionEnabled && (
            <Field label="Proof input hint" value={form.proofHint} onChange={(v) => set("proofHint", v)} placeholder="Enter registered mobile no" />
          )}
          <Button label="Save" loading={saving} onPress={save} style={{ marginTop: 16, marginBottom: 8 }} testID="task-save" />
        </KeyboardAwareScrollView>
      </Popup>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  empty: { textAlign: "center", color: c.muted, paddingVertical: 24, fontWeight: "600" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 14, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 46, height: 46, borderRadius: 12, backgroundColor: c.surfaceTertiary },
  title: { fontSize: 15, fontWeight: "800", color: c.onSurfaceSecondary },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
  reward: { fontSize: 16, fontWeight: "800", color: c.success },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
}));
