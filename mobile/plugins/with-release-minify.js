const { withGradleProperties } = require("expo/config-plugins");

// Enables R8 code minification and resource shrinking for release builds.
// Both are off by default in the Expo Android template, which leaves the APK
// much larger than needed and slower to install/launch. Expo modules ship their
// own consumer ProGuard rules, so this is safe with the standard stack.
module.exports = function withReleaseMinify(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const set = (key, value) => {
      const existing = props.find((p) => p.type === "property" && p.key === key);
      if (existing) existing.value = value;
      else props.push({ type: "property", key, value });
    };
    set("android.enableMinifyInReleaseBuilds", "true");
    set("android.enableShrinkResourcesInReleaseBuilds", "true");
    return config;
  });
};
