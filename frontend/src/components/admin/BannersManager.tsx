import React, { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";
import { Popup } from "@/src/components/ui/Popup";
import { Button } from "@/src/components/ui/Button";
import { useToast } from "@/src/components/ui/Toast";
import { adminBanners, newId, Banner } from "@/src/lib/firestore";
import { useAdminCatalog } from "@/src/lib/catalog";

export function BannersManager() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { catalog, save: saveField } = useAdminCatalog();
  const all = catalog.banners;
  const write = (next: Banner[]) => saveField("banners", next);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setImageUrl("");
    setRedirectUrl("");
    setModal(true);
  };
  const openEdit = (b: Banner) => {
    setEditing(b);
    setImageUrl(b.imageUrl);
    setRedirectUrl(b.redirectUrl ?? "");
    setModal(true);
  };

  const save = async () => {
    if (!imageUrl.trim()) {
      toast.show("Image URL is required", "error");
      return;
    }
    setSaving(true);
    try {
      const data = { imageUrl: imageUrl.trim(), redirectUrl: redirectUrl.trim() };
      if (editing) {
        await write(all.map((x) => (x.id === editing.id ? { ...x, ...data } : x)));
      } else {
        await write([...all, { id: newId(), ...data, pinned: false, hidden: false, createdAt: Date.now() }]);
      }
      setModal(false);
      toast.show("Banner saved", "success");
    } catch {
      toast.show("Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (b: Banner, field: "pinned" | "hidden") => {
    await write(all.map((x) => (x.id === b.id ? { ...x, [field]: !b[field] } : x))).catch(() =>
      toast.show("Save failed", "error"),
    );
  };
  const remove = async (b: Banner) => {
    try {
      await write(all.filter((x) => x.id !== b.id));
      toast.show("Banner deleted", "info");
    } catch {
      toast.show("Delete failed", "error");
    }
  };

  const banners = adminBanners(catalog);

  return (
    <View>
      <Button label="+ Add banner" testID="admin-add-banner" onPress={openAdd} style={{ marginBottom: 16 }} />
      {banners.length === 0 && <Text style={styles.empty}>No banners yet</Text>}
      {banners.map((b) => (
        <View key={b.id} style={styles.card} testID={`admin-banner-${b.id}`}>
          <Image source={{ uri: b.imageUrl }} style={styles.thumb} contentFit="cover" />
          <Text style={styles.url} numberOfLines={1}>
            {b.redirectUrl || "No redirect"}
          </Text>
          <View style={styles.actions}>
            <IconBtn icon="pin" active={!!b.pinned} onPress={() => toggle(b, "pinned")} color={colors.brand} />
            <IconBtn icon={b.hidden ? "eye-slash" : "eye"} active={!b.hidden} onPress={() => toggle(b, "hidden")} color={colors.info} />
            <IconBtn icon="pencil" onPress={() => openEdit(b)} color={colors.warning} />
            <IconBtn icon="trash" onPress={() => remove(b)} color={colors.error} />
          </View>
        </View>
      ))}

      <Popup visible={modal} onClose={() => setModal(false)} title={editing ? "Edit banner" : "Add banner"} testID="banner-modal">
        <Field label="Image URL" value={imageUrl} onChange={setImageUrl} placeholder="https://..." />
        <Field label="Redirect URL (optional)" value={redirectUrl} onChange={setRedirectUrl} placeholder="https://..." />
        <Button label="Save" loading={saving} onPress={save} style={{ marginTop: 16 }} testID="banner-save" />
      </Popup>
    </View>
  );
}

export function IconBtn({
  icon,
  onPress,
  color,
  active,
}: {
  icon: any;
  onPress: () => void;
  color: string;
  active?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.iconBtn, { backgroundColor: color + (active ? "33" : "14") }]}
    >
      <Icon name={icon} size={18} color={color} weight={active ? "fill" : "regular"} />
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "number-pad";
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brand, false: colors.borderStrong }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  empty: { textAlign: "center", color: c.muted, paddingVertical: 24, fontWeight: "600" },
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  thumb: { width: "100%", height: 110, borderRadius: 12, backgroundColor: c.surfaceTertiary },
  url: { fontSize: 13, color: c.muted, marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: c.onSurfaceTertiary, marginBottom: 8 },
  input: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 50,
    fontSize: 15,
    color: c.onSurfaceSecondary,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
}));
