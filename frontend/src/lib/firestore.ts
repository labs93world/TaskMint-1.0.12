// Firestore data layer — global admin content + user requests only.
import {
  addDoc,
  collection,
  deleteDoc,
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
export async function ensureUser(deviceId: string, name: string, mobile: string) {
  const ref = doc(db, "users", deviceId);
  const snap = await getDoc(ref);
  const base = { deviceId, name, mobile, lastActiveAt: Date.now() };
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

// ------------------------------- Banners -------------------------------------
function sortPinned<T extends { pinned?: boolean; createdAt: number }>(arr: T[]) {
  return [...arr].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

export async function listBanners(includeHidden = false): Promise<Banner[]> {
  const snap = await getDocs(collection(db, "banners"));
  let items = snap.docs.map((d) => withId<Banner>(d));
  if (!includeHidden) items = items.filter((b) => !b.hidden);
  return sortPinned(items);
}

export async function addBanner(data: Omit<Banner, "id" | "createdAt">) {
  await addDoc(collection(db, "banners"), { ...data, createdAt: Date.now() });
}
export async function updateBanner(id: string, data: Partial<Banner>) {
  await updateDoc(doc(db, "banners", id), data);
}
export async function deleteBanner(id: string) {
  await deleteDoc(doc(db, "banners", id));
}

// ------------------------------- Offerwall tasks -----------------------------
export async function listTasks(includeHidden = false): Promise<OfferTask[]> {
  const snap = await getDocs(collection(db, "offerwall_tasks"));
  let items = snap.docs.map((d) => withId<OfferTask>(d));
  if (!includeHidden) items = items.filter((t) => !t.hidden);
  // pinned first, then explicit admin order (desc), then newest first
  return [...items].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const ao = a.order ?? a.createdAt;
    const bo = b.order ?? b.createdAt;
    return bo - ao;
  });
}

export async function addTask(data: Omit<OfferTask, "id" | "createdAt">) {
  await addDoc(collection(db, "offerwall_tasks"), {
    ...data,
    createdAt: Date.now(),
  });
}
export async function updateTask(id: string, data: Partial<OfferTask>) {
  await updateDoc(doc(db, "offerwall_tasks", id), data);
}
export async function deleteTask(id: string) {
  await deleteDoc(doc(db, "offerwall_tasks", id));
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

// ------------------------------- App config ----------------------------------
export async function getConfig(): Promise<AppConfig | null> {
  const snap = await getDoc(doc(db, "app_config", "config"));
  return snap.exists() ? (snap.data() as AppConfig) : null;
}

export async function setConfig(data: AppConfig) {
  await setDoc(doc(db, "app_config", "config"), data, { merge: true });
}
