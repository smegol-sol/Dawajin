import { BATCH_STATUSES_WITH_BIRDS, FEED_STAGE, type FeedStage } from "@dawajin/shared";

import type { BatchCard, DailyLogRequest, ProductCard } from "./dailyLogApi";

/**
 * **نموذجُ السجل اليوميّ الخالص** — الحسابُ المعروض، وسببُ تعطيل الحفظ،
 * وبناءُ الطلب. **مفصولٌ عن الشاشة لأنه يحمل قرارات منتج لا تفاصيل عرض**،
 * فيُفحص وحده (نمط `infrastructureNavigation`).
 *
 * **ولا يحرس شيئًا:** كلُّ ما هنا **يمنع زرًّا يفشل عند الضغط** (§11) —
 * **والفرضُ في الخادم**، وما يُخفى في الواجهة ليس حراسة.
 */

/**
 * صفُّ علفٍ في النموذج — **الصنفُ ومرحلتُه والأكياس**.
 *
 * **والمرحلةُ تُشتقّ من الصنف ولا تُسأل** (القرار 292): سؤالان جوابُهما واحد
 * في الغالب، **وأربعُ لمساتٍ يومَ الخلط بدل لمستين**.
 *
 * **وتُحفظ في السجلّ ولا تُشتقّ عند القراءة — تجميدٌ للواقعة**: لو عُدِّلت
 * مرحلةُ الصنف لاحقًا **لا يتغيّر ما وقع** (نمط `purchased_bird_count` في 280).
 *
 * **وتبقى `null` حتى يُختار صنف** — **أو إن كان الصنفُ بلا مرحلة**، وحينها
 * تُسأل صراحةً. **ولا صنفَ كذلك اليوم — مقيس** (كلُّ أصناف العلف نظاميّة
 * بمرحلةٍ واحدة)، **ولا مسارَ إنشاءِ صنفٍ إطلاقًا** (القرار 268: يسقط الحدّ
 * يوم يُبنى `POST /api/products`).
 */
export interface FeedRowDraft {
  /** معرّفٌ محلّيّ للصفّ — **لا يُرسَل**؛ يميّز صفّين بنفس الصنف في القائمة. */
  key: string;
  productId: number | null;
  stage: FeedStage | null;
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

/**
 * **أصنافُ العلف التي يقبلها الخادم** — «علف» بوحدة «كيس» (`readFeedProduct`).
 *
 * **ولا تُفلتر بمرحلة بعد اليوم** (القرار 292): **المرحلةُ تُشتقّ من الصنف
 * المختار**، فالسؤالُ واحد لا اثنان.
 */
export function feedProductsOf(products: readonly ProductCard[]): ProductCard[] {
  return products.filter((product) => product.category === "علف" && product.stockUnit === "كيس");
}

/**
 * **مرحلةُ الصفّ من صنفه** — `null` حين لا صنفَ بعد، **أو حين لا مرحلة له**.
 *
 * **والثانيةُ تُسأل ولا تُخمَّن**: صنفٌ بلا مرحلة لا يُعرف أيَّ مرحلةٍ يمثّل،
 * **وعمودُ السجلّ `NOT NULL` فلا يُترك**.
 */
export function stageOfProduct(product: ProductCard | undefined): FeedStage | null {
  const raw = product?.feedStage ?? null;
  // **تضييقٌ لا ادّعاء**: حقلُ الرد `string | null`، **ومرحلةٌ لا تعرفها
  // القائمة تُعامَل كغيابٍ فتُسأل** — ولا تُمرَّر بنوعٍ مزعوم
  return FEED_STAGE.find((stage) => stage === raw) ?? null;
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

/** **حقلٌ ناقص، مسمًّى بصفّه** — فتُوضَع العلامة عنده لا في ذيل الشاشة. */
export type FieldError =
  | { kind: "feed-product"; rowKey: string }
  | { kind: "feed-stage"; rowKey: string }
  | { kind: "feed-bags"; rowKey: string }
  | { kind: "sample" };

/**
 * **ما ينقص النموذج — مسمًّى بحقله لا بسطرٍ في ذيل الشاشة** (القرار 292،
 * على §8.11: «رسالة الخطأ تحته مباشرة لا أعلى الشاشة»).
 *
 * **وكان يُرجع سببًا واحدًا يُعرض تحت زرٍّ معطَّل** — **فقرأه المالك «الزرّ
 * لا يعمل» ولم يقرأه «ينقص كذا»**. **وصاحبُ النظام أخطأه، فالمربّي أَولى.**
 *
 * **وكلُّ ما هنا يقابل ردًّا يرميه الخادم** — فليس تشديدًا من عندنا: صفُّ
 * علفٍ بلا صنف يُرفض بـ400 · **وعيّنةٌ بنصفها تُردّ بـ`sample_pair_required`**
 * · **وصفرُ أكياسٍ يُردّ بـ«كمية العلف يجب أن تكون موجبة»**.
 *
 * @returns الحقولُ الناقصة بترتيب ظهورها في الشاشة — وفارغةٌ حين يكتمل
 */
export function draftErrors(draft: DailyLogDraft): FieldError[] {
  const errors: FieldError[] = [];
  for (const row of draft.feedRows) {
    if (row.productId === null) errors.push({ kind: "feed-product", rowKey: row.key });
    else if (row.stage === null) errors.push({ kind: "feed-stage", rowKey: row.key });
    if (row.bags <= 0) errors.push({ kind: "feed-bags", rowKey: row.key });
  }
  if (draft.sampledBirds > 0 !== draft.sampledWeightKg > 0) errors.push({ kind: "sample" });
  return errors;
}

/** **نصُّ الحقل الناقص — قصيرٌ لأنه يُقرأ تحت الحقل لا في فقرة.** */
export function fieldErrorMessage(error: FieldError): string {
  switch (error.kind) {
    case "feed-product":
      return "اختر العلف";
    case "feed-stage":
      return "اختر المرحلة — هذا الصنف بلا مرحلة";
    case "feed-bags":
      return "الكمية أكبر من صفر";
    case "sample":
      return "عيّنة الوزن رقمان معًا: عدد الطيور ووزنها";
  }
}

/** **ما ينقص صفًّا بعينه** — مفاتيحُه حقولُه، فتُوضَع العلامة عند كلٍّ منها. */
export interface RowErrors {
  product?: string | undefined;
  stage?: string | undefined;
  bags?: string | undefined;
}

/**
 * **يقسم الأخطاء على حقول صفٍّ واحد** — **والقسمةُ هنا لا في الشاشة** فتُفحص
 * وحدها (نمط `infrastructureNavigation`).
 */
export function rowErrors(errors: readonly FieldError[], rowKey: string): RowErrors {
  const out: RowErrors = {};
  for (const error of errors) {
    if (error.kind === "sample" || error.rowKey !== rowKey) continue;
    if (error.kind === "feed-product") out.product = fieldErrorMessage(error);
    if (error.kind === "feed-stage") out.stage = fieldErrorMessage(error);
    if (error.kind === "feed-bags") out.bags = fieldErrorMessage(error);
  }
  return out;
}

/** **نصُّ عيّنة الوزن** — يُعرض عند حقلها لا في ذيل الشاشة (§8.11). */
export function sampleError(errors: readonly FieldError[]): string | undefined {
  const found = errors.find((error) => error.kind === "sample");
  return found === undefined ? undefined : fieldErrorMessage(found);
}

/**
 * **سطرٌ مختصر فوق الزرّ يقول كم ينقص** — **لأن الحقل الناقص قد يكون خارج
 * الشاشة لحظةَ الضغط**، فالعلامةُ عنده وحدها لا تُرى.
 *
 * **و«تسمية: عدد» لا «عدد + معدود»** (القرار 287).
 */
export function errorSummary(errors: readonly FieldError[]): string | undefined {
  // **التفكيكُ يجعل فحصَ الفراغ واحدًا لا اثنين** — وفحصٌ ثانٍ يرضي المُترجِم
  // **فرعٌ ميّتٌ لا يُبلَغ**، **وتغطيتُه تُشترى باختبارٍ يصف مستحيلًا**
  const [first, ...rest] = errors;
  if (first === undefined) return undefined;
  if (rest.length === 0) return fieldErrorMessage(first);
  return `${fieldErrorMessage(first)} — وحقولٌ ناقصة أخرى: ${String(rest.length)}`;
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
    // **والصفُّ بلا صنفٍ أو بلا مرحلة يسقط** — `draftErrors` يمنع الإرسال
    // أصلًا، **وهذا يجعل النوع صادقًا** فلا تُرسَل مرحلةٌ عادمة
    feedRows: draft.feedRows.flatMap((row) =>
      row.productId === null || row.stage === null
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
    // **بلا مرحلةٍ مفترَضة** (القرار 292): كانت «بادئ» ثابتةً مهما كان عمرُ
    // الدفعة، **فيومَ الخلط يعود الصفُّ الثاني إلى «بادئ» ويلزمه تصحيح**.
    // **والمرحلةُ اليوم تتبع الصنف، فلا شيءَ يُفترض.**
    feedRows: [...draft.feedRows, { key, productId: null, stage: null, bags: 0 }],
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
