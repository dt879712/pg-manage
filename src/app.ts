import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { env } from "./env";
import { authRouter } from "./routes/auth";
import { propertiesRouter } from "./routes/properties";
import { roomsRouter, bedsRouter } from "./routes/rooms";
import { studentsRouter } from "./routes/students";
import { attendanceRouter } from "./routes/attendance";
import { invoicesRouter, paymentsRouter } from "./routes/fees";
import { usersRouter } from "./routes/users";
import { documentsRouter } from "./routes/documents";
import { tenantRouter } from "./routes/tenant";
import { notificationsRouter } from "./routes/notifications";
import { admissionsRouter } from "./routes/admissions";
import { leavesRouter } from "./routes/leaves";
import { messagesRouter } from "./routes/messages";
import { statusVideosRouter } from "./routes/statusVideos";
import { advanceFeesRouter } from "./routes/advanceFees";
import { mediaRouter } from "./routes/media";
import { DATABASE_LIMIT_BYTES, databaseStorageGuard, getDatabaseSizeBytes } from "./middleware/databaseStorage";

export function createApp() {
  const app = express();
  const origins = env.corsOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins.includes("*") ? "*" : origins }));
  app.use(express.json({ limit: "2mb" }));
  app.use(databaseStorageGuard);

  app.get("/health", async (_req, res) => {
    try {
      await getDatabaseSizeBytes();
      res.json({ ok: true, database: "connected", storageLimitMb: DATABASE_LIMIT_BYTES / 1_000_000 });
    } catch {
      res.status(503).json({ ok: false, database: "unavailable" });
    }
  });

  app.use("/auth", authRouter);
  app.use("/properties", propertiesRouter);
  app.use("/rooms", roomsRouter);
  app.use("/beds", bedsRouter);
  app.use("/students", studentsRouter);
  app.use("/attendance", attendanceRouter);
  app.use("/invoices", invoicesRouter);
  app.use("/payments", paymentsRouter);
  app.use("/advance-fees", advanceFeesRouter);
  app.use("/users", usersRouter);
  app.use("/documents", documentsRouter);
  app.use("/tenant", tenantRouter);
  app.use("/notifications", notificationsRouter);
  app.use("/admissions", admissionsRouter);
  app.use("/leaves", leavesRouter);
  app.use("/messages", messagesRouter);
  app.use("/status-videos", statusVideosRouter);
  app.use("/media", mediaRouter);

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", details: err.flatten() });
        return;
      }
      const status = (err as { status?: unknown } | null)?.status;
      if (typeof status === "number" && status >= 400 && status <= 599) {
        res.status(status).json({ error: (err as Error).message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  );

  return app;
}
