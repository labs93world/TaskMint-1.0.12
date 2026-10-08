import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";
import { Button } from "@/src/components/ui/Button";
import {
  AdErrorKind,
  AdType,
  adsAvailable,
  GatedAd,
  makeGatedAd,
} from "@/src/ads";

type ShowAd = (type: AdType, cooldownMs: number) => Promise<boolean>;

const AdGateContext = createContext<{ showAd: ShowAd } | null>(null);

type GateState =
  | { phase: "hidden" }
  | { phase: "loading" }
  | { phase: "error"; kind: AdErrorKind };

const ERROR_COPY: Record<AdErrorKind, { title: string; message: string; icon: any }> = {
  network: {
    title: "No internet connection",
    message: "We couldn't reach the ad network. Check your connection and try again.",
    icon: "wifi-slash",
  },
  "no-fill": {
    title: "No ad available",
    message: "No ad is available right now. Please try again in a few moments.",
    icon: "clock",
  },
  timeout: {
    title: "Ad took too long",
    message: "The ad couldn't load in time. Try again to earn your reward.",
    icon: "clock",
  },
  unknown: {
    title: "Something went wrong",
    message: "The ad couldn't be loaded. Please try again.",
    icon: "x-circle",
  },
};

export function AdGateProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [state, setState] = useState<GateState>({ phase: "hidden" });

  const handleRef = useRef<GatedAd | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const earnedRef = useRef(false);
  const settledRef = useRef(true);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);
  const reqRef = useRef<{ type: AdType; cooldownMs: number }>({ type: "rewarded", cooldownMs: 5000 });

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanup = useCallback(() => {
    clearTimer();
    if (handleRef.current) {
      handleRef.current.destroy();
      handleRef.current = null;
    }
  }, []);

  const finish = useCallback(
    (val: boolean) => {
      if (settledRef.current) return;
      settledRef.current = true;
      cleanup();
      setState({ phase: "hidden" });
      const r = resolveRef.current;
      resolveRef.current = null;
      if (r) r(val);
    },
    [cleanup],
  );

  const beginLoad = useCallback(() => {
    const { type, cooldownMs } = reqRef.current;
    earnedRef.current = false;
    setState({ phase: "loading" });

    const handle = makeGatedAd(type, {
      onLoaded: () => {
        clearTimer();
        handleRef.current?.show();
      },
      onEarned: () => {
        earnedRef.current = true;
      },
      onClosed: () => finish(earnedRef.current),
      onError: (kind) => {
        clearTimer();
        setState({ phase: "error", kind });
      },
    });
    handleRef.current = handle;

    if (!handle) {
      // Ads unavailable (web / Expo Go) — grant immediately.
      finish(true);
      return;
    }

    handle.load();
    clearTimer();
    timerRef.current = setTimeout(() => {
      // Still not loaded within the cooldown window.
      setState({ phase: "error", kind: "timeout" });
    }, cooldownMs);
  }, [finish]);

  const showAd = useCallback<ShowAd>(
    (type, cooldownMs) => {
      // Not a native build — grant immediately without any UI.
      if (!adsAvailable) return Promise.resolve(true);
      // Guard against overlapping requests.
      if (!settledRef.current) return Promise.resolve(false);
      settledRef.current = false;
      reqRef.current = { type, cooldownMs };
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        beginLoad();
      });
    },
    [beginLoad],
  );

  const retry = useCallback(() => {
    cleanup();
    beginLoad();
  }, [cleanup, beginLoad]);

  const copy = state.phase === "error" ? ERROR_COPY[state.kind] : null;

  return (
    <AdGateContext.Provider value={{ showAd }}>
      {children}
      <Modal
        visible={state.phase !== "hidden"}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.backdrop} testID="ad-gate">
          <View style={styles.card}>
            {state.phase === "loading" ? (
              <View style={styles.center} testID="ad-gate-loading">
                <ActivityIndicator size="large" color={colors.brand} />
                <Text style={styles.loadingText}>Loading ad…</Text>
                <Text style={styles.loadingSub}>Please wait a moment</Text>
              </View>
            ) : copy ? (
              <View style={styles.center} testID="ad-gate-error">
                <View style={styles.errIcon}>
                  <Icon name={copy.icon} size={34} color={colors.error} weight="fill" />
                </View>
                <Text style={styles.errTitle}>{copy.title}</Text>
                <Text style={styles.errMsg}>{copy.message}</Text>
                <Button
                  label="Try again"
                  testID="ad-gate-retry"
                  onPress={retry}
                  style={{ marginTop: 20, width: "100%" }}
                />
                <Button
                  label="Cancel"
                  variant="tertiary"
                  testID="ad-gate-cancel"
                  onPress={() => finish(false)}
                  style={{ marginTop: 10, width: "100%" }}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </AdGateContext.Provider>
  );
}

export function useAdGate() {
  const ctx = useContext(AdGateContext);
  if (!ctx) throw new Error("useAdGate must be used within AdGateProvider");
  return ctx;
}

const useStyles = makeStyles((c) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: c.surfaceSecondary,
    borderRadius: 24,
    padding: 28,
  },
  center: { alignItems: "center" },
  loadingText: { fontSize: 17, fontWeight: "800", color: c.onSurfaceSecondary, marginTop: 18 },
  loadingSub: { fontSize: 13, color: c.muted, marginTop: 4 },
  errIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.error + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  errTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: c.onSurfaceSecondary,
    marginTop: 16,
    textAlign: "center",
  },
  errMsg: {
    fontSize: 14,
    color: c.muted,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
}));
