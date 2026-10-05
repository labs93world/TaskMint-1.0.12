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
import { showRewarded, showRewardedInterstitial } from "@/src/ads";

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

  const [chances, setChances] = useState(0);
  const [loadingAd, setLoadingAd] = useState(false);
  const [reward, setReward] = useState<{ points: number } | null>(null);
  const claimCountRef = useRef(0);

  useEffect(() => {
    (async () => {
      const all = (await storage.getItem<Record<string, number>>(KEYS.gameChances, {})) ?? {};
      setChances(all[gameId] ?? 0);
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

  const getChances = async () => {
    if (loadingAd) return;
    setLoadingAd(true);
    try {
      const ok = await showRewarded();
      if (ok) {
        setChances((c) => {
          const next = c + CHANCES_PER_AD;
          persistChances(next);
          return next;
        });
        toast.show(`+${CHANCES_PER_AD} chances added!`, "success");
      } else {
        toast.show("Ad not completed. Try again.", "error");
      }
    } finally {
      setLoadingAd(false);
    }
  };

  const consumeChance = useCallback((): boolean => {
    let ok = false;
    setChances((c) => {
      if (c <= 0) return c;
      ok = true;
      const next = c - 1;
      persistChances(next);
      return next;
    });
    if (!ok) toast.show("No chances left. Watch an ad for +5.", "info");
    return ok;
  }, [persistChances, toast]);

  const win = useCallback(
    async (points: number, label?: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await addPoints(points, label ?? `${title} reward`);
      setReward({ points });
      claimCountRef.current += 1;
      await storage.setItem(KEYS.claimCount, claimCountRef.current);
      if (claimCountRef.current % INTERSTITIAL_EVERY === 0) {
        showRewardedInterstitial();
      }
    },
    [addPoints, title],
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
