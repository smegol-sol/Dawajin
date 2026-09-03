import {
  chickShipmentDistributions,
  chickShipments,
  farms,
  houses,
  type Database,
} from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { and, count, eq } from "drizzle-orm";

import type { ChickShipmentSummary } from "./chickShipmentService";
import { visibleFarmCondition, visibleHouseCondition, type Viewer } from "../lib/entityScope";

/**
 * **قراءةُ شحنةٍ بتوزيعاتها — والاستلام الأعمى يُفرض في الرد** (القرار 160
 * «ثانيًا»، والتنفيذ 276).
 *
 * **ومفصولٌ عن `chickShipmentService` لأن الحدَّ يُحترم بالفصل لا برفعه**،
 * **والفصلُ عند حدٍّ معنويّ**: ذاك يكتب ويسرد ملخّصات، وهذا **يقرأ صفًّا
 * ويحجب منه**.
 */

/** ما يراه كلُّ دور من التوزيعة — **والمربّي أعمى عن رقم المشرف**. */
export interface DistributionView {
  distributionId: number;
  houseId: number;
  batchId: number;
  confirmed: boolean;
  countedQuantity: number | null;
  deadOnArrival: number | null;
  /** **يُحجب عن المربّي** — هو الرقم المتوقَّع الذي لا يراه (160 «ثانيًا»). */
  allocatedQuantity?: number;
  /** **ويُحجب معه** — الفرقُ يكشف المحجوب بطرحه من المعدود. */
  variance?: number | null;
  varianceStatus?: string | null;
}

export interface ChickShipmentDetail extends ChickShipmentSummary {
  distributions: DistributionView[];
}

/**
 * **يقرأ شحنةً بتوزيعاتها — مفلترةً بما يبلغه الرائي** (القاعدة #129).
 *
 * **والفلترةُ بالشرطين مقترنَين لا بأحدهما** (القرار #131): شرطُ العنبر
 * **تكملةٌ لشرط المزرعة لا بديلٌ عنه** — واستعمالُه منفردًا يجعل المشرف يرى
 * كل عنابر المستأجر.
 *
 * **و403 لا قائمةٌ فارغة** لشحنةٍ لا يبلغ الرائي أيًّا من توزيعاتها:
 * **الفارغة تقول «لا حصص هنا» وهي كذبة عن شحنةٍ وُزّعت على عنابر ليست له.**
 *
 * ## والاستلام الأعمى يُفرض هنا — بحجب حقلين لا حقلٍ واحد
 *
 * **`allocated_quantity` هو الرقم المتوقَّع** الذي لا يراه المربّي (160
 * «ثانيًا»). **و`variance` يُحجب معه لأنه يكشفه بطرحه من المعدود** —
 * **وحجبُ أحدهما دون الآخر إخفاءٌ صوريّ**.
 *
 * @returns الشحنة وتوزيعاتها المرئية للرائي
 * @throws HttpError 404 شحنةٌ خارج المستأجر · 403 لا يبلغ الرائي شيئًا منها
 */
export async function readChickShipment(
  db: Database,
  args: { tenantId: number; shipmentId: number; viewer: Viewer }
): Promise<ChickShipmentDetail> {
  const [shipment] = await db
    .select({
      shipmentId: chickShipments.id,
      breed: chickShipments.breed,
      supplierId: chickShipments.supplierId,
      carrierId: chickShipments.carrierId,
      purchasedQuantity: chickShipments.purchasedQuantity,
      approvedAt: chickShipments.approvedAt,
    })
    .from(chickShipments)
    .where(and(eq(chickShipments.id, args.shipmentId), eq(chickShipments.tenantId, args.tenantId)))
    .limit(1);
  if (!shipment) throw new HttpError(404, "not_found", "شحنة الكتاكيت غير موجودة");

  const rows = await visibleDistributions(db, args);
  const blind = args.viewer.role === "farmer";
  return {
    shipmentId: shipment.shipmentId,
    breed: shipment.breed,
    supplierId: shipment.supplierId,
    carrierId: shipment.carrierId,
    purchasedQuantity: shipment.purchasedQuantity,
    approved: shipment.approvedAt !== null,
    distributionCount: rows.length,
    distributions: rows.map((row) => toDistributionView(row, blind)),
  };
}

interface DistributionRow {
  distributionId: number;
  houseId: number;
  batchId: number;
  allocatedQuantity: number;
  countedQuantity: number | null;
  deadOnArrival: number | null;
  variance: number | null;
  varianceStatus: string | null;
  confirmedAt: Date | null;
}

/**
 * **يبني كائن الرد بيدٍ فتسقط الحقول المحجوبة** — **ولا يُنشر الصفّ بـ`...`**:
 * النشرُ يُظهر ما لم يُقصد إظهاره كلّما أُضيف عمود (قاعدة حجب الحقل).
 */
function toDistributionView(row: DistributionRow, blind: boolean): DistributionView {
  return {
    distributionId: row.distributionId,
    houseId: row.houseId,
    batchId: row.batchId,
    confirmed: row.confirmedAt !== null,
    countedQuantity: row.countedQuantity,
    deadOnArrival: row.deadOnArrival,
    ...(blind
      ? {}
      : {
          allocatedQuantity: row.allocatedQuantity,
          variance: row.variance,
          varianceStatus: row.varianceStatus,
        }),
  };
}

/**
 * **التوزيعات التي يبلغها الرائي** — **و403 لا قائمةٌ فارغة** حين تكون للشحنة
 * توزيعاتٌ لا يبلغ منها شيئًا (#129).
 */
async function visibleDistributions(
  db: Database,
  args: { tenantId: number; shipmentId: number; viewer: Viewer }
): Promise<DistributionRow[]> {
  const rows = await db
    .select({
      distributionId: chickShipmentDistributions.id,
      houseId: chickShipmentDistributions.houseId,
      batchId: chickShipmentDistributions.batchId,
      allocatedQuantity: chickShipmentDistributions.allocatedQuantity,
      countedQuantity: chickShipmentDistributions.countedQuantity,
      deadOnArrival: chickShipmentDistributions.deadOnArrival,
      variance: chickShipmentDistributions.variance,
      varianceStatus: chickShipmentDistributions.varianceStatus,
      confirmedAt: chickShipmentDistributions.confirmedAt,
    })
    .from(chickShipmentDistributions)
    .innerJoin(
      houses,
      and(
        // ربطُ الجدولين لا اشتقاقُ عنبرٍ من استعلامٍ سابق — والفلترة أدناه
        // بشرطَي الرؤية المقترنَين (القرار #131)
        // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
        eq(houses.id, chickShipmentDistributions.houseId),
        eq(houses.tenantId, chickShipmentDistributions.tenantId)
      )
    )
    .innerJoin(farms, and(eq(farms.id, houses.farmId), eq(farms.tenantId, houses.tenantId)))
    .where(
      and(
        eq(chickShipmentDistributions.shipmentId, args.shipmentId),
        eq(chickShipmentDistributions.tenantId, args.tenantId),
        visibleFarmCondition(args.viewer),
        visibleHouseCondition(args.viewer)
      )
    )
    .orderBy(chickShipmentDistributions.id);

  const [total] = await db
    .select({ n: count(chickShipmentDistributions.id) })
    .from(chickShipmentDistributions)
    .where(
      and(
        eq(chickShipmentDistributions.shipmentId, args.shipmentId),
        eq(chickShipmentDistributions.tenantId, args.tenantId)
      )
    );

  // **شحنةٌ وُزّعت ولا يبلغ الرائي شيئًا منها ← 403 لا فارغة** (#129)
  if (rows.length === 0 && (total?.n ?? 0) > 0) {
    throw new HttpError(403, "forbidden", "لا يبلغك شيء من توزيعات هذه الشحنة");
  }
  return rows;
}
