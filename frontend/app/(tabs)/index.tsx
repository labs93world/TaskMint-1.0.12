import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";
import { TaskLogo } from "@/src/components/ui/TaskLogo";
import { Segmented } from "@/src/components/ui/Segmented";
import { Button } from "@/src/components/ui/Button";
import { Popup } from "@/src/components/ui/Popup";
import { BannerCarousel } from "@/src/components/BannerCarousel";
import { PlayEarn } from "@/src/components/home/PlayEarn";
import { TaskDetailModal } from "@/src/components/home/TaskDetailModal";
import {
  listBanners,
  listTasks,
  createSubmission,
  OfferTask,
  OfferStatus,
} from "@/src/lib/firestore";
import { useUser } from "@/src/context/UserContext";
import { useToast } from "@/src/components/ui/Toast";
import { storage } from "@/src/utils/storage";
import { KEYS } from "@/src/lib/storageKeys";
import { processAndNotify } from "@/src/lib/notifications";
import { formatPoints, formatRupees, rupeesToPoints } from "@/src/utils/format";

const MOTIVATION = [
  "Your next reward is one task away 🚀",
  "Keep earning, your wallet is growing 💰",
  "Small tasks, big rewards. Let's go!",
  "Turn your free time into real cash 💸",
];

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile, points, deviceId, submissions, reconcile, addPoints } = useUser();
  const toast = useToast();

  const [tab, setTab] = useState("play");
  const [activeTask, setActiveTask] = useState<OfferTask | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // First-open welcome bonus: ₹1 (1000 points), once per device.
  useEffect(() => {
    (async () => {
      const shown = await storage.getItem<boolean>(KEYS.welcomeShown, false);
      if (shown) return;
      await storage.setItem(KEYS.welcomeShown, true);
      await addPoints(rupeesToPoints(1), "Welcome bonus 🎉");
      setShowWelcome(true);
    })();
  }, [addPoints]);

  const bannersQ = useQuery({ queryKey: ["banners"], queryFn: () => listBanners() });
  const tasksQ = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks() });

  // Notify when a brand-new offerwall task appears (reuses this same read).
  useEffect(() => {
    if (tasksQ.data && tasksQ.data.length) {
      processAndNotify({ tasks: tasksQ.data }).catch(() => {});
    }
  }, [tasksQ.data]);

  const motivation = useMemo(
    () => MOTIVATION[Math.floor(Date.now() / 86400000) % MOTIVATION.length],
    [],
  );

  const onRefresh = useCallback(() => {
    bannersQ.refetch();
    tasksQ.refetch();
    reconcile();
  }, [bannersQ, tasksQ, reconcile]);

  const submissionFor = (taskId: string) =>
    submissions.find((s) => s.taskId === taskId) ?? null;

  // Ordering: latest submission-on → latest submission-off → pending →
  // approved → rejected. Within each group, newest task first.
  const sortedTasks = useMemo(() => {
    const rank = (t: OfferTask) => {
      const s = submissions.find((x) => x.taskId === t.id);
      if (!s) return t.submissionEnabled ? 0 : 1;
      if (s.status === "pending") return 2;
      if (s.status === "approved") return 3;
      return 4; // rejected
    };
    return [...(tasksQ.data ?? [])].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0); // latest first within group
    });
  }, [tasksQ.data, submissions]);

  const handleSubmit = async (proof: string) => {
    if (!activeTask) return;
    if (activeTask.submissionEnabled && proof.length < 2) {
      toast.show("Please enter your proof", "error");
      return;
    }
    setSubmitting(true);
    try {
      await createSubmission({
        deviceId,
        name: profile?.name ?? "",
        mobile: profile?.mobile ?? "",
        taskId: activeTask.id,
        taskTitle: activeTask.title,
        reward: activeTask.reward,
        proof,
      });
      await reconcile();
      setActiveTask(null);
      toast.show("Submitted! We'll review it shortly.", "success");
    } catch {
      toast.show("Could not submit. Try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const tasks = sortedTasks;

  return (
    <View style={styles.screen}>
      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.avatar}>
          {profile?.avatar ? (
            <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
          ) : (
            <Icon name="user" size={20} color={colors.brand} weight="fill" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} allowFontScaling={false}>
            Hii, {profile?.name || "Guest"}
          </Text>
          <Text style={styles.hello} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} allowFontScaling={false}>
            {motivation}
          </Text>
        </View>
        <View style={styles.pointsPill} testID="home-points">
          <Icon name="coins" size={15} color={colors.warning} weight="fill" />
          <Text style={styles.pointsText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} allowFontScaling={false}>
            {formatPoints(points)}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {!!(bannersQ.data && bannersQ.data.length) && (
          <View style={{ marginTop: 8 }}>
            <BannerCarousel banners={bannersQ.data} />
          </View>
        )}

        <View style={styles.body}>
          <Segmented
            testID="home-segmented"
            value={tab}
            onChange={setTab}
            options={[
              { key: "play", label: "Play & Earn" },
              { key: "offerwall", label: "Offerwall", badge: tasks.length },
            ]}
          />

          <View style={{ marginTop: 14 }}>
            {tab === "offerwall" ? (
              tasks.length === 0 ? (
                <EmptyTasks loading={tasksQ.isLoading} onRetry={() => tasksQ.refetch()} />
              ) : (
                tasks.map((t) => {
                  const sub = submissionFor(t.id);
                  return (
                    <Pressable
                      key={t.id}
                      testID={`task-card-${t.id}`}
                      style={styles.taskCard}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setActiveTask(t);
                      }}
                    >
                      <TaskLogo url={t.logoUrl} size={48} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskTitle} numberOfLines={1}>
                          {t.title}
                        </Text>
                        {sub ? (
                          <View style={styles.statusRow}>
                            <Text style={styles.taskSub}>Status:</Text>
                            <StatusPill status={sub.status} />
                          </View>
                        ) : (
                          <Text style={styles.taskSub} numberOfLines={1}>
                            {t.subtitle}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.taskReward}>{formatRupees(t.reward)}</Text>
                      <Icon name="caret-right" size={20} color={colors.muted} weight="bold" />
                    </Pressable>
                  );
                })
              )
            ) : (
              <PlayEarn />
            )}
          </View>
        </View>
      </ScrollView>

      <TaskDetailModal
        task={activeTask}
        submission={activeTask ? submissionFor(activeTask.id) : null}
        visible={!!activeTask}
        submitting={submitting}
        onClose={() => setActiveTask(null)}
        onSubmit={handleSubmit}
      />

      <Popup
        visible={showWelcome}
        onClose={() => setShowWelcome(false)}
        testID="welcome-popup"
      >
        <View style={styles.welcomeWrap}>
          <View style={styles.welcomeIcon}>
            <Icon name="gift" size={32} color={colors.onBrandPrimary} weight="fill" />
          </View>
          <Text
            style={styles.welcomeTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            allowFontScaling={false}
          >
            Welcome to TaskMint! 🎉
          </Text>
          <Text
            style={styles.welcomeAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            allowFontScaling={false}
          >
            {formatRupees(1)} added
          </Text>
          <Text style={styles.welcomeText}>
            Here&apos;s a welcome bonus to get you started. Earn more with tasks and games!
          </Text>
          <Button
            label="Awesome, let's go"
            testID="welcome-claim-button"
            onPress={() => setShowWelcome(false)}
            style={{ marginTop: 16, width: "100%" }}
          />
        </View>
      </Popup>
    </View>
  );
}

function StatusPill({ status }: { status: OfferStatus }) {
  const { colors } = useTheme();
  const color =
    status === "approved" ? colors.success : status === "rejected" ? colors.error : colors.warning;
  return (
    <View
      style={{
        borderWidth: 1.5,
        borderColor: color,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 1,
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: "800" }}>{status}</Text>
    </View>
  );
}

function EmptyTasks({ loading, onRetry }: { loading: boolean; onRetry: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Icon name="gift" size={44} color={colors.muted} weight="duotone" />
      <Text style={styles.emptyText}>
        {loading ? "Loading tasks..." : "No tasks available right now"}
      </Text>
      {!loading && (
        <Pressable onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>Refresh</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: c.surface,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 38, height: 38 },
  hello: { fontSize: 11.5, color: c.muted, fontWeight: "600", marginTop: 1 },
  name: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: c.brandTertiary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    maxWidth: 130,
  },
  pointsText: { fontSize: 14, fontWeight: "800", color: c.brand },
  body: { paddingHorizontal: 16, marginTop: 12 },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.surfaceSecondary,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  taskLogo: { width: 48, height: 48, borderRadius: 14, backgroundColor: c.surfaceTertiary },
  taskTitle: { fontSize: 16, fontWeight: "800", color: c.onSurfaceSecondary },
  taskSub: { fontSize: 13, color: c.muted, marginTop: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  taskReward: { fontSize: 17, fontWeight: "800", color: c.success },
  empty: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 15, color: c.muted, fontWeight: "600" },
  retryBtn: {
    marginTop: 4,
    backgroundColor: c.brandTertiary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  retryText: { color: c.brand, fontWeight: "800" },
  welcomeWrap: { alignItems: "center", paddingTop: 4 },
  welcomeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: c.onSurfaceSecondary,
    marginTop: 12,
    textAlign: "center",
  },
  welcomeAmount: {
    fontSize: 24,
    fontWeight: "800",
    color: c.success,
    marginTop: 4,
  },
  welcomeText: {
    fontSize: 13,
    color: c.muted,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 19,
  },
}));
