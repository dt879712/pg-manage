const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Allows plain-HTTP requests from release/preview builds.
 * Android 9+ (targetSdk >= 28) blocks cleartext traffic by default, which prevents
 * the app from reaching an http:// backend (e.g. a dev server on the LAN).
 */
module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$ = application.$ ?? {};
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return config;
  });
};
