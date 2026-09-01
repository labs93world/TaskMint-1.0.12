import React from "react";
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity } from "react-native";
import {
  Wallet,
  ArrowDownToLine,
  RefreshCw,
} from "lucide-react-native";
import { theme, pointsToInr } from "../lib/theme";
import AutoText from "./AutoText";

const BG = "https://images.pexels.com/photos/7135024/pexels-photo-7135024.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

/**
 * Compact horizontal balance card.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────────────┐
 *   │  💰  BALANCE                          ┌──────────┐    │
 *   │      7,629 pts  ≈ ₹76.29              │ Withdraw │    │
 *   │                                       └──────────┘    │
 *   └───────────────────────────────────────────────────────┘
 *
 * `actionLabel` controls the right-side button text:
 *   • "withdraw" (default) → primary Withdraw button (used on Wallet tab)
 *   • "switch"             → "Switch Wallet" button (used on Withdraw screen)
 *
 * Pressing the button calls `onAction()`. If no handler is provided the
 * button is hidden, leaving a pure info card.
 */
export type BalanceCardAction = "withdraw" | "switch";

export default function BalanceCard({
  points,
  onAction,
  actionLabel = "withdraw",
  walletLabel,
  testID = "balance-card",
}: {
  points: number;
  onAction?: () => void;
  actionLabel?: BalanceCardAction;
  /** Optional override for the "BALANCE" tag (e.g. "CAMPAIGN" / "GAMES"). */
  walletLabel?: string;
  testID?: string;
}) {
  const isSwitch = actionLabel === "switch";

  return (
    <ImageBackground
      source={{ uri: BG }}
      imageStyle={{ borderRadius: theme.radii.xl }}
      style={styles.card}
      testID={testID}
    >
      <View style={styles.tint} />

      <View style={styles.left}>
        <View style={styles.headRow}>
          <View style={styles.iconWrap}>
            <Wallet size={14} color="#fff" />
          </View>
          <Text style={styles.label}>{walletLabel || "BALANCE"}</Text>
        </View>
        <AutoText style={styles.points} numberOfLines={1} testID="balance-points">
          {points.toLocaleString()} pts
        </AutoText>
        <AutoText style={styles.inr} numberOfLines={1}>≈ ₹{pointsToInr(points)}</AutoText>
      </View>

      {onAction && (
        <TouchableOpacity
          style={styles.btn}
          onPress={onAction}
          testID={isSwitch ? "balance-switch-btn" : "balance-withdraw-btn"}
          activeOpacity={0.85}
        >
          {isSwitch ? (
            <RefreshCw size={14} color={theme.colors.primary} />
          ) : (
            <ArrowDownToLine size={14} color={theme.colors.primary} />
          )}
          <Text style={styles.btnText}>{isSwitch ? "Switch" : "Withdraw"}</Text>
        </TouchableOpacity>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: theme.radii.xl,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(28, 17, 89, 0.55)",
    borderRadius: theme.radii.xl,
  },
  left: { flex: 1, gap: 2 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  points: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  inr: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radii.pill,
  },
  btnText: { color: theme.colors.primary, fontWeight: "800", fontSize: 12 },
});
