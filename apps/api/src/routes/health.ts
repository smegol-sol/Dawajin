import type { Database } from "@dawajin/db";
import { Router } from "express";

import type { Env } from "../lib/env";
import { checkDatabaseReady, getDatabaseHealth } from "../services/healthService";

/**
 * GET /health و GET /ready — مؤشر البيئة (backend-technical-spec.md §4.4).
 * يُرجع البيئة واسم القاعدة وآخر ترحيل، ويُستخدم لشريط علوي مرئي في غير
 * الإنتاج. المنطق الفعلي في services/healthService.ts (القرار #61).
 */
export function healthRouter(db: Database, env: Env): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    try {
      const { database, lastMigration } = await getDatabaseHealth(db);
      res.json({
        status: "ok",
        environment: env.NODE_ENV,
        database,
        lastMigration,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: "error",
        environment: env.NODE_ENV,
        message: "تعذّر الاتصال بقاعدة البيانات",
      });
    }
  });

  router.get("/ready", async (_req, res) => {
    const ready = await checkDatabaseReady(db);
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });

  return router;
}
