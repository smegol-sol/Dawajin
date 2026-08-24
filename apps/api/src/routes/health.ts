import { Router } from "express";
import { sql } from "drizzle-orm";
import type { Database } from "@dawajin/db";
import type { Env } from "../lib/env";

/**
 * GET /health و GET /ready — مؤشر البيئة (backend-technical-spec.md §4.4).
 * يُرجع البيئة واسم القاعدة وآخر ترحيل، ويُستخدم لشريط علوي مرئي في غير الإنتاج.
 */
export function healthRouter(db: Database, env: Env): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    try {
      const dbInfoResult = await db.execute(sql`select current_database() as db`);
      const dbInfo = dbInfoResult.rows[0] as { db?: string } | undefined;
      let lastMigration: string | null = null;
      try {
        const migrations = await db.execute(
          sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`
        );
        const row = migrations.rows[0] as { hash?: string; created_at?: string } | undefined;
        lastMigration = row
          ? `${row.hash?.slice(0, 12)} (${new Date(Number(row.created_at)).toISOString()})`
          : null;
      } catch {
        lastMigration = null; // لم تُطبَّق أي ترحيلات بعد
      }

      res.json({
        status: "ok",
        environment: env.NODE_ENV,
        database: dbInfo?.db ?? null,
        lastMigration,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: "error",
        environment: env.NODE_ENV,
        message: "تعذّر الاتصال بقاعدة البيانات",
      });
    }
  });

  router.get("/ready", async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });

  return router;
}
