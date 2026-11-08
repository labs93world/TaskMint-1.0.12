// Fixes a typo in react-native-google-mobile-ads/android/app-json.gradle where
// the "no config" branch sets `googleAdsJson` instead of `googleMobileAdsJson`.
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "node_modules", "react-native-google-mobile-ads", "android", "app-json.gradle");
try {
  const src = fs.readFileSync(file, "utf8");
  const fixed = src.replace("rootProject.ext.googleAdsJson = false", "rootProject.ext.googleMobileAdsJson = false");
  if (fixed !== src) fs.writeFileSync(file, fixed);
} catch {
  // package not installed — nothing to patch
}
