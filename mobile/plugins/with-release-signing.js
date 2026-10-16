const { withAppBuildGradle } = require("expo/config-plugins");

// Adds a release signing config driven by environment variables, so CI can build
// a properly signed release .aab for Google Play (Play rejects debug-signed bundles).
//
// It only activates when UPLOAD_STORE_FILE is set, so normal preview/APK builds
// keep using the default debug signing.
module.exports = function withReleaseSigning(config) {
  if (!process.env.UPLOAD_STORE_FILE) return config;

  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("with-release-signing: expected a Groovy build.gradle");
    }

    let contents = config.modResults.contents;

    if (contents.includes("UPLOAD_STORE_FILE")) return config;

    const releaseSigningConfig = `        release {
            storeFile file(System.getenv("UPLOAD_STORE_FILE"))
            storePassword System.getenv("UPLOAD_STORE_PASSWORD")
            keyAlias System.getenv("UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("UPLOAD_KEY_PASSWORD")
        }`;

    contents = contents.replace(/signingConfigs\s*\{/, (m) => `${m}\n${releaseSigningConfig}`);

    contents = contents.replace(
      /\/\/ Caution! In production[\s\S]*?signingConfig\s+signingConfigs\.debug/,
      "signingConfig signingConfigs.release"
    );

    config.modResults.contents = contents;
    return config;
  });
};
