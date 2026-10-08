// Remote push (FCM) registration for TaskMint.
//
// This obtains the device's NATIVE FCM push token and stores it on the user's
// Firestore doc. Firebase Cloud Functions (see /app/functions) then send pushes
// to that token — so notifications arrive even when the app is closed or has
// never been opened in the current session.
//
// Native only: on web / Expo Go the native FCM module is absent, so this no-ops.
// A real push token is only issued in a development/production build, NOT Expo Go.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";
import { KEYS } from "@/src/lib/storageKeys";
import { savePushToken } from "@/src/lib/firestore";

const isNative = Platform.OS !== "web";

// Registers this device for remote FCM push and saves the token to Firestore.
// Safe to call repeatedly — it only writes when the token actually changes.
export async function registerForPush(deviceId: string): Promise<void> {
  if (!isNative || !deviceId) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return; // permission is requested elsewhere first

    // Native device token = FCM registration token on Android (google-services.json)
    // and APNs token bridged to FCM on iOS.
    const tokenResult = await Notifications.getDevicePushTokenAsync();
    const token = tokenResult?.data ? String(tokenResult.data) : "";
    if (!token) return;

    const last = await storage.getItem<string>(KEYS.pushToken, "");
    if (last === token) return; // already saved

    await savePushToken(deviceId, token, Platform.OS);
    await storage.setItem(KEYS.pushToken, token);
  } catch {
    // transient / unsupported — ignore
  }
}
