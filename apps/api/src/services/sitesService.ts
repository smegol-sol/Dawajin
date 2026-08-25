import { entityAuditLog, sites, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { and, asc, eq } from "drizzle-orm";

import { writeAuditLog } from "../lib/auditLog";

/**
 * طبقة services للمواقع الجغرافية — المستوى الأعلى في الهرم
 * (الموقع ← المزرعة ← العنبر، القرار #112). كل استعلام Drizzle هنا لا في
 * routes/sites.ts (القرار #61).
 *
 * **`tenantId` يأتي من الـJWT حصرًا** ويُمرَّر من طبقة المسار — لا يُقرأ من
 * جسم الطلب أبدًا (المبدأ السابع: عزل مطلق).
 */

export interface Site {
  id: number;
  name: string;
}

/**
 * يسرد مواقع المستأجر مرتّبة بالاسم.
 * @returns قائمة قد تكون فارغة — لا خطأ: «لا مواقع بعد» حالة مشروعة
 */
export async function listSites(db: Database, tenantId: number): Promise<Site[]> {
  return db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .where(eq(sites.tenantId, tenantId))
    .orderBy(asc(sites.name));
}

/**
 * يقرأ موقعًا واحدًا داخل مستأجره.
 * @throws HttpError 404 إن لم يوجد **أو كان لمستأجر آخر** — الوجود ثم التعيين
 *   (المبدأ السادس): موقع مستأجر آخر يجب أن يبدو غير موجود، لا ممنوعًا،
 *   وإلا صار الرد أداة تعداد لمواقع الآخرين
 */
export async function getSite(db: Database, tenantId: number, siteId: number): Promise<Site> {
  const [site] = await db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .limit(1);
  if (!site) throw new HttpError(404, "not_found", "الموقع غير موجود");
  return site;
}

/**
 * ينشئ موقعًا جديدًا مع كتابة تدقيق في نفس المعاملة (المبدأ الثاني).
 * @throws HttpError 409 إن تكرّر الاسم داخل المستأجر
 */
export async function createSite(
  db: Database,
  tenantId: number,
  actorId: number,
  name: string
): Promise<Site> {
  return db.transaction(async (tx) => {
    await assertNameFree(tx, tenantId, name, null);

    const [created] = await tx.insert(sites).values({ tenantId, name }).returning({
      id: sites.id,
      name: sites.name,
    });
    if (!created) throw new HttpError(500, "internal_error", "تعذّر إنشاء الموقع");

    await writeAuditLog(tx, entityAuditLog, {
      tenantId,
      actorId,
      entityType: "site",
      entityId: String(created.id),
      action: "create",
      after: created,
    });
    return created;
  });
}

/** معاملات إعادة التسمية — مجمّعة لأن أربعة منها تتجاوز حدّ المعاملات. */
export interface RenameSiteInput {
  tenantId: number;
  actorId: number;
  siteId: number;
  name: string;
}

/**
 * يعيد تسمية موقع. **الاسم وحده قابل للتعديل** — لا شيء آخر في الموقع.
 * @throws HttpError 404 إن لم يوجد داخل المستأجر · 409 إن تكرّر الاسم
 */
export async function renameSite(db: Database, input: RenameSiteInput): Promise<Site> {
  const { tenantId, actorId, siteId, name } = input;
  return db.transaction(async (tx) => {
    // إعادة قراءة الحارس **تحت المعاملة** لا قبلها (المبدأ الثاني)
    const [before] = await tx
      .select({ id: sites.id, name: sites.name })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1);
    if (!before) throw new HttpError(404, "not_found", "الموقع غير موجود");

    await assertNameFree(tx, tenantId, name, siteId);

    const [after] = await tx
      .update(sites)
      .set({ name })
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .returning({ id: sites.id, name: sites.name });
    if (!after) throw new HttpError(500, "internal_error", "تعذّر تحديث الموقع");

    await writeAuditLog(tx, entityAuditLog, {
      tenantId,
      actorId,
      entityType: "site",
      entityId: String(siteId),
      action: "rename",
      before,
      after,
    });
    return after;
  });
}

/**
 * يمنع تكرار الاسم داخل المستأجر برسالة مفهومة قبل أن يصطدم الطلب بالفهرس
 * الفريد. الفهرس يبقى الحارس الأخير — هذا الفحص لأجل الرسالة لا لأجل الأمان،
 * ولذلك يجري **تحت المعاملة** حيث يقع الإدراج.
 * @param exceptId موقع يُستثنى من الفحص (إعادة التسمية إلى الاسم نفسه)
 */
async function assertNameFree(
  tx: Pick<Database, "select">,
  tenantId: number,
  name: string,
  exceptId: number | null
): Promise<void> {
  const rows = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.tenantId, tenantId), eq(sites.name, name)))
    .limit(2);
  if (rows.some((r) => r.id !== exceptId)) {
    throw new HttpError(409, "duplicate_name", "يوجد موقع بهذا الاسم");
  }
}
