import React, { useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { Popup } from "@/src/components/ui/Popup";
import { Button } from "@/src/components/ui/Button";
import { Icon } from "@/src/components/ui/Icon";
import { TaskLogo } from "@/src/components/ui/TaskLogo";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { OfferTask, OfferSubmission } from "@/src/lib/firestore";
import { formatRupees } from "@/src/utils/format";

export function TaskDetailModal({
  task,
  submission,
  visible,
  submitting,
  onClose,
  onSubmit,
}: {
  task: OfferTask | null;
  submission: OfferSubmission | null;
  visible: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (proof: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [started, setStarted] = useState(false);
  const [proof, setProof] = useState("");

  const close = () => {
    setStarted(false);
    setProof("");
    onClose();
  };

  if (!task) return null;
  const alreadySubmitted = !!submission;

  return (
    <Popup visible={visible} onClose={close} testID="task-detail-modal">
      <View style={styles.head}>
        <TaskLogo url={task.logoUrl} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.subtitle}>{task.subtitle}</Text>
        </View>
        <Text style={styles.reward}>{formatRupees(task.reward)}</Text>
      </View>

      <View style={styles.rulesBox}>
        <View style={styles.rulesHeader}>
          <Icon name="info" size={18} color={colors.brand} weight="fill" />
          <Text style={styles.rulesTitle}>How to complete</Text>
        </View>
        <Text style={styles.rulesText}>{task.rules || "Complete the task to earn your reward."}</Text>
      </View>

      {alreadySubmitted ? (
        <View style={styles.statusBox}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Submission status</Text>
            <StatusBadge status={submission!.status} />
          </View>
          {!!submission!.proof && submission!.proof !== "(no proof required)" && (
            <Text style={styles.proofText}>Your proof: {submission!.proof}</Text>
          )}
          {submission!.status === "rejected" && !!submission!.reason && (
            <Text style={styles.reasonText}>Reason: {submission!.reason}</Text>
          )}
          {submission!.status === "pending" && (
            <Text style={styles.proofText}>
              We're reviewing your submission. You'll be credited once approved.
            </Text>
          )}
        </View>
      ) : !task.submissionEnabled ? (
        <View style={styles.noSubmitBox}>
          <Icon name="check-circle" size={18} color={colors.success} weight="fill" />
          <Text style={styles.noSubmitText}>
            No submission required — just open the task above and complete it.
          </Text>
        </View>
      ) : !started ? (
        <Button
          label="Start task"
          testID="task-start-button"
          onPress={() => {
            if (task.taskUrl) Linking.openURL(task.taskUrl).catch(() => {});
            setStarted(true);
          }}
          style={{ marginTop: 14 }}
        />
      ) : (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.inputLabel}>Submit proof</Text>
          <TextInput
            testID="task-proof-input"
            value={proof}
            onChangeText={setProof}
            placeholder={task.proofHint || "Enter your proof here"}
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
          />
          <Button
            label="Submit"
            testID="task-submit-button"
            loading={submitting}
            onPress={() => onSubmit(proof.trim())}
            style={{ marginTop: 14 }}
          />
        </View>
      )}
    </Popup>
  );
}

const useStyles = makeStyles((c) => ({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 52, height: 52, borderRadius: 14, backgroundColor: c.surfaceTertiary },
  title: { fontSize: 18, fontWeight: "800", color: c.onSurfaceSecondary },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 2 },
  reward: { fontSize: 18, fontWeight: "800", color: c.success },
  rulesBox: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
  },
  rulesHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  rulesTitle: { fontSize: 14, fontWeight: "800", color: c.onSurfaceSecondary },
  rulesText: { fontSize: 14, color: c.onSurfaceTertiary, lineHeight: 21 },
  statusBox: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    gap: 8,
  },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLabel: { fontSize: 14, fontWeight: "700", color: c.onSurfaceTertiary },
  proofText: { fontSize: 13, color: c.muted, lineHeight: 19 },
  reasonText: { fontSize: 13, color: c.error, fontWeight: "600" },
  inputLabel: { fontSize: 14, fontWeight: "700", color: c.onSurfaceTertiary, marginBottom: 8 },
  noSubmitBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.success + "14",
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  noSubmitText: { flex: 1, fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 19, fontWeight: "600" },
  input: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 14,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    color: c.onSurfaceSecondary,
    textAlignVertical: "top",
  },
}));
