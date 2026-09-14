import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Save, Plus, Trash2 } from "lucide-react-native";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";

export default function AdminWithdrawSettings() {
  const router = useRouter();
  const [amounts, setAmounts] = useState<number[]>([100, 10000, 30000, 50000]);
  const [newAmt, setNewAmt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ amounts: number[] }>("/admin/withdraw-settings")
      .then((s) => setAmounts(s.amounts || []))
      .catch(() => {});
  }, []);

  const addAmount = () => {
    const n = parseInt(newAmt, 10);
    if (isNaN(n) || n <= 0) {
      toast.error("Invalid", { description: "Enter a positive number (in points)" });
      return;
    }
    if (amounts.includes(n)) {
      toast.error("Exists", { description: "This amount is already in the list" });
      return;
    }
    setAmounts([...amounts, n].sort((a, b) => a - b));
    setNewAmt("");
  };

  const remove = (n: number) => {
    setAmounts(amounts.filter((a) => a !== n));
  };

  const save = async () => {
    setBusy(true);
    try {
      await api("/admin/withdraw-settings", { method: "PUT", body: { amounts } });
      toast.success("Saved", { description: "Withdraw amounts updated" });
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <ChevronLeft size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Withdraw Amounts</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: 14 }}>
          <Text style={styles.note}>
            These amounts (in points) are shown as selection chips on the user Withdraw screen. 100 pts = ₹1.
            The 100-pts chip auto-hides for users who have already made their first withdrawal.
          </Text>

          {amounts.map((n) => (
            <View key={n} style={styles.row} testID={`amt-${n}`}>
              <View>
                <Text style={styles.amt}>₹{(n / 100).toFixed(0)}</Text>
                <Text style={styles.amtSub}>{n} points</Text>
              </View>
              <TouchableOpacity onPress={() => remove(n)} style={styles.del} testID={`del-${n}`}>
                <Trash2 size={18} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.addRow}>
            <TextInput
              value={newAmt}
              onChangeText={setNewAmt}
              keyboardType="number-pad"
              placeholder="New amount (in points)"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              testID="new-amt-input"
            />
            <TouchableOpacity onPress={addAmount} style={styles.addBtn} testID="add-amt-btn">
              <Plus size={18} color="#fff" />
              <Text style={styles.addText}>Add</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cta} onPress={save} disabled={busy} testID="save-amounts">
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
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
  },
  amt: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  amtSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  del: { padding: 8 },
  addRow: { flexDirection: "row", gap: 8, marginTop: theme.spacing.md },
  input: {
    flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radii.md,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: theme.colors.text,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: theme.colors.success, paddingHorizontal: 18, justifyContent: "center", borderRadius: theme.radii.md,
  },
  addText: { color: "#fff", fontWeight: "800" },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: theme.radii.lg,
    marginTop: theme.spacing.md,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
