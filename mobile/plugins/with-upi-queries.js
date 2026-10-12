const { withAndroidManifest } = require("@expo/config-plugins");

/** Declares UPI app URL schemes in AndroidManifest <queries> so Android 11+ can open them. */
module.exports = function withUpiQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    if (!Array.isArray(manifest.manifest.queries)) {
      manifest.manifest.queries = [];
    }

    const schemes = ["upi", "tez", "phonepe", "paytmmp", "paytm", "bhim"];
    for (const scheme of schemes) {
      manifest.manifest.queries.push({
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            data: [{ $: { "android:scheme": scheme } }],
            category: [
              { $: { "android:name": "android.intent.category.DEFAULT" } },
              { $: { "android:name": "android.intent.category.BROWSABLE" } },
            ],
          },
        ],
      });
    }

    return config;
  });
};