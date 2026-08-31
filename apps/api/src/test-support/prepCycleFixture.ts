import { randomInt } from "node:crypto";

import {
  createDbClient,
  housePrepCycles,
  housePrepSteps,
  houseStatusHistory,
  houses,
  userAssignments,
  type Database,
} from "@dawajin/db";
import type { HouseStatus } from "@dawajin/shared";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";

import { createApp } from "../app";
import { farmVia, houseVia, seedTenant, seedUser, siteVia, today } from "./hierarchy";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";
import { openPrepCycle } from "../services/prepCycleService";

/**
 * تجهيزة دورة التجهيز — مشتركة بين ملفَي اختبارها (القرار 221): هرمٌ كامل
 * بمستأجرين وأدوار أربعة وإسنادَين، وعنبرٌ موضوعُ الاختبار على «تحت التنظيف
 * والتطهير». لا تُحتسب في التغطية (لاحقة `test-support/`).
 */

export interface PrepFixture {
  db: Database;
  pool: ReturnType<typeof createDbClient>["pool"];
  app: ReturnType<typeof createApp>;
  tenantAId: number;
  farmAId: number;
  subjectId: number;
  ownerToken: string;
  supervisorToken: string;
  farmerToken: string;
  farmerId: number;
  vetToken: string;
  ownerBToken: string;
  houseInTenantBId: number;
}

export async function initPrepFixture(label: string): Promise<PrepFixture> {
  const S = randomInt(100000, 999999).toString();
  const env = loadEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  const { db, pool } = client;
  await assertIsTestDatabase(db);
  const app = createApp(db, env, pino({ level: "silent" }));

  const tenantAId = await seedTenant(db, `${label} أ ${S}`);
  const tenantBId = await seedTenant(db, `${label} ب ${S}`);
  const owner = await seedUser(db, { tenantId: tenantAId, role: "owner", secret: env.JWT_SECRET });
  const supervisor = await seedUser(db, {
    tenantId: tenantAId,
    role: "supervisor",
    secret: env.JWT_SECRET,
  });
  const farmer = await seedUser(db, {
    tenantId: tenantAId,
    role: "farmer",
    secret: env.JWT_SECRET,
  });
  const vet = await seedUser(db, { tenantId: tenantAId, role: "vet", secret: env.JWT_SECRET });
  const ownerB = await seedUser(db, { tenantId: tenantBId, role: "owner", secret: env.JWT_SECRET });

  const siteAId = await siteVia(app, owner.token, `موقع ${label} ${S}`);
  const farmAId = await farmVia(app, owner.token, siteAId, `مزرعة ${label} ${S}`);
  const subjectId = await houseVia(app, owner.token, farmAId, `عنبر ${label} ${S}`);
  // المشرف بمزرعته والمربّي بالعنبر — الفرض المركزي يرفض غير المُسند قبل الخدمة
  await db.insert(userAssignments).values([
    { tenantId: tenantAId, userId: supervisor.id, farmId: farmAId, startDate: today() },
    { tenantId: tenantAId, userId: farmer.id, houseId: subjectId, startDate: today() },
  ]);

  const siteBId = await siteVia(app, ownerB.token, `موقع ${label} ب ${S}`);
  const farmBId = await farmVia(app, ownerB.token, siteBId, `مزرعة ${label} ب ${S}`);
  const houseInTenantBId = await houseVia(app, ownerB.token, farmBId, `عنبر ${label} ب ${S}`);

  return {
    db,
    pool,
    app,
    tenantAId,
    farmAId,
    subjectId,
    ownerToken: owner.token,
    supervisorToken: supervisor.token,
    farmerToken: farmer.token,
    farmerId: farmer.id,
    vetToken: vet.token,
    ownerBToken: ownerB.token,
    houseInTenantBId,
  };
}

export async function setStatus(f: PrepFixture, id: number, status: HouseStatus): Promise<void> {
  await f.db.update(houses).set({ status }).where(eq(houses.id, id));
}

export async function statusOf(f: PrepFixture, id: number): Promise<HouseStatus> {
  const [row] = await f.db.select({ status: houses.status }).from(houses).where(eq(houses.id, id));
  if (!row) throw new Error("العنبر غير موجود في التجهيزة");
  return row.status;
}

export async function historyCount(f: PrepFixture, id: number): Promise<number> {
  const [row] = await f.db
    .select({ count: sql<number>`count(*)::int` })
    .from(houseStatusHistory)
    .where(eq(houseStatusHistory.houseId, id));
  return row?.count ?? 0;
}

export async function resetHouse(f: PrepFixture, id: number): Promise<void> {
  await f.db.delete(houseStatusHistory).where(eq(houseStatusHistory.houseId, id));
  // الخطوات قبل دورتها — المفتاح المركَّب يمنع العكس
  await f.db.execute(sql`
    DELETE FROM house_prep_steps
    WHERE cycle_id IN (SELECT id FROM house_prep_cycles WHERE house_id = ${id})
  `);
  await f.db.delete(housePrepCycles).where(eq(housePrepCycles.houseId, id));
  await setStatus(f, id, "تحت التنظيف والتطهير");
}

export interface FixtureStep {
  id: number;
  stepKey: string;
  isRequired: boolean;
  completedAt: Date | null;
  completedBy: number | null;
}

/** خطوات الدورة بترتيبها — من القاعدة لا من الرد. */
export async function stepsOf(f: PrepFixture, cycleId: number): Promise<FixtureStep[]> {
  return f.db
    .select({
      id: housePrepSteps.id,
      stepKey: housePrepSteps.stepKey,
      isRequired: housePrepSteps.isRequired,
      completedAt: housePrepSteps.completedAt,
      completedBy: housePrepSteps.completedBy,
    })
    .from(housePrepSteps)
    .where(eq(housePrepSteps.cycleId, cycleId))
    .orderBy(housePrepSteps.stepOrder);
}

export function completeVia(f: PrepFixture, stepId: number, token: string): request.Test {
  return request(f.app)
    .patch(`/api/prep-steps/${String(stepId)}/complete`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
}

export function getCycleVia(f: PrepFixture, houseId: number, token: string): request.Test {
  return request(f.app)
    .get(`/api/houses/${String(houseId)}/prep-cycle`)
    .set("Authorization", `Bearer ${token}`);
}

/** يفتح دورة عبر الدالة المشتركة ويُرجع معرّفها وخطواتها. */
export async function openCycleForSubject(
  f: PrepFixture
): Promise<{ cycleId: number; steps: FixtureStep[] }> {
  const { cycleId } = await openPrepCycle(f.db, { tenantId: f.tenantAId, houseId: f.subjectId });
  return { cycleId, steps: await stepsOf(f, cycleId) };
}

/** يُكمل كل الخطوات الإلزامية إلا `leave` الأخيرة — بالمشرف. */
export async function completeAllRequiredBut(
  f: PrepFixture,
  steps: FixtureStep[],
  leave: number
): Promise<void> {
  const required = steps.filter((s) => s.isRequired);
  for (const step of required.slice(0, required.length - leave)) {
    const res = await completeVia(f, step.id, f.supervisorToken);
    if (res.status !== 200) {
      throw new Error(`تعذّر إكمال خطوة التجهيزة: ${String(res.status)}`);
    }
  }
}
