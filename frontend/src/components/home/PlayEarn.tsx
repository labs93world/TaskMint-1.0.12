import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";
import { GAMES } from "@/src/constants/games";
import { storage } from "@/src/utils/storage";
import { KEYS } from "@/src/lib/storageKeys";
import { istDayKey } from "@/src/utils/time";
import { useUser } from "@/src/context/UserContext";
import { useToast } from "@/src/components/ui/Toast";
import { useAdGate } from "@/src/components/ui/AdGate";

// Reward grows by 50 every day, cycling over 20 days: day 1 = 100 ... day 20 = 1050,
// then day 21 restarts at 100. Streak only resets if a day is missed.
const rewardForDay = (day: number) => 100 + ((Math.max(1, day) - 1) % 20) * 50;

export function PlayEarn() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { addPoints } = useUser();
  const toast = useToast();
  const adGate = useAdGate();
  const [checkin, setCheckin] = useState<{ lastDate: string; streak: number }>({ lastDate: "", streak: 0 });
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    const data = await storage.getItem<{ lastDate: string; streak: number }>(KEYS.dailyCheckin, { lastDate: "", streak: 0 });
    setCheckin(data ?? { lastDate: "", streak: 0 });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const today = istDayKey();
  const yesterday = istDayKey(Date.now() - 24 * 3600 * 1000);
  const claimedToday = checkin.lastDate === today;

  // The day number that is (or will be) claimed in this view.
  const nextDay = claimedToday ? checkin.streak : checkin.lastDate === yesterday ? checkin.streak + 1 : 1;
  const nextReward = rewardForDay(nextDay);

  const claim = async () => {
    if (claimedToday || claiming) return;
    setClaiming(true);
    const streak = checkin.lastDate === yesterday ? checkin.streak + 1 : 1;
    const reward = rewardForDay(streak);
    const next = { lastDate: today, streak };
    await storage.setItem(KEYS.dailyCheckin, next);
    setCheckin(next);
    await addPoints(reward, "Daily check-in");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.show(`+${reward} points claimed!`, "success");
    // Rewarded-interstitial via the Ad Gate (non-dismissable loader, 3s cooldown).
    await adGate.showAd("rewardedInterstitial", 3000);
    setClaiming(false);
  };

  return (
    <View>
      {/* Daily check-in hero — hidden once today's reward is claimed */}
      {!claimedToday && (
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Icon name="gift" size={24} color={colors.onBrandSecondary} weight="fill" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Daily Check-in</Text>
              <Text style={styles.heroSub}>
                {checkin.streak > 0 ? `${checkin.streak} day streak` : "Start your streak today"}
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            style={{ marginTop: 18 }}
          >
            {Array.from({ length: 20 }).map((_, i) => {
              const pos = i + 1;
              const cyclePos = ((Math.max(1, nextDay) - 1) % 20) + 1;
              const claimed = claimedToday ? pos <= cyclePos : pos < cyclePos;
              const isNext = !claimedToday && pos === cyclePos;
              return (
                <View key={i} style={[styles.dayBubble, claimed && styles.dayBubbleActive, isNext && styles.dayBubbleNext]}>
                  <Text style={[styles.dayText, (claimed || isNext) && styles.dayTextActive]}>{rewardForDay(pos)}</Text>
                </View>
              );
            })}
          </ScrollView>

          <Pressable
            testID="daily-checkin-button"
            disabled={claiming}
            onPress={claim}
            style={styles.claimBtn}
          >
            <Text style={styles.claimText}>{`Claim +${nextReward} points`}</Text>
          </Pressable>
        </View>
      )}

      {/* Games grid */}
      <View style={[styles.grid, { marginTop: claimedToday ? 4 : 22 }]}>
        {GAMES.map((g) => (
          <Pressable
            key={g.id}
            testID={`game-card-${g.id}`}
            style={styles.gameCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push(`/game/${g.id}`);
            }}
          >
            <View style={styles.gameIcon}>
              <Icon name={g.icon} size={28} color={colors.brand} weight="fill" />
            </View>
            <Text
              style={styles.gameTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              allowFontScaling={false}
            >
              {g.title}
            </Text>
            <Text
              style={styles.gameSub}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              allowFontScaling={false}
            >
              {g.subtitle}
            </Text>
            <View style={styles.playChip}>
              <Text style={styles.playText}>Win 10k+ pts</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  hero: { backgroundColor: c.brandPrimary, borderRadius: 24, padding: 18 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  days: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  dayBubble: {
    width: 52,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleActive: { backgroundColor: c.warning },
  dayBubbleNext: { backgroundColor: c.brandSecondary },
  dayText: { color: "rgba(255,255,255,0.7)", fontWeight: "800", fontSize: 11 },
  dayTextActive: { color: "#FFFFFF" },
  claimBtn: { marginTop: 18, height: 50, borderRadius: 999, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  claimBtnDone: { backgroundColor: "rgba(255,255,255,0.15)" },
  claimText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: c.onSurface, marginTop: 22, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  gameCard: {
    width: "48%",
    backgroundColor: c.surfaceSecondary,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  gameIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  gameTitle: { fontSize: 16, fontWeight: "800", color: c.onSurfaceSecondary },
  gameSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  playChip: { marginTop: 12, alignSelf: "flex-start", backgroundColor: c.success + "1A", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  playText: { fontSize: 12, fontWeight: "800", color: c.success },
}));
