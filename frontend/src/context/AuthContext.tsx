import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Crypto from "expo-crypto";
import { api, clearToken, getToken, setToken } from "../lib/api";
import { setExchangeRatio } from "../lib/theme";

export type AppUser = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  points: number;
  total_earned: number;
  total_tasks: number;
  streak: number;
  last_checkin?: string;
  daily_spins_used: number;
  daily_scratches_used: number;
  pending_spin_reward?: number;
  pending_scratch_reward?: number;
  has_first_withdrawal: boolean;
  custom_exchange_ratio?: number | null;
  custom_withdraw_amounts?: number[] | null;
  is_admin: boolean;
  watch_cycle_started_at?: string;
  watch_cycle_used?: number;
};

type AuthContextType = {
  user: AppUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  deviceLogin: () => Promise<AppUser>;
  adminLogin: (email: string, password: string) => Promise<void>;
  adminLogout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as any);

const DEVICE_KEY = "tm_device_id";

/**
 * Return a device ID that is stable across:
 *   - app restarts
 *   - clearing app data / cache
 *   - uninstalling and reinstalling the app
 *
 * Android:  Settings.Secure.ANDROID_ID (scoped per signing key + per user, survives reinstall).
 * iOS:      identifierForVendor  (survives as long as any app from the same vendor is installed;
 *           unique per device otherwise).
 * Web:      falls back to a random id stored in localStorage / AsyncStorage (web has no
 *           real hardware id).
 *
 * The ID is also cached in AsyncStorage so we only hit the native module once per install.
 * Because the hardware ID itself is deterministic, reinstalling yields the exact same ID
 * and the backend's /auth/device endpoint returns the existing account instead of creating
 * a new one — enforcing "one device = one account".
 */
async function getPersistentDeviceId(): Promise<string> {
  try {
    if (Platform.OS === "android") {
      const aid = Application.getAndroidId?.();
      if (aid && aid.length >= 6) return `and_${aid}`;
    } else if (Platform.OS === "ios") {
      const vid = await Application.getIosIdForVendorAsync?.();
      if (vid && vid.length >= 6) return `ios_${vid}`;
    }
  } catch {}
  return "";
}

async function getOrCreateDeviceId(): Promise<string> {
  // 1. Always prefer the hardware-persistent ID (survives reinstall + clear-data).
  const hwId = await getPersistentDeviceId();
  if (hwId) {
    // Keep AsyncStorage in sync so offline code paths still work.
    await AsyncStorage.setItem(DEVICE_KEY, hwId);
    return hwId;
  }

  // 2. Fallback to cached ID (for web / older devices where hardware id is not available).
  const cached = await AsyncStorage.getItem(DEVICE_KEY);
  if (cached) return cached;

  // 3. Last resort: random (web preview only).
  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const t = await getToken();
      if (!t) {
        setUser(null);
        return;
      }
      const u = await api<AppUser>("/auth/me");
      setUser(u);
    } catch {
      setUser(null);
      await clearToken();
    }
  }, []);

  const deviceLogin = useCallback(async (): Promise<AppUser> => {
    const device_id = await getOrCreateDeviceId();

    // Stable hardware fingerprint that survives clone apps / parallel-space.
    // Cloning apps cannot fake the underlying hardware properties — only the
    // sandboxed ANDROID_ID. Hashing these together gives us a stable signature
    // per physical device. The backend uses it to attach a clone's new
    // device_id to the original account instead of creating a duplicate.
    let fingerprint: string | undefined;
    let device_meta: Record<string, any> | undefined;
    try {
      const meta: Record<string, any> = {
        os: Platform.OS,
        brand: (Device as any).brand ?? null,
        manufacturer: (Device as any).manufacturer ?? null,
        modelName: (Device as any).modelName ?? null,
        modelId: (Device as any).modelId ?? null,
        designName: (Device as any).designName ?? null,
        productName: (Device as any).productName ?? null,
        deviceYearClass: (Device as any).deviceYearClass ?? null,
        totalMemory: (Device as any).totalMemory ?? null,
        osBuildId: (Device as any).osBuildId ?? null,
        osInternalBuildId: (Device as any).osInternalBuildId ?? null,
        platformApiLevel: (Device as any).platformApiLevel ?? null,
      };
      device_meta = meta;
      const raw = [
        meta.os,
        meta.brand,
        meta.manufacturer,
        meta.modelName,
        meta.modelId,
        meta.designName,
        meta.productName,
        meta.osBuildId,
        meta.osInternalBuildId,
        String(meta.totalMemory ?? ""),
      ]
        .map((v) => String(v ?? ""))
        .join("|");
      fingerprint = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        raw
      );
    } catch {}

    const res = await api<{ user: AppUser; session_token: string }>("/auth/device", {
      method: "POST",
      body: { device_id, fingerprint, device_meta },
      auth: false,
    });
    await setToken(res.session_token);
    setUser(res.user);
    return res.user;
  }, []);

  const adminLogin = useCallback(async (email: string, password: string) => {
    // On a truly-fresh install the update gate can appear before the user has a
    // device session. admin-login needs a bearer token, so establish a device
    // session first if none exists — otherwise the call 401s and bounces.
    const existing = await getToken();
    if (!existing) {
      await deviceLogin();
    }
    const res = await api<{ user: AppUser }>("/auth/admin-login", {
      method: "POST",
      body: { email, password },
    });
    setUser(res.user);
  }, [deviceLogin]);

  const adminLogout = useCallback(async () => {
    const res = await api<{ user: AppUser }>("/auth/admin-logout", { method: "POST" });
    setUser(res.user);
  }, []);

  useEffect(() => {
    // Sync the live admin-controlled exchange ratio on every cold-start so all
    // UI conversions (BalanceCard, withdraw, refer payout previews) use the
    // current value, not the hardcoded 100.
    (async () => {
      try {
        const ws = await api<{ exchange_points_per_inr?: number }>("/withdraw-settings", { auth: false });
        if (ws?.exchange_points_per_inr) setExchangeRatio(ws.exchange_points_per_inr);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      // If a session already exists (returning user after app reopen) → refresh
      // it and route straight to home. The hardware device id will re-link
      // returning installs to the same account, but we only call /auth/device
      // explicitly from the Login screen so first-time installers see the
      // welcome screen instead of being silently signed in.
      const t = await getToken();
      if (t) {
        await refreshUser();
        setLoading(false);
        return;
      }
      setLoading(false);
    })();
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, deviceLogin, adminLogin, adminLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
