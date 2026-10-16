import { createApp } from "./app";
import { env } from "./env";
import { cleanupExpiredMessages } from "./routes/messages";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

// Keep the process alive on unexpected errors instead of crashing the container.
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaught exception", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandled rejection", reason);
});

function runMessageCleanup() {
  cleanupExpiredMessages()
    .then((count) => {
      if (count > 0) console.log(`[messages] removed ${count} expired message(s)`);
    })
    .catch((err) => console.error("[messages] cleanup failed", err));
}

createApp().listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
  runMessageCleanup();
  setInterval(runMessageCleanup, CLEANUP_INTERVAL_MS).unref();
});
