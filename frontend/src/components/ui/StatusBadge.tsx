import React from "react";
import { Text, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon, IconName } from "./Icon";

export type AnyStatus = "pending" | "successful" | "approved" | "rejected";

export function StatusBadge({ status }: { status: AnyStatus }) {
  const styles = useStyles();
  const { colors } = useTheme();

  const map: Record<AnyStatus, { label: string; color: string; icon: IconName }> = {
    pending: { label: "Pending", color: colors.warning, icon: "clock" },
    successful: { label: "Successful", color: colors.success, icon: "check-circle" },
    approved: { label: "Approved", color: colors.success, icon: "check-circle" },
    rejected: { label: "Rejected", color: colors.error, icon: "x-circle" },
  };
  const s = map[status];

  return (
    <View style={[styles.wrap, { backgroundColor: s.color + "22" }]}>
      <Icon name={s.icon} size={14} color={s.color} weight="fill" />
      <Text style={[styles.text, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: { fontSize: 12, fontWeight: "800" },
}));
