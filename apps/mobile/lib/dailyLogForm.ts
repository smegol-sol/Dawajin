import { BATCH_STATUSES_WITH_BIRDS, type FeedStage } from "@dawajin/shared";

import type { BatchCard, DailyLogRequest, ProductCard } from "./dailyLogApi";

/**
 * **نموذجُ السجل اليوميّ الخالص** — الحسابُ المعروض، وسببُ تعطيل الحفظ،
 * وبناءُ الطلب. **مفصولٌ عن الشاشة لأنه يحمل قرارات منتج لا تفاصيل عرض**،
 * فيُفحص وحده (نمط `infrastructureNavigation`).
 *
 * **ولا يحرس شيئًا:** كلُّ ما هنا **يمنع زرًّا يفشل عند الضغط** (§11) —
 * **والفرضُ في الخادم**، وما يُخفى في الواجهة ليس حراسة.
 */

/** صفُّ علفٍ في النموذج — **الصنفُ ومرحلتُه والأكياس**. */
export interface FeedRowDraft {
  /** معرّفٌ محلّيّ للصفّ — **لا يُرسَل**؛ يميّز صفّين بنفس الصنف في القائمة. */
  key: string;
  productId: number | null;
  stage: FeedStage;
  bags: number;
}

export interface DailyLogDraft {
  mortalityCount: number;
  mortalityCause: string | null;
  waterTanks: number;
  sampledBirds: number;
  sampledWeightKg: number;
  temperatureC: string;
  humidityPct: string;
  notes: string;
  feedRows: FeedRowDraft[];
}

export const emptyDraft: DailyLogDraft = {
  mortalityCount: 0,
  mortalityCause: null,
  waterTanks: 0,
  sampledBirds: 0,
  sampledWeightKg: 0,
  temperatureC: "",
  humidityPct: "",
  notes: "",
  feedRows: [],
};

/**
 * **الدفعةُ التي يُسجَّل عليها — «نشطة» وحدها** (القرار 278).
 *
 * **و«قيد الوصول» ليست نشطة:** عنبرٌ وصلته طيورٌ ولم يؤكّدها المربّي **لا
 * دفعةَ فيه بعد** — **والخادمُ يردّ 422، فالشاشة لا تعرض نموذجًا يُرفض**.
 */
export function activeBatchOf(batches: readonly BatchCard[]): BatchCard | undefined {
  return batches.find((batch) => batch.status === "نشطة");
}

/**
 * **دفعةٌ في الطريق — تُميَّز عن «لا دفعة إطلاقًا»** لأن نصّ الحالة الفارغة
 * يختلف: **من ينتظر تأكيدَ استلامه غيرُ من لم تصله شحنة**.
 */
export function arrivingBatchOf(batches: readonly BatchCard[]): BatchCard | undefined {
  return batches.find(
    (batch) => batch.status !== "نشطة" && BATCH_STATUSES_WITH_BIRDS.includes(batch.status as never)
  );
}

/** **أصنافُ العلف التي يقبلها الخادم** — «علف» بوحدة «كيس» (`readFeedProduct`). */
export function feedProductsOf(products: readonly ProductCard[], stage: FeedStage): ProductCard[] {
  return products.filter(
    (product) =>
      product.category === "علف" &&
      product.stockUnit === "كيس" &&
      (product.feedStage === null || product.feedStage === stage)
  );
}

/**
 * **عدّادُ القسم — يُعرض حين يفيد وحده** (`SectionHeader` يعرض ما يُمرَّر إليه).
 *
 * **وصفرٌ بجانب عنوان قسمٍ فارغ رقمٌ لا يفيد** — **والشاشة تُقرأ واقفًا في
 * عنبرٍ تحت شمس، فكلُّ رقمٍ لا يفيد يزاحم ما يفيد** (حكم المالك).
 *
 * @returns العدد، أو `undefined` فلا يُمرَّر إلى `SectionHeader` أصلًا
 */
export function sectionCount(rows: readonly unknown[]): number | undefined {
  return rows.length === 0 ? undefined : rows.length;
}

/**
 * **سطرُ الكجم المحسوب تحت الأكياس** (§2) — **ولا يُرسَل**: الخادم يحسبه من
 * وزن الكيس المجمَّد (القرار 201)، **وقبولُه من العميل يجعل الحساب دعوى**.
 *
 * @returns السطر، أو `undefined` حين لا صنف مختار أو لا وزنَ لعبوته
 */
export function feedComputedLine(
  product: ProductCard | undefined,
  bags: number
): string | undefined {
  if (product?.packageSize == null || product.packageUnit === null) return undefined;
  // **ولا سطرَ قبل أوّل إدخال** — `= 0 كجم` **رقمٌ لا يفيد يزاحم ما يفيد**
  if (bags <= 0) return undefined;
  return `= ${formatNumber(bags * product.packageSize)} ${product.packageUnit}`;
}

/**
 * **سطرُ اللترات تحت الخزانات** (§2) — بسعة خزان العنبر.
 *
 * **وحقلُ الماء يُخفى كلَّه حين لا سعةَ للعنبر** (§7.1) — **والخادمُ يردّ 422
 * حينها**، فعرضُ الحقل يَعِد بما يُرفض.
 */
export function waterComputedLine(tankCapacityL: number | null, tanks: number): string | undefined {
  if (tankCapacityL === null) return undefined;
  // **ولا سطرَ قبل أوّل إدخال** — نفس حكم الكجم أعلاه في موضعه الثاني
  if (tanks <= 0) return undefined;
  return `= ${formatNumber(tanks * tankCapacityL)} لتر`;
}

/** **متوسطُ الوزن المعروض** — يظهر حين يكتمل الرقمان وحدهما. */
export function avgWeightLine(sampledBirds: number, sampledWeightKg: number): string | undefined {
  if (sampledBirds <= 0 || sampledWeightKg <= 0) return undefined;
  return `= ${formatNumber((sampledWeightKg / sampledBirds) * 1000)} جم للطير`;
}

/**
 * **سببُ تعطيل الحفظ — مكتوبٌ ويظهر قبل الضغط لا بعده** (§8.2 و§11).
 *
 * **وكلُّ سببٍ هنا يقابل ردًّا يرميه الخادم** — فليس تشديدًا من عندنا:
 * صفُّ علفٍ بلا صنف يُرفض بـ400، **وعيّنةٌ بنصفها تُردّ بـ`sample_pair_required`**
 * (422)، **وصفرُ أكياسٍ يُردّ بـ«كمية العلف يجب أن تكون موجبة»**.
 *
 * @returns السبب، أو `undefined` حين يكون الحفظ متاحًا
 */
export function saveDisabledReason(draft: DailyLogDraft, saving: boolean): string | undefined {
  if (saving) return "جارٍ الحفظ";
  for (const row of draft.feedRows) {
    if (row.productId === null) return "اختر صنف العلف في كل صفّ";
    if (row.bags <= 0) return "كمية العلف في كل صفّ أكبر من صفر";
  }
  const half = draft.sampledBirds > 0 !== draft.sampledWeightKg > 0;
  if (half) return "عيّنة الوزن رقمان معًا: عدد الطيور ووزنها";
  return undefined;
}

/**
 * **يبني جسم الطلب** — **والحقول الاختيارية تُحذف ولا تُرسَل أصفارًا**:
 * صفرُ خزاناتٍ مُرسَلٌ يعني «قيست فكانت صفرًا»، **وغيابُه يعني «لم تُقَس»** —
 * والفرق يُحفظ في السجل ولا يُستدرك.
 */
export function buildRequest(args: {
  draft: DailyLogDraft;
  houseId: number;
  logDate: string;
  clientId: string;
  hasTankCapacity: boolean;
}): DailyLogRequest {
  const { draft } = args;
  return {
    houseId: args.houseId,
    logDate: args.logDate,
    mortalityCount: draft.mortalityCount,
    clientId: args.clientId,
    feedRows: draft.feedRows.flatMap((row) =>
      row.productId === null
        ? []
        : [{ productId: row.productId, feedStage: row.stage, bags: row.bags }]
    ),
    ...(draft.mortalityCount > 0 && draft.mortalityCause !== null
      ? { mortalityCause: draft.mortalityCause }
      : {}),
    ...(args.hasTankCapacity && draft.waterTanks > 0 ? { waterTanks: draft.waterTanks } : {}),
    ...(draft.sampledBirds > 0 && draft.sampledWeightKg > 0
      ? { sampledBirds: draft.sampledBirds, sampledWeightKg: draft.sampledWeightKg }
      : {}),
    ...numericField("temperatureC", draft.temperatureC),
    ...numericField("humidityPct", draft.humidityPct),
    ...(draft.notes.trim() === "" ? {} : { notes: draft.notes.trim() }),
  };
}

/** حقلٌ رقميّ نصُّه اختياريّ — **يُحذف حين لا يُقرأ رقمًا**، ولا يُرسَل `NaN`. */
function numericField(
  name: "temperatureC" | "humidityPct",
  raw: string
): Record<string, number> | Record<string, never> {
  const trimmed = raw.trim();
  if (trimmed === "") return {};
  const value = Number(trimmed);
  return Number.isFinite(value) ? { [name]: value } : {};
}

/**
 * **الأرقام لاتينية بلا فواصل آلاف** (§10 قاعدة 2 و§12) — **وبثلاث منازل
 * كحدّ**: `package_size` بدقّة ثلاث منازل في القاعدة، **فالعرضُ لا يزيد عليها
 * ولا يُظهر ذيلًا عشريًّا لا معنى له**.
 */
export function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * **تاريخُ اليوم بصيغة `YYYY-MM-DD`** — **بتقويم الجهاز المحلّيّ لا UTC**:
 * `toISOString` تُرجع يوم أمس بعد منتصف الليل بتوقيت عدن (UTC+3)، **فيُسجَّل
 * اليومُ على تاريخٍ مضى**.
 */
export function todayIso(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * **معرّفُ عطالةٍ لكل نموذج** — يجعل إعادة الإرسال تُعيد نفس السجل بـ200 لا
 * تُنشئ ثانيًا (§14.1، والفهرس الجزئي في القاعدة).
 *
 * **ومصدرُ العشوائية أضعفُ ما يكفي لهذا الغرض وحده — ويُعلَن (قاعدة 268):**
 * **هذا مفتاحُ عطالةٍ لا سرّ**، **ولا مصدرَ عشوائيةٍ تعمّيّ في حزمة التطبيق
 * اليوم** (`expo-crypto` غير مثبَّت). **ويسقط الحدُّ يوم يُضاف أولُ مصدرٍ
 * تعمّيّ**، فيُستبدل جسمُ الدالّة ولا يتغيّر مستدعوها. **ويُقدَّم
 * `crypto.randomUUID` حين توفّره المنصّة** — فلا يُهدر ما هو موجود.
 */
export function newClientId(): string {
  const platform = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof platform?.randomUUID === "function") return platform.randomUUID();
  const hex = (length: number): string =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const variant = (Math.floor(Math.random() * 4) + 8).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** **يضيف صفَّ علفٍ جديدًا** — بمرحلةٍ أولى وبلا صنف، فيختار المربّي بيده. */
export function addFeedRow(draft: DailyLogDraft, key: string): DailyLogDraft {
  return {
    ...draft,
    feedRows: [...draft.feedRows, { key, productId: null, stage: "بادئ", bags: 0 }],
  };
}

/** يعدّل صفًّا بمفتاحه — **ولا يمسّ غيره**. */
export function patchFeedRow(
  draft: DailyLogDraft,
  key: string,
  patch: Partial<FeedRowDraft>
): DailyLogDraft {
  return {
    ...draft,
    feedRows: draft.feedRows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
  };
}

/** يحذف صفًّا بمفتاحه. */
export function removeFeedRow(draft: DailyLogDraft, key: string): DailyLogDraft {
  return { ...draft, feedRows: draft.feedRows.filter((row) => row.key !== key) };
}
