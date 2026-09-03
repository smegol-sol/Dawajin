import {
  batches,
  dailyLogFeedRows,
  dailyLogs,
  houses,
  inventoryMovements,
  products,
  warehouses,
  type Database,
} from "@dawajin/db";
import { HttpError, type FeedStage, type MortalityCause } from "@dawajin/shared";
import { and, eq, isNull } from "drizzle-orm";

import { computeBalance } from "../lib/inventoryBalance";

/**
 * السجل اليومي — **`POST /api/daily-logs`** (§14.1، والتنفيذ 278).
 *
 * > قفل العنبر → التحقق من الدفعة النشطة → تحقق التكرار داخل المعاملة
 * > (والفهرس كشبكة أمان) → **[معاملة] السجل + صفوف العلف + حركات المخزون**
 * > → تنبيه معقولية عند الانحراف (لا يمنع) → مكرر ← يُعاد السجل الموجود بـ200.
 *
 * ## والخصمُ من السجلّ نفسه لا بحركةٍ مستقلة
 *
 * **§13.2 يسمّيه:** «السجل اليومي | **استهلاك يومي (−) لكل صف علف**» —
 * **في نفس المعاملة**، فلا سجلٌّ بلا خصم ولا خصمٌ بلا سجلّ.
 *
 * ## ولا يُمنع على رصيدٍ غير كافٍ — وهو حكمٌ لا سهو
 *
 * **§13.4:** «**لا يُمنع الاستهلاك اليومي** ولا تنفيذ العلاج — تنبيه فقط ·
 * رصيد سالب ← تنبيه فوري للمالك». **وهو المبدأ الخامس بعينه**: الطير أكل
 * فعلًا، **ومنعُ التسجيل لا يُرجع العلف بل يمحو الواقعة**.
 *
 * **وحدٌّ معلن (القرار 278، وقاعدة 268):** **لا كاتبَ لـ`notifications` في
 * الإنتاج إطلاقًا** — **فالرصيد السالب واقعةٌ صامتة حتى يُبنى أوّلُ كاتبِ
 * إشعار**، **وعندها يسقط هذا الحدّ**. **والمسار يكتبها في الرد ولا يُخفيها**
 * (`negativeBalances`).
 *
 * ## وتفريغ الكيس ليس هنا
 *
 * **حركةٌ واحدة لا حركتان** (القرار 278 على 212): **«حركتان في معاملة واحدة»
 * في 212 §٤ تصف فعل التفريغ لا السجلَّ اليوميّ** — **والاستهلاك تقديرٌ كسريّ
 * والتفريغ واقعةٌ صحيحة**، **و٢٫٥ كيس لا تُنتج عددًا صحيحًا من الفوارغ بأي
 * حساب**.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface FeedRowInput {
  productId: number;
  feedStage: FeedStage;
  bags: number;
}

export interface CreateDailyLogInput {
  tenantId: number;
  actorId: number;
  houseId: number;
  logDate: string;
  mortalityCount: number;
  mortalityCause?: MortalityCause | undefined;
  mortalityCauseNote?: string | undefined;
  waterTanks?: number | undefined;
  sampledBirds?: number | undefined;
  sampledWeightKg?: number | undefined;
  temperatureC?: number | undefined;
  humidityPct?: number | undefined;
  notes?: string | undefined;
  clientId?: string | undefined;
  feedRows: readonly FeedRowInput[];
}

export interface DailyLogResult {
  dailyLogId: number;
  batchId: number;
  logDate: string;
  /** **صحيحٌ حين أُعيد سجلٌّ سابق بنفس `client_id`** — والمسار يردّ 200 لا 201. */
  duplicate: boolean;
  waterLiters: number | null;
  avgWeightG: number | null;
  feedKgTotal: number;
  /** **أرصدةٌ سالبة بعد الخصم — تُعرض ولا تمنع** (§13.4). */
  negativeBalances: { productId: number; balance: number }[];
}

/**
 * **يقفل العنبر ثم يقرأ دفعته النشطة تحته** (المبدأ الثاني).
 *
 * **و«قيد الوصول» ليست نشطة**: عنبرٌ وصلته طيورٌ ولم يؤكّدها المربّي **لا
 * دفعةَ فيه بعد** — **وتسجيلُ يومٍ عليها يسبق بدايتها**.
 *
 * @throws HttpError 404 العنبر غير موجود · 422 لا دفعة نشطة
 */
async function lockHouseAndReadBatch(
  tx: Tx,
  args: { tenantId: number; houseId: number }
): Promise<{ batchId: number; tankCapacityL: string | null }> {
  const [house] = await tx
    .select({ id: houses.id, tankCapacityL: houses.waterTankCapacityL })
    .from(houses)
    // العنبر حلّه الفرض المركزي من جسم الطلب — نفس تعليل `prepCycleService`
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(houses.id, args.houseId), eq(houses.tenantId, args.tenantId)))
    .for("update")
    .limit(1);
  if (!house) throw new HttpError(404, "not_found", "العنبر غير موجود");

  const [batch] = await tx
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
        eq(batches.houseId, args.houseId),
        eq(batches.tenantId, args.tenantId),
        eq(batches.status, "نشطة")
      )
    )
    .limit(1);
  if (!batch) {
    throw new HttpError(
      422,
      "no_active_batch",
      "لا دفعة نشطة في هذا العنبر — والسجل اليومي يقع على دفعةٍ بدأت"
    );
  }
  return { batchId: batch.id, tankCapacityL: house.tankCapacityL };
}

/** **مخزن العنبر — يُنشأ معه تلقائيًّا** (القرار 224)، فغيابه عطبُ بيانات. */
async function houseWarehouseId(
  tx: Tx,
  args: { tenantId: number; houseId: number }
): Promise<number> {
  const [warehouse] = await tx
    .select({ id: warehouses.id })
    .from(warehouses)
    // eslint-disable-next-line dawajin/no-unvetted-house-id-reuse
    .where(and(eq(warehouses.houseId, args.houseId), eq(warehouses.tenantId, args.tenantId)))
    .limit(1);
  if (!warehouse) throw new HttpError(500, "internal_error", "مخزن العنبر غير موجود");
  return warehouse.id;
}

/**
 * **وزنُ الكيس يُقرأ من `products.package_size` ويُجمَّد في الصفّ** (القرار
 * 201) — **فسجلٌّ قديم يبقى محسوبًا بما كان لا بما صار**.
 *
 * @throws HttpError 404 صنفٌ غير موجود · 422 ليس علفًا بالكيس
 */
async function readFeedProduct(
  tx: Tx,
  args: { tenantId: number; productId: number }
): Promise<{ bagWeightKg: number }> {
  const [product] = await tx
    .select({
      category: products.category,
      stockUnit: products.stockUnit,
      packageSize: products.packageSize,
    })
    .from(products)
    .where(and(eq(products.id, args.productId), eq(products.tenantId, args.tenantId)))
    .limit(1);
  if (!product) throw new HttpError(404, "not_found", "الصنف غير موجود");
  if (product.category !== "علف" || product.stockUnit !== "كيس") {
    throw new HttpError(422, "product_not_feed", "صفُّ العلف لا يقبل إلا صنف علفٍ وحدته «كيس»", {
      productId: args.productId,
      category: product.category,
    });
  }
  if (product.packageSize === null) {
    throw new HttpError(422, "product_missing_package_size", "صنف العلف بلا حجم عبوة");
  }
  return { bagWeightKg: Number(product.packageSize) };
}

/** **متوسط الوزن — الحقلان معًا أو لا شيء** (§15)، فلا قسمةَ على العدم. */
function computeAvgWeightG(sampledBirds?: number, sampledWeightKg?: number): number | null {
  if (sampledBirds === undefined && sampledWeightKg === undefined) return null;
  if (sampledBirds === undefined || sampledWeightKg === undefined || sampledBirds <= 0) {
    throw new HttpError(
      422,
      "sample_pair_required",
      "عيّنة الوزن رقمان معًا: عدد الطيور المسحوبة ووزنها — وأحدهما بلا الآخر لا يُحسب"
    );
  }
  return (sampledWeightKg / sampledBirds) * 1000;
}

/** **لترات الماء — بسعة الخزان وقت الإدخال، مجمَّدةً في الصفّ** (نمط 201). */
function computeWaterLiters(tankCapacityL: string | null, waterTanks?: number): number | null {
  if (waterTanks === undefined) return null;
  if (tankCapacityL === null) {
    throw new HttpError(
      422,
      "house_without_tank_capacity",
      "العنبر بلا سعة خزان — فحقل الماء مخفيّ فيه ولا يُسجَّل"
    );
  }
  return waterTanks * Number(tankCapacityL);
}

export {
  lockHouseAndReadBatch,
  houseWarehouseId,
  readFeedProduct,
  computeAvgWeightG,
  computeWaterLiters,
};

/** **سجلٌّ سابق بنفس معرّف العميل** — عطالةُ إعادة الإرسال. */
async function findByClientId(
  exec: Tx | Database,
  args: { tenantId: number; clientId: string }
): Promise<DailyLogResult | undefined> {
  const [row] = await exec
    .select({
      dailyLogId: dailyLogs.id,
      batchId: dailyLogs.batchId,
      logDate: dailyLogs.logDate,
      waterLiters: dailyLogs.waterLiters,
      avgWeightG: dailyLogs.avgWeightG,
    })
    .from(dailyLogs)
    .where(and(eq(dailyLogs.tenantId, args.tenantId), eq(dailyLogs.clientId, args.clientId)))
    .limit(1);
  if (!row) return undefined;
  return {
    dailyLogId: row.dailyLogId,
    batchId: row.batchId,
    logDate: row.logDate,
    duplicate: true,
    waterLiters: row.waterLiters === null ? null : Number(row.waterLiters),
    avgWeightG: row.avgWeightG === null ? null : Number(row.avgWeightG),
    feedKgTotal: 0,
    negativeBalances: [],
  };
}

/**
 * **سجلٌّ واحد لكل دفعة ويوم** — **والفهرس الجزئي `daily_logs_batch_date_uq`
 * حارسٌ أخير خلفه** (نمط #119)، **ورمزُ الاثنين واحد**.
 *
 * @throws HttpError 409 يوجد سجلٌّ محفوظ لهذا اليوم
 */
async function assertNoLogForDay(
  tx: Tx,
  args: { tenantId: number; batchId: number; logDate: string }
): Promise<void> {
  const [existing] = await tx
    .select({ id: dailyLogs.id })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.tenantId, args.tenantId),
        eq(dailyLogs.batchId, args.batchId),
        eq(dailyLogs.logDate, args.logDate),
        isNull(dailyLogs.correctionOfId)
      )
    )
    .limit(1);
  if (existing) {
    throw new HttpError(409, "duplicate", "يوجد سجل محفوظ لهذا اليوم بالفعل", {
      dailyLogId: existing.id,
    });
  }
}

interface FeedWriteArgs {
  tenantId: number;
  actorId: number;
  houseId: number;
  batchId: number;
  logId: number;
  logUuid: string;
  feedRows: readonly FeedRowInput[];
}

/**
 * **صفوفُ العلف وحركاتُها — في نفس معاملة السجلّ** (§13.2 و§14.1).
 *
 * **والكمية بالأكياس لا بالكيلوغرامات**: الدفتر يعنون `(مخزن · صنف)` بوحدة
 * الصنف، **و`kg` حقلٌ محسوب على الصفّ للمعادلات لا للرصيد**.
 *
 * @returns مجموعُ الكيلوغرامات والأرصدةُ السالبة بعد الخصم
 */
async function writeFeedAndMovements(
  tx: Tx,
  args: FeedWriteArgs
): Promise<{ feedKgTotal: number; negativeBalances: { productId: number; balance: number }[] }> {
  const warehouseId = await houseWarehouseId(tx, args);
  let feedKgTotal = 0;
  const negativeBalances: { productId: number; balance: number }[] = [];

  for (const row of args.feedRows) {
    const { bagWeightKg } = await readFeedProduct(tx, {
      tenantId: args.tenantId,
      productId: row.productId,
    });
    const kg = row.bags * bagWeightKg;
    feedKgTotal += kg;

    await tx.insert(dailyLogFeedRows).values({
      tenantId: args.tenantId,
      dailyLogId: args.logId,
      productId: row.productId,
      feedStage: row.feedStage,
      bags: row.bags.toString(),
      kg: kg.toString(),
      bagWeightKg: bagWeightKg.toString(),
    });

    await tx.insert(inventoryMovements).values({
      tenantId: args.tenantId,
      warehouseId,
      batchId: args.batchId,
      productId: row.productId,
      movementType: "استهلاك يومي",
      quantity: (-row.bags).toString(),
      unit: "كيس",
      sourceType: "daily_log",
      sourceUuid: args.logUuid,
      createdBy: args.actorId,
    });

    // **الرصيد يُقرأ بعد الخصم ولا يمنعه** (§13.4، والمبدأ الخامس)
    const balance = await computeBalance(tx, {
      tenantId: args.tenantId,
      productId: row.productId,
      warehouseId,
    });
    if (balance < 0) negativeBalances.push({ productId: row.productId, balance });
  }

  return { feedKgTotal, negativeBalances };
}

/** الحقولُ الاختيارية — **مفصولةٌ لأن الحدَّ يُحترم بالفصل** (`complexity`). */
function optionalLogFields(
  input: CreateDailyLogInput,
  computed: { waterLiters: number | null; avgWeightG: number | null; tankCapacityL: string | null }
): Record<string, unknown> {
  const optional: Record<string, unknown> = {};
  const put = (key: string, value: unknown): void => {
    if (value !== undefined && value !== null) optional[key] = value;
  };
  put("mortalityCause", input.mortalityCause);
  put("mortalityCauseNote", input.mortalityCauseNote);
  put("waterTanks", input.waterTanks?.toString());
  put("waterLiters", computed.waterLiters?.toString());
  // **لقطةٌ مجمَّدة كوزن الكيس** (نمط 201): سعةٌ تتغيّر غدًا لا تُعيد حساب أمس
  if (input.waterTanks !== undefined) put("tankCapacityL", computed.tankCapacityL);
  put("sampledBirds", input.sampledBirds);
  put("sampledWeightKg", input.sampledWeightKg?.toString());
  put("avgWeightG", computed.avgWeightG?.toString());
  put("temperatureC", input.temperatureC?.toString());
  put("humidityPct", input.humidityPct?.toString());
  put("notes", input.notes);
  put("clientId", input.clientId);
  return optional;
}

/** يُدرج صفّ السجلّ — **والحقول المحسوبة تُكتب معه لا تُشتقّ عند القراءة**. */
async function insertLog(
  tx: Tx,
  args: {
    input: CreateDailyLogInput;
    batchId: number;
    waterLiters: number | null;
    avgWeightG: number | null;
    tankCapacityL: string | null;
  }
): Promise<{ id: number; uuid: string }> {
  const { input } = args;
  const [row] = await tx
    .insert(dailyLogs)
    .values({
      tenantId: input.tenantId,
      houseId: input.houseId,
      batchId: args.batchId,
      logDate: input.logDate,
      mortalityCount: input.mortalityCount,
      createdBy: input.actorId,
      ...optionalLogFields(input, args),
    })
    .returning({ id: dailyLogs.id, uuid: dailyLogs.uuid });
  if (!row) throw new HttpError(500, "internal_error", "تعذّر حفظ السجل اليومي");
  return row;
}

/**
 * يُنشئ السجل اليومي — **السجلّ وصفوفُ العلف وحركاتُ المخزون في معاملةٍ واحدة**.
 *
 * @returns السجلّ ومحسوباتُه، و`duplicate` صحيحٌ حين أُعيد سجلٌّ سابق
 * @throws HttpError 404 عنبرٌ أو صنفٌ غير موجود · 409 يومٌ مسجَّل سلفًا ·
 *   422 لا دفعة نشطة · صنفٌ ليس علفًا · عيّنةٌ ناقصة
 */
export async function createDailyLog(
  db: Database,
  input: CreateDailyLogInput
): Promise<DailyLogResult> {
  if (input.clientId !== undefined) {
    const existing = await findByClientId(db, {
      tenantId: input.tenantId,
      clientId: input.clientId,
    });
    if (existing) return existing;
  }

  try {
    return await db.transaction(async (tx) => writeDailyLog(tx, input));
  } catch (error) {
    // **والسباق يُعاد قراءتُه لا يُردّ خطأً** — الحكم «المكرَّر يُعاد بـ200»،
    // **والفهرس شبكةُ أمانٍ خلف الفحص لا بديلٌ عن حكمه** (نمط #119).
    //
    // **ولا يُقيَّد الالتقاط باسم قيدٍ بعينه:** طلبان متزامنان بنفس المعرّف
    // **يتصادمان على أيّهما سبق** — فهرسِ المعرّف أو فهرسِ اليوم. **والسؤال
    // الحاسم واحد: أهبط صفُّنا فعلًا؟** — **فإن وُجد أُعيد، وإلا رُمي الخطأ
    // كما هو** (فتكرارُ اليوم بمعرّفٍ آخر يبقى 409).
    if (input.clientId !== undefined) {
      const existing = await findByClientId(db, {
        tenantId: input.tenantId,
        clientId: input.clientId,
      });
      if (existing) return existing;
    }
    throw error;
  }
}

/** جسمُ المعاملة — **مفصولٌ لأن الحدَّ يُحترم بالفصل لا برفعه**. */
async function writeDailyLog(tx: Tx, input: CreateDailyLogInput): Promise<DailyLogResult> {
  const { batchId, tankCapacityL } = await lockHouseAndReadBatch(tx, input);
  await assertNoLogForDay(tx, {
    tenantId: input.tenantId,
    batchId,
    logDate: input.logDate,
  });

  const waterLiters = computeWaterLiters(tankCapacityL, input.waterTanks);
  const avgWeightG = computeAvgWeightG(input.sampledBirds, input.sampledWeightKg);
  const log = await insertLog(tx, { input, batchId, waterLiters, avgWeightG, tankCapacityL });
  const { feedKgTotal, negativeBalances } = await writeFeedAndMovements(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    houseId: input.houseId,
    batchId,
    logId: log.id,
    logUuid: log.uuid,
    feedRows: input.feedRows,
  });

  return {
    dailyLogId: log.id,
    batchId,
    logDate: input.logDate,
    duplicate: false,
    waterLiters,
    avgWeightG,
    feedKgTotal,
    negativeBalances,
  };
}
