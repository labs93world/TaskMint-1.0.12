import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { storage } from "@/src/utils/storage";
import { KEYS } from "@/src/lib/storageKeys";
import { processAndNotify } from "@/src/lib/notifications";
import {
  ensureUser,
  myPayouts,
  mySubmissions,
  touchActive,
  PayoutRequest,
  OfferSubmission,
} from "@/src/lib/firestore";
import { rupeesToPoints } from "@/src/utils/format";

export type Profile = { name: string; mobile: string; password?: string; avatar?: string };

export type Txn = {
  id: string;
  title: string;
  points: number; // positive earn, negative spend
  createdAt: number;
};

type Ctx = {
  ready: boolean;
  deviceId: string;
  onboarded: boolean;
  profile: Profile | null;
  points: number;
  transactions: Txn[];
  payouts: PayoutRequest[];
  submissions: OfferSubmission[];
  completeOnboarding: (p: Profile) => Promise<void>;
  addPoints: (points: number, title: string) => Promise<void>;
  spendPoints: (points: number, title: string) => Promise<boolean>;
  reconcile: () => Promise<void>;
};

const UserContext = createContext<Ctx | null>(null);

function randomId() {
  return (
    "dev_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [onboarded, setOnboarded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [points, setPoints] = useState(0);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [submissions, setSubmissions] = useState<OfferSubmission[]>([]);
  const bootProfile = useRef<Profile | null>(null);

  useEffect(() => {
    (async () => {
      let id = await storage.getItem<string>(KEYS.deviceId, "");
      if (!id) {
        id = randomId();
        await storage.setItem(KEYS.deviceId, id);
      }
      const ob = await storage.getItem<boolean>(KEYS.onboarded, false);
      const pr = await storage.getItem<Profile | null>(KEYS.profile, null);
      const pts = await storage.getItem<number>(KEYS.points, 0);
      const txns = await storage.getItem<Txn[]>(KEYS.transactions, []);
      setDeviceId(id!);
      setOnboarded(!!ob);
      setProfile(pr);
      bootProfile.current = pr;
      setPoints(pts ?? 0);
      setTransactions(txns ?? []);
      setReady(true);
      if (ob && pr) {
        ensureUser(id!, pr.name, pr.mobile, pr.password).catch(() => {});
      }
    })();
  }, []);

  const completeOnboarding = useCallback(
    async (p: Profile) => {
      setProfile(p);
      setOnboarded(true);
      bootProfile.current = p;
      await storage.setItem(KEYS.profile, p);
      await storage.setItem(KEYS.onboarded, true);
      if (deviceId) await ensureUser(deviceId, p.name, p.mobile, p.password).catch(() => {});
    },
    [deviceId],
  );

  const persistPoints = useCallback(async (next: number, txn: Txn) => {
    setPoints(next);
    await storage.setItem(KEYS.points, next);
    setTransactions((prev) => {
      const updated = [txn, ...prev].slice(0, 500);
      storage.setItem(KEYS.transactions, updated);
      return updated;
    });
  }, []);

  const addPoints = useCallback(
    async (p: number, title: string) => {
      const txn: Txn = {
        id: randomId(),
        title,
        points: Math.round(p),
        createdAt: Date.now(),
      };
      setPoints((cur) => {
        const next = cur + Math.round(p);
        storage.setItem(KEYS.points, next);
        return next;
      });
      setTransactions((prev) => {
        const updated = [txn, ...prev].slice(0, 500);
        storage.setItem(KEYS.transactions, updated);
        return updated;
      });
    },
    [],
  );

  const spendPoints = useCallback(
    async (p: number, title: string) => {
      let ok = false;
      setPoints((cur) => {
        if (cur < p) return cur;
        ok = true;
        const next = cur - Math.round(p);
        storage.setItem(KEYS.points, next);
        return next;
      });
      // wait a tick so the setter has run
      await new Promise((r) => setTimeout(r, 0));
      if (ok) {
        const txn: Txn = {
          id: randomId(),
          title,
          points: -Math.round(p),
          createdAt: Date.now(),
        };
        setTransactions((prev) => {
          const updated = [txn, ...prev].slice(0, 500);
          storage.setItem(KEYS.transactions, updated);
          return updated;
        });
      }
      return ok;
    },
    [],
  );

  const reconcile = useCallback(async () => {
    if (!deviceId) return;
    const pr = bootProfile.current;
    try {
      if (pr) await touchActive(deviceId);
      const [pays, subs] = await Promise.all([
        myPayouts(deviceId),
        mySubmissions(deviceId),
      ]);
      setPayouts(pays);
      setSubmissions(subs);
      // Notify about withdrawal / task-approval status changes (reuses these
      // already-fetched reads, so no extra Firestore reads are performed).
      processAndNotify({ pays, subs }).catch(() => {});

      // Refund points for rejected withdrawals (once).
      const refunded = (await storage.getItem<string[]>(KEYS.refundedPayouts, [])) ?? [];
      const newRefunds: string[] = [];
      for (const p of pays) {
        if (p.status === "rejected" && !refunded.includes(p.id)) {
          await addPoints(rupeesToPoints(p.amount), `Refund • Withdrawal rejected`);
          newRefunds.push(p.id);
        }
      }
      if (newRefunds.length) {
        await storage.setItem(KEYS.refundedPayouts, [...refunded, ...newRefunds]);
      }

      // Credit points for approved offerwall submissions (once).
      const credited = (await storage.getItem<string[]>(KEYS.creditedSubs, [])) ?? [];
      const newCredits: string[] = [];
      for (const s of subs) {
        if (s.status === "approved" && !credited.includes(s.id)) {
          await addPoints(rupeesToPoints(s.reward), `Task approved • ${s.taskTitle}`);
          newCredits.push(s.id);
        }
      }
      if (newCredits.length) {
        await storage.setItem(KEYS.creditedSubs, [...credited, ...newCredits]);
      }
    } catch {
      // offline / transient
    }
  }, [deviceId, addPoints]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      deviceId,
      onboarded,
      profile,
      points,
      transactions,
      payouts,
      submissions,
      completeOnboarding,
      addPoints,
      spendPoints,
      reconcile,
    }),
    [
      ready,
      deviceId,
      onboarded,
      profile,
      points,
      transactions,
      payouts,
      submissions,
      completeOnboarding,
      addPoints,
      spendPoints,
      reconcile,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
