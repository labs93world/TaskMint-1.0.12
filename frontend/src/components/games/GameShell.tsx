import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";
import { Popup } from "@/src/components/ui/Popup";
import { Button } from "@/src/components/ui/Button";
import { storage } from "@/src/utils/storage";
import { KEYS } from "@/src/lib/storageKeys";
import { CHANCES_PER_AD, INTERSTITIAL_EVERY } from "@/src/constants/games";
import { useUser } from "@/src/context/UserContext";
import { useToast } from "@/src/components/ui/Toast";
import { formatPoints } from "@/src/utils/format";
import { useAdGate } from "@/src/components/ui/AdGate";

export type GameApi = {
  chances: number;
  consumeChance: () => boolean;
  win: (points: number, label?: string) => void;
  notify: (msg: string, type?: "success" | "error" | "info") => void;
};

export function GameShell({
  gameId,
  title,
  children,
}: {
  gameId: string;
  title: string;
  children: (api: GameApi) => React.ReactNode;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addPoints } = useUser();
  const toast = useToast();
  const adGate = useAdGate();

  const [chances, setChances] = useState(0);
  const chancesRef = useRef(0);
  const [loadingAd, setLoadingAd] = useState(false);
  const gettingRef = useRef(false); // synchronous one-click guard
  const [reward, setReward] = useState<{ points: number } | null>(null);
  const claimCountRef = useRef(0);

  const applyChances = useCallback(
    (next: number) => {
      chancesRef.current = next;
      setChances(next);
      persistChancesRef.current(next);
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const all = (await storage.getItem<Record<string, number>>(KEYS.gameChances, {})) ?? {};
      const value = all[gameId] ?? 0;
      chancesRef.current = value;
      setChances(value);
      claimCountRef.current = (await storage.getItem<number>(KEYS.claimCount, 0)) ?? 0;
    })();
  }, [gameId]);

  const persistChances = useCallback(
    async (next: number) => {
      const all = (await storage.getItem<Record<string, number>>(KEYS.gameChances, {})) ?? {};
      all[gameId] = next;
      await storage.setItem(KEYS.gameChances, all);
    },
    [gameId],
  );
  const persistChancesRef = useRef(persistChances);
  persistChancesRef.current = persistChances;

  const getChances = async () => {
    // One click at a time — the ref is set synchronously so a rapid second tap
    // (before React re-renders / before an instantly-resolving web ad) is
    // ignored. `loadingAd` state is only for the Button's loading UI.
    if (gettingRef.current) return;
    gettingRef.current = true;
    setLoadingAd(true);
    try {
      // The Ad Gate shows a non-dismissable loader (5s cooldown) and handles
      // detailed errors with its own retry / cancel buttons.
      const ok = await adGate.showAd("rewarded", 5000);
      if (ok) {
        applyChances(chancesRef.current + CHANCES_PER_AD);
        toast.show(`+${CHANCES_PER_AD} chances added!`, "success");
      }
    } finally {
      gettingRef.current = false;
      setLoadingAd(false);
    }
  };

  const consumeChance = useCallback((): boolean => {
    // Read/update synchronously via the ref — a functional setState updater is
    // NOT executed synchronously, so the previous `ok` flag was always false.
    if (chancesRef.current <= 0) {
      toast.show("No chances left. Watch an ad for +5.", "info");
      return false;
    }
    applyChances(chancesRef.current - 1);
    return true;
  }, [applyChances, toast]);

  const win = useCallback(
    async (points: number, label?: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await addPoints(points, label ?? `${title} reward`);
      claimCountRef.current += 1;
      await storage.setItem(KEYS.claimCount, claimCountRef.current);
      // Show the rewarded-interstitial (via the Ad Gate, 3s cooldown) on every
      // Nth claim, THEN reveal the reward popup.
      if (claimCountRef.current % INTERSTITIAL_EVERY === 0) {
        await adGate.showAd("rewardedInterstitial", 3000);
      }
      setReward({ points });
    },
    [addPoints, title, adGate],
  );

  const notify = useCallback(
    (msg: string, type: "success" | "error" | "info" = "info") => toast.show(msg, type),
    [toast],
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="game-back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.chancePill} testID="game-chances">
          <Icon name="sparkle" size={16} color={colors.brand} weight="fill" />
          <Text style={styles.chanceText}>{chances}</Text>
        </View>
      </View>

      <View style={styles.body}>{children({ chances, consumeChance, win, notify })}</View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label={loadingAd ? "Loading ad..." : `Watch ad for +${CHANCES_PER_AD} chances`}
          testID="game-get-chances"
          loading={loadingAd}
          variant={chances > 0 ? "secondary" : "primary"}
          onPress={getChances}
        />
      </View>

      <Popup
        visible={!!reward}
        onClose={() => setReward(null)}
        title="You won! 🎉"
        testID="game-reward-modal"
      >
        <View style={styles.rewardBox}>
          <View style={styles.rewardIcon}>
            <Icon name="coins" size={44} color={colors.warning} weight="fill" />
          </View>
          <Text style={styles.rewardAmt}>+{formatPoints(reward?.points ?? 0)} points</Text>
          <Text style={styles.rewardSub}>Added to your balance</Text>
        </View>
        <Button label="Awesome!" onPress={() => setReward(null)} style={{ marginTop: 18 }} />
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
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  chancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: c.brandTertiary,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    minWidth: 56,
    justifyContent: "center",
  },
  chanceText: { fontSize: 15, fontWeight: "800", color: c.brand },
  body: { flex: 1, paddingHorizontal: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
  rewardBox: { alignItems: "center", gap: 6 },
  rewardIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: c.warning + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  rewardAmt: { fontSize: 26, fontWeight: "800", color: c.onSurfaceSecondary },
  rewardSub: { fontSize: 14, color: c.muted },
}));
