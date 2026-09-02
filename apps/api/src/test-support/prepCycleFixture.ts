import { randomInt } from "node:crypto";

import {
  createDbClient,
  housePrepCycles,
  housePrepSteps,
  houseStatusHistory,
  houses,
  tenants,
  userAssignments,
  type Database,
} from "@dawajin/db";
import type { HouseStatus, PrepProtocol } from "@dawajin/shared";
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
  ownerId: number;
  supervisorToken: string;
  farmerToken: string;
  farmerId: number;
  vetToken: string;
  vetId: number;
  /** مربٍّ مُسنَدٌ لعنبرٍ آخر في نفس المزرعة — «لا يُسند مربّي عنبرٍ آخر» */
  otherFarmerId: number;
  otherHouseId: number;
  ownerBToken: string;
  houseInTenantBId: number;
}

/** فاعلان إضافيان — **استُخرجا لحدّ أسطر الدالّة وحده.** */
async function seedExtraActors(
  db: Database,
  secret: string,
  tenantAId: number,
  tenantBId: number
): Promise<{ otherFarmer: { id: number }; ownerB: { id: number; token: string } }> {
  const otherFarmer = await seedUser(db, { tenantId: tenantAId, role: "farmer", secret });
  const ownerB = await seedUser(db, { tenantId: tenantBId, role: "owner", secret });
  return { otherFarmer, ownerB };
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
  const { otherFarmer, ownerB } = await seedExtraActors(db, env.JWT_SECRET, tenantAId, tenantBId);

  const siteAId = await siteVia(app, owner.token, `موقع ${label} ${S}`);
  const farmAId = await farmVia(app, owner.token, siteAId, `مزرعة ${label} ${S}`);
  const subjectId = await houseVia(app, owner.token, farmAId, `عنبر ${label} ${S}`);
  const otherHouseId = await houseVia(app, owner.token, farmAId, `عنبر آخر ${label} ${S}`);
  // المشرف بمزرعته والمربّي بالعنبر — الفرض المركزي يرفض غير المُسند قبل الخدمة
  await db.insert(userAssignments).values([
    { tenantId: tenantAId, userId: supervisor.id, farmId: farmAId, startDate: today() },
    { tenantId: tenantAId, userId: farmer.id, houseId: subjectId, startDate: today() },
    { tenantId: tenantAId, userId: otherFarmer.id, houseId: otherHouseId, startDate: today() },
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
    ownerId: owner.id,
    supervisorToken: supervisor.token,
    farmerToken: farmer.token,
    farmerId: farmer.id,
    vetToken: vet.token,
    vetId: vet.id,
    otherFarmerId: otherFarmer.id,
    otherHouseId,
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

/** الاعتماد عبر مساره — **ومُطلِقُ الانتقال** (القرار 239). */
export function approveVia(f: PrepFixture, stepId: number, token: string): request.Test {
  return request(f.app)
    .patch(`/api/prep-steps/${String(stepId)}/approve`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
}

/** الإسناد عبر مساره — **لا كتابةَ `assigned_to` في القاعدة** (القرار 237). */
export function assignVia(
  f: PrepFixture,
  stepId: number,
  token: string,
  body: Record<string, unknown>
): request.Test {
  return request(f.app)
    .patch(`/api/prep-steps/${String(stepId)}/assign`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
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

/**
 * يُكمل **ويعتمد** كل الإلزاميات إلا `leave` منها — **فيقف على حافة الانتقال**.
 *
 * **والمُكمِل غير المعتمِد حتمًا** (`approved_by <> completed_by`): المشرف
 * يُكمل والمالك يعتمد.
 */
export async function approveAllRequiredBut(
  f: PrepFixture,
  steps: FixtureStep[],
  leave: number
): Promise<void> {
  const required = steps.filter((s) => s.isRequired);
  for (const step of required.slice(0, required.length - leave)) {
    const done = await completeVia(f, step.id, f.supervisorToken);
    if (done.status !== 200) {
      throw new Error(`تعذّر إكمال خطوة التجهيزة: ${String(done.status)}`);
    }
    const ok = await approveVia(f, step.id, f.ownerToken);
    if (ok.status !== 200) {
      throw new Error(`تعذّر اعتماد خطوة التجهيزة: ${String(ok.status)}`);
    }
  }
}

/**
 * دورةٌ مباشرةً في القاعدة — **لاختبارات حارس الراحة** التي تحتاج ضبط
 * `rest_started_at` بدقّة. **و`startedDaysAgo === null` يعني دورةً لم تبدأ
 * راحتُها بعد** (حالة `rest_not_started`، القرار 242).
 */
export async function openCycleRow(
  db: Database,
  args: { tenantId: number; houseId: number; restTargetDays: number; startedDaysAgo: number | null }
): Promise<number> {
  const [row] = await db
    .insert(housePrepCycles)
    .values({
      tenantId: args.tenantId,
      houseId: args.houseId,
      restTargetDays: args.restTargetDays,
      restStartedAt:
        args.startedDaysAgo === null
          ? null
          : sql`now() - make_interval(days => CAST(${args.startedDaysAgo} AS integer))`,
    })
    .returning({ id: housePrepCycles.id });
  if (!row) throw new Error("تعذّر إنشاء دورة التجهيز في التجهيزة");
  return row.id;
}

/**
 * يُشغّل عملًا ببروتوكول مستأجرٍ مؤقّت ثم يُعيده إلى `null` — **مشتركٌ
 * يُستورد ولا يُنسخ** بين ملفَّي اختبار التجهيز.
 *
 * **والإعادة في `finally`**: بروتوكولٌ يبقى مكتوبًا يسرّب نفسه إلى كل اختبارٍ
 * بعده في نفس الملف، **فيخضرّ أو يحمرّ لسببٍ ليس فيه**.
 */
export async function withProtocol<T>(
  f: PrepFixture,
  protocol: PrepProtocol,
  work: () => Promise<T>
): Promise<T> {
  await f.db.update(tenants).set({ prepProtocol: protocol }).where(eq(tenants.id, f.tenantAId));
  try {
    return await work();
  } finally {
    await f.db.update(tenants).set({ prepProtocol: null }).where(eq(tenants.id, f.tenantAId));
  }
}
