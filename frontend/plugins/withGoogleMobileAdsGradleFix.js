// Ensures react-native-google-mobile-ads always finds `googleMobileAdsJson` in
// Gradle, even when the build pipeline rewrites app.json and drops the root
// "react-native-google-mobile-ads" key (the library's own fallback has a typo
// and leaves the property undefined, which crashes the Android build).
const { withProjectBuildGradle } = require("expo/config-plugins");

const MARKER = "// @gma-gradle-fix";

module.exports = function withGoogleMobileAdsGradleFix(config, props = {}) {
  const appId = props.androidAppId || "";
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy" || cfg.modResults.contents.includes(MARKER)) {
      return cfg;
    }
    // Appended (root script runs fully before subprojects are evaluated).
    const block = `
${MARKER}
ext {
  googleMobileAdsJson = [
    raw: [android_app_id: "${appId}"],
    isFlagEnabled: { key, defaultValue -> defaultValue },
    getStringValue: { key, defaultValue -> key == "android_app_id" ? "${appId}" : defaultValue }
  ]
}
`;
    cfg.modResults.contents = cfg.modResults.contents + block;
    return cfg;
  });
};
