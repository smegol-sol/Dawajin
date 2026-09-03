import { batches, houses, type Database } from "@dawajin/db";
import { HttpError, type BatchStatus, type Breed } from "@dawajin/shared";
import { and, asc, desc, eq } from "drizzle-orm";

import type { Viewer } from "../lib/entityScope";

/**
 * **سردُ دفعات عنبرٍ واحد** — `GET /api/houses/:houseId/batches`.
 *
 * **وهو ما تقرأ منه شاشةُ المربّي عمرَ الدفعة ومقامَها** قبل أن يكتب سجلّه
 * اليوميّ (§14.1): `startDate` يومُ البدء، **و`receivedBirdCount` مقامُ كل
 * نسبة** (160 «عاشرًا» ١).
 */

/**
 * **ما يراه كلُّ دور من الدفعة — والمربّي أعمى عن المشترى.**
 *
 * **و`purchasedBirdCount` هو `allocated_quantity` مجمَّدًا لا رقمًا آخر** —
 * **مقيس في `chickShipmentService`**: صفُّ الدفعة يُنشأ بـ
 * `purchasedBirdCount: args.one.allocatedQuantity` حرفيًّا. **فعرضُه للمربّي
 * ينقض الاستلامَ الأعمى الذي بُني في القرار 276** — **يقرأ الرقمَ المتوقَّع
 * من مسارٍ آخر ثم «يعدّ» فيجده**، **والعدُّ الذي يعرف جوابَه ليس عدًّا**.
 *
 * **والحجبُ مطلقٌ لا مشروطٌ بالحالة — مرآةً لـ`toDistributionView` لا حكمًا
 * ثانيًا بجواره**: هناك `blind = role === "farmer"` بلا شرطِ حالة، **وشرطٌ
 * يُزاد هنا وحده يجعل للسؤال «متى يرى المربّي المشترى؟» جوابين يفترقان**.
 * **وتضييقُه إلى «قبل التأكيد وحده» قرارُ مالكٍ يُطلب، لا اجتهادُ مسارٍ
 * قارئ.**
 */
export interface BatchView {
  id: number;
  houseId: number;
  breed: Breed;
  status: BatchStatus;
  startDate: string | null;
  /** **المقامُ المؤكَّد** — يراه كلُّ دور، **وهو ما عدّه المربّي بنفسه**. */
  receivedBirdCount: number | null;
  closedAt: Date | null;
  soldBirdCount: number | null;
  marketAvgWeightG: number | null;
  housedBeforeReady: boolean;
  /** **يُحجب عن المربّي** — هو الرقم المتوقَّع الذي لا يراه (160 «ثانيًا»). */
  purchasedBirdCount?: number;
}

interface BatchRow extends Required<Omit<BatchView, "purchasedBirdCount">> {
  purchasedBirdCount: number;
}

/**
 * **يبني كائن الرد بيدٍ فيسقط المحجوب** — **ولا يُنشر الصفّ بـ`...`**: النشرُ
 * يُظهر ما لم يُقصد إظهاره كلّما أُضيف عمود (قاعدة حجب الحقل).
 */
function toBatchView(row: BatchRow, blind: boolean): BatchView {
  return {
    id: row.id,
    houseId: row.houseId,
    breed: row.breed,
    status: row.status,
    startDate: row.startDate,
    receivedBirdCount: row.receivedBirdCount,
    closedAt: row.closedAt,
    soldBirdCount: row.soldBirdCount,
    marketAvgWeightG: row.marketAvgWeightG,
    housedBeforeReady: row.housedBeforeReady,
    ...(blind ? {} : { purchasedBirdCount: row.purchasedBirdCount }),
  };
}

/**
 * **الوجودُ قبل التعيين** (المبدأ السادس) — **وهذا الرادُّ ليس تكرارًا لما في
 * الفرض المركزيّ، ويُقاس بمن يفلت منه:** `enforceEntityAccess` **يخرج مبكرًا
 * لصاحب الرؤية الكاملة قبل `assertHouseAssignment`** (القرار 194)، **فمالكٌ
 * يسأل عن عنبر مستأجرٍ آخر لا يفحصه أحدٌ قبل هذا السطر** — **ولولاه لعاد
 * بقائمةٍ فارغة تقول «لا دفعات» عن عنبرٍ ليس له**.
 */
async function assertHouseInTenant(db: Database, tenantId: number, houseId: number): Promise<void> {
  const [house] = await db
    .select({ id: houses.id })
    .from(houses)
    // `houseId` من `req.params` عبر zod، لا مشتقًّا من استعلام سابق — وهي
    // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, houseId), eq(houses.tenantId, tenantId)))
    .limit(1);
  if (!house) throw new HttpError(404, "not_found", "العنبر غير موجود");
}

/**
 * يسرد دفعات عنبرٍ واحد — **الأحدث أولًا**.
 *
 * **ولا فلترةَ إسنادٍ ثانيةً داخل العنبر، وذلك حكمٌ لا سهو:** قاعدةُ السرد
 * (#129) تطلب طبقتين **لأن الحاوي أوسعُ من المحتوى** — `GET
 * /farms/:farmId/houses` **يصل مزرعةً فيها عنابرُ ليست له**. **والدفعةُ نطاقُها
 * عنبرُها بعينه**: **فمن بلغ العنبر بلغ كلَّ دفعاته، ومن لم يبلغه رُدّ بـ403
 * قبل الخدمة**. **وفلترةٌ ثالثة هنا لا تحجب صفًّا واحدًا** — **فتكون حارسًا لا
 * يُسقطه إسقاط** (قاعدة الحارس وشاهده).
 *
 * @throws HttpError 404 عنبرٌ خارج المستأجر — **ويسبق كلَّ شيء** (المبدأ السادس)
 */
export async function listHouseBatches(
  db: Database,
  args: { tenantId: number; houseId: number; viewer: Viewer }
): Promise<BatchView[]> {
  await assertHouseInTenant(db, args.tenantId, args.houseId);

  const rows = await db
    .select({
      id: batches.id,
      houseId: batches.houseId,
      breed: batches.breed,
      status: batches.status,
      startDate: batches.startDate,
      receivedBirdCount: batches.receivedBirdCount,
      closedAt: batches.closedAt,
      soldBirdCount: batches.soldBirdCount,
      marketAvgWeightG: batches.marketAvgWeightG,
      housedBeforeReady: batches.housedBeforeReady,
      purchasedBirdCount: batches.purchasedBirdCount,
    })
    .from(batches)
    // `houseId` من `req.params` عبر zod لا مشتقًّا من استعلام سابق — وهي
    // النتيجة الإيجابية الكاذبة الوحيدة التي توثّقها القاعدة نفسها، والإسناد
    // مفروض مركزيًّا بنمط `/api/houses/:houseId` في `app.ts`
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(batches.tenantId, args.tenantId), eq(batches.houseId, args.houseId)))
    .orderBy(desc(batches.createdAt), asc(batches.id));

  const blind = args.viewer.role === "farmer";
  return rows.map((row) => toBatchView(row, blind));
}
