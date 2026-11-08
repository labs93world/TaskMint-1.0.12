// Firestore data layer — global admin content + user requests only.
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import { startOfTodayIST } from "@/src/utils/time";

export type ReqStatus = "pending" | "successful" | "rejected";
export type OfferStatus = "pending" | "approved" | "rejected";

export type Banner = {
  id: string;
  imageUrl: string;
  redirectUrl?: string;
  pinned?: boolean;
  hidden?: boolean;
  order?: number;
  createdAt: number;
};

export type OfferTask = {
  id: string;
  title: string;
  subtitle: string;
  logoUrl: string;
  taskUrl?: string;
  rules: string;
  reward: number; // rupees
  submissionEnabled: boolean;
  proofHint?: string;
  pinned?: boolean;
  hidden?: boolean;
  order?: number;
  createdAt: number;
};

export type PayoutRequest = {
  id: string;
  deviceId: string;
  name: string;
  mobile: string;
  amount: number; // rupees
  method: "UPI" | "Bank";
  detail: string; // upi id or bank details
  status: ReqStatus;
  reason?: string;
  createdAt: number;
};

export type OfferSubmission = {
  id: string;
  deviceId: string;
  name: string;
  mobile: string;
  taskId: string;
  taskTitle: string;
  reward: number; // rupees
  proof: string;
  status: OfferStatus;
  reason?: string;
  createdAt: number;
};

export type AppConfig = {
  forceUpdate: boolean;
  latestVersion: string;
  updateUrl: string;
  message: string;
};

const withId = <T,>(d: any): T => ({ id: d.id, ...d.data() } as T);

// ------------------------- Users (presence / counts) -------------------------
export async function ensureUser(
  deviceId: string,
  name: string,
  mobile: string,
  password?: string,
) {
  const ref = doc(db, "users", deviceId);
  const snap = await getDoc(ref);
  const base: Record<string, any> = { deviceId, name, mobile, lastActiveAt: Date.now() };
  if (password) base.password = password;
  if (snap.exists()) {
    await setDoc(ref, base, { merge: true });
  } else {
    await setDoc(ref, { ...base, createdAt: Date.now() });
  }
}

export async function touchActive(deviceId: string) {
  try {
    await setDoc(
      doc(db, "users", deviceId),
      { lastActiveAt: Date.now() },
      { merge: true },
    );
  } catch {
    // non-blocking
  }
}

// Saves this device's FCM push token on its user doc so Cloud Functions can
// deliver remote pushes even when the app is closed.
export async function savePushToken(
  deviceId: string,
  token: string,
  platform: string,
) {
  await setDoc(
    doc(db, "users", deviceId),
    {
      deviceId,
      fcmToken: token,
      pushPlatform: platform,
      pushEnabled: true,
      tokenUpdatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function countUsers(): Promise<number> {
  const snap = await getCountFromServer(collection(db, "users"));
  return snap.data().count;
}

export async function countActiveToday(): Promise<number> {
  const q = query(
    collection(db, "users"),
    where("lastActiveAt", ">=", startOfTodayIST()),
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// --------------------------- Meta catalog (single doc) -----------------------
// Banners, offerwall tasks and force-update config all live in ONE document
// (meta/catalog) so a user app launch costs exactly one Firestore read.
export type Catalog = {
  banners: Banner[];
  tasks: OfferTask[];
  config: AppConfig | null;
};

const catalogRef = () => doc(db, "meta", "catalog");

function sortPinned<T extends { pinned?: boolean; createdAt: number }>(arr: T[]) {
  return [...arr].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

function sortTasks(items: OfferTask[]) {
  // pinned first, then explicit admin order (desc), then newest first
  return [...items].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const ao = a.order ?? a.createdAt;
    const bo = b.order ?? b.createdAt;
    return bo - ao;
  });
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Raw catalog (includes hidden items). If the single doc doesn't exist yet and
// `migrate` is set (admin only), it is built once from the legacy collections.
export async function getCatalog(migrate = false): Promise<Catalog> {
  const snap = await getDoc(catalogRef());
  if (snap.exists()) {
    const d = snap.data() as Partial<Catalog>;
    return { banners: d.banners ?? [], tasks: d.tasks ?? [], config: d.config ?? null };
  }
  if (!migrate) return { banners: [], tasks: [], config: null };
  const [b, t, c] = await Promise.all([
    getDocs(collection(db, "banners")),
    getDocs(collection(db, "offerwall_tasks")),
    getDoc(doc(db, "app_config", "config")),
  ]);
  const cat: Catalog = {
    banners: b.docs.map((x) => withId<Banner>(x)),
    tasks: t.docs.map((x) => withId<OfferTask>(x)),
    config: c.exists() ? (c.data() as AppConfig) : null,
  };
  await setDoc(catalogRef(), cat);
  return cat;
}

// Visible, sorted view for users.
export function visibleBanners(c: Catalog) {
  return sortPinned(c.banners.filter((b) => !b.hidden));
}
export function visibleTasks(c: Catalog) {
  return sortTasks(c.tasks.filter((t) => !t.hidden));
}
export function adminBanners(c: Catalog) {
  return sortPinned(c.banners);
}
export function adminTasks(c: Catalog) {
  return sortTasks(c.tasks);
}

// Admin writes: replace one field of the catalog doc (no read needed).
export async function saveCatalogField<K extends keyof Catalog>(key: K, value: Catalog[K]) {
  await setDoc(catalogRef(), { [key]: value }, { merge: true });
}

// ------------------------------- Payout requests -----------------------------
export async function createPayout(data: Omit<PayoutRequest, "id" | "createdAt" | "status">) {
  const ref = await addDoc(collection(db, "payout_requests"), {
    ...data,
    status: "pending" as ReqStatus,
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function myPayouts(deviceId: string): Promise<PayoutRequest[]> {
  const q = query(collection(db, "payout_requests"), where("deviceId", "==", deviceId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => withId<PayoutRequest>(d))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function adminPayouts(status: ReqStatus): Promise<PayoutRequest[]> {
  const q = query(collection(db, "payout_requests"), where("status", "==", status));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => withId<PayoutRequest>(d))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function setPayoutStatus(id: string, status: ReqStatus, reason?: string) {
  await updateDoc(doc(db, "payout_requests", id), { status, reason: reason ?? "" });
}

// ------------------------------- Offerwall submissions -----------------------
export async function createSubmission(data: Omit<OfferSubmission, "id" | "createdAt" | "status">) {
  const ref = await addDoc(collection(db, "offerwall_submissions"), {
    ...data,
    status: "pending" as OfferStatus,
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function mySubmissions(deviceId: string): Promise<OfferSubmission[]> {
  const q = query(collection(db, "offerwall_submissions"), where("deviceId", "==", deviceId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => withId<OfferSubmission>(d))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function adminSubmissions(status: OfferStatus): Promise<OfferSubmission[]> {
  const q = query(collection(db, "offerwall_submissions"), where("status", "==", status));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => withId<OfferSubmission>(d))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function setSubmissionStatus(id: string, status: OfferStatus, reason?: string) {
  await updateDoc(doc(db, "offerwall_submissions", id), { status, reason: reason ?? "" });
}
