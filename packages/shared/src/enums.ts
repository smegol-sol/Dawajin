/**
 * مصدر الحقيقة الوحيد لكل قيم enum في النظام.
 * يُستهلك من packages/db (pgEnum) ومن apps/api و apps/mobile (zod) —
 * لا تُعرَّف هذه القوائم في أي مكان آخر (backend-technical-spec.md §6).
 * راجع backend-technical-spec.md §8 لجدول الأنواع الكامل.
 */

/**
 * أدوار المستخدمين **داخل المستأجر** — خمسة بلا سادس (القرار 194).
 *
 * **و`platform_admin` أُزيل**: مدير المنصة **ليس دورًا في مستأجر** بل كيان في
 * جدول مستقل بلا `tenant_id` (`platform_admins`، القراران #146 و#147).
 * **وبقاؤه قيمةً هنا كان يجعل الفرق بين «صاحب مزرعة» و«من يرى كل العملاء»
 * مقارنةً نصّية واحدة.**
 *
 * **و`storekeeper` (أمين المخزن) أُضيف بالقرار 198** — **وهو أول دور يُضاف بعد
 * قلب افتراض الحارس** (القرار 184، وشرط الإغلاق في #161 «ثالث عشر» البند ١):
 * **من ليس في قائمة معلومة لا يرى شيئًا**، فالدور الجديد **يصل محجوبًا لا
 * مفتوحًا**، ويُدرَج فيما يراه بقرار مكتوب لا بالسكوت.
 */
export const USER_ROLE = ["farmer", "supervisor", "vet", "owner", "storekeeper"] as const;
export type UserRole = (typeof USER_ROLE)[number];

export const BATCH_STATUS = ["نشطة", "منتهية"] as const;
export type BatchStatus = (typeof BATCH_STATUS)[number];

export const BREED = ["Ross 308", "Cobb 500", "Arbor Acres"] as const;
export type Breed = (typeof BREED)[number];

export const HOUSE_STATUS = [
  "مشغول",
  "تحت الإخلاء",
  "تحت التنظيف والتطهير",
  "في فترة الراحة",
  "جاهز للإسكان",
  "تحت الصيانة",
  "معطّل",
] as const;
export type HouseStatus = (typeof HOUSE_STATUS)[number];

export const HOUSE_TYPE = ["مفتوح", "مغلق", "هجين"] as const;
export type HouseType = (typeof HOUSE_TYPE)[number];

/**
 * مصادر طاقة **المزرعة** — لا العنبر (القرار #112).
 *
 * **قيمتان لا أربع:** الشبكة الحكومية والتجارية لا تصلان أماكن العنابر في
 * ميدان المالك أصلًا، فإدراجهما كان وصفًا لواقع غير موجود.
 *
 * **قائمة لا حقل نعم/لا** رغم أن القيمتين تبدوان قابلتين للاختزال: القيد
 * «لا مزرعة بلا مصدر طاقة» **غير قابل للتعبير عنه** بحقل منطقي — `has_solar
 * = false` لا يفرّق بين مزرعة بمولّد ومزرعة بلا طاقة. والقائمة تعبّر عنه
 * بـ`cardinality >= 1` مباشرة.
 *
 * والاختيار متعدّد لأن المزرعة تجمع المصدرين فعلًا (شمسية نهارًا ومولّد ليلًا).
 */
export const POWER_SOURCE = ["شمسية", "مولدات"] as const;
export type PowerSource = (typeof POWER_SOURCE)[number];

export const MORTALITY_CAUSE = [
  "مرض تنفسي",
  "إجهاد حراري",
  "مشاكل مياه/علف",
  "حادث",
  "غير معروف",
  "أخرى",
] as const;
export type MortalityCause = (typeof MORTALITY_CAUSE)[number];

export const REVIEW_STATUS = [
  "none",
  "pending_review",
  "reviewed",
  "correction_submitted",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[number];

export const FEED_STAGE = ["بادئ", "نامي", "ناهي"] as const;
export type FeedStage = (typeof FEED_STAGE)[number];

/**
 * فئات الأصناف — **ستّ بعد فصل المعقمات والمطهرات** (القرار #161 «ثالث عشر»
 * البند ٧): كانت تقع ضمن «مستلزمات»، **وحدّ ما يحمله مخزن العنبر بالفئة لا
 * بكتلة** — وكتلةٌ تضمّ المطهر والمعدّة الإنشائية معًا **لا تُفرَض عليها قاعدة**.
 */
export const PRODUCT_CATEGORY = [
  "علف",
  "دواء",
  "لقاح",
  "فيتامين",
  "معقمات ومطهرات",
  "مستلزمات",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORY)[number];

export const STOCK_UNIT = ["عبوة", "زجاجة", "كيس", "لتر", "كجم", "قطعة"] as const;
export type StockUnit = (typeof STOCK_UNIT)[number];

export const DOSE_BASIS = ["لكل لتر ماء", "لكل كجم وزن حي", "لكل طير", "لكل 1000 طير"] as const;
export type DoseBasis = (typeof DOSE_BASIS)[number];

export const ROUTE = ["مع الماء", "مع العلف", "حقن", "رش", "تقطير بالعين", "فموي", "أخرى"] as const;
export type Route = (typeof ROUTE)[number];

export const INVENTORY_MOVEMENT_TYPE = [
  "استلام",
  "شحن صادر",
  "شحن وارد",
  "مرتجع صادر",
  "مرتجع وارد",
  "تحويل صادر",
  "تحويل وارد",
  "استهلاك يومي",
  "تنفيذ علاج",
  "استهلاك تجهيز",
  "تسوية جرد",
  "هالك/تلف",
  /**
   * **الخروج إلى خارج المنظومة** (القرار 203) — **الثالث عشر، والأول الذي
   * يخرج من النظام لا داخله**.
   *
   * **والاثنا عشر قبله كلها داخلية:** كلٌّ منها ينقل كميةً بين موضعين في
   * النظام أو يستهلكها فيه. **فبيعُ كيسٍ فارغ** (#161 «عاشرًا»: «أصل قابل
   * للبيع… عددًا فقط بلا سعر ولا قيمة») **لم يكن له نوع**، فكان يُسجَّل
   * «هالك/تلف» — **كذبٌ في سجل لا يُعدَّل** — أو لا يُسجَّل فينقص الرصيد
   * بلا سبب **وتكشف معادلة §13.3 فارقًا بلا تفسير**. **النظام كان يجبر على
   * أحد الخطأين.**
   */
  "صرف خارجي",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPE)[number];

/**
 * **حالة أمر الصرف الخارجي** (القرار 203) — **والحركة تُولد بالمصادقة لا
 * قبلها**: أمرٌ معلَّق لا يمسّ الرصيد، ومرفوضٌ لا يُنتج حركة أبدًا.
 */
export const EXTERNAL_ISSUE_STATUS = ["معلّق", "مصادَق", "مرفوض"] as const;
export type ExternalIssueStatus = (typeof EXTERNAL_ISSUE_STATUS)[number];

/**
 * **سبب الصرف الخارجي** (القرار 203).
 *
 * **وقائمة مغلقة هنا مشروعة حيث لم تكن في `WASTAGE_REASON`** (#161 «ثالث
 * عشر» ١١: «النظام يعرض أسبابًا لا يستطيع كشفها ولا منعها»): سبب الهالك
 * **واقعةٌ في العالم** يعجز النظام عن كشفها («انقطاع تبريد»)، **وهذا
 * تصريحٌ من البادئ عن فعلٍ هو صاحبه** — لا يُكشف بل يُنسب إلى من وقّعه.
 *
 * **وقصيرة عمدًا:** «بيع» وحده ما تسمّيه أحكام المالك (#161 «عاشرًا»
 * والقرار 203)، **ولا يُخترع لها ثالث**. و«أخرى» **تُلزم بنصّ** — وهو باب
 * نموّ القائمة: ما يتكرر في النصوص يصير قيمةً بقرار، لا بالحدس.
 */
export const EXTERNAL_ISSUE_REASON = ["بيع", "أخرى"] as const;
export type ExternalIssueReason = (typeof EXTERNAL_ISSUE_REASON)[number];

/**
 * **حالة طلب المربّي** (القرار 211) — **قيمتان لا ثلاث**.
 *
 * **والحكم يسمّي «لم يُلبَّ» ولا يسمّي رفضًا** (#160 «خامسًا»): **الطلب غير
 * الملبَّى يتصاعد إلى المالك بمرور المدّة** — **فالتصعيد يقوم على الصمت**.
 * **وقيمةُ رفضٍ تغيّر معنى التصعيد** (أيتصاعد المرفوض؟ إن لم يتصاعد صار
 * الرفض بابًا لإسكات الطلب) — **وهو قرار مالك لم يصدر، فلا تُخترع القيمة**.
 */
export const FARMER_REQUEST_STATUS = ["مرفوع", "ملبّى"] as const;
export type FarmerRequestStatus = (typeof FARMER_REQUEST_STATUS)[number];

export const SHIPMENT_STATUS = ["معلّقة", "مستلمة", "ملغاة"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUS)[number];

export const SHIPMENT_VARIANCE_STATUS = ["مطابق", "فرق مسجّل", "قيد النزاع"] as const;
export type ShipmentVarianceStatus = (typeof SHIPMENT_VARIANCE_STATUS)[number];

export const DISPUTE_OUTCOME = ["خطأ قياس", "فاقد نقل", "فاقد بعد التسليم"] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOME)[number];

export const WASTAGE_REASON = [
  "انتهاء صلاحية",
  "تلف بالرطوبة",
  "كسر",
  "انقطاع تبريد",
  "تلوث",
  "أخرى",
] as const;
export type WastageReason = (typeof WASTAGE_REASON)[number];

export const HEALTH_TASK_STATUS = ["معلقة", "منفّذة", "متأخرة", "متعذّرة", "ملغاة"] as const;
export type HealthTaskStatus = (typeof HEALTH_TASK_STATUS)[number];

export const HEALTH_OBSERVATION_SEVERITY = ["خفيف", "متوسط", "شديد"] as const;
export type HealthObservationSeverity = (typeof HEALTH_OBSERVATION_SEVERITY)[number];

export const NOTIFICATION_URGENCY = ["urgent", "action", "info"] as const;
export type NotificationUrgency = (typeof NOTIFICATION_URGENCY)[number];

export const SUBSCRIPTION_STATUS = ["تجريبي", "نشط", "موقوف", "منتهي"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

/**
 * **مستوى المخزن — كيان واحد بمستوى لا أنواع متعددة** (القرار #161 «أولًا»).
 *
 * **والتوسع إعداد لا برمجة:** المالك ينشئ ما يناسب حجمه — مركزي واحد يصرف
 * للعنابر مباشرة، أو مركزي ثم مخزن لكل موقع ثم العنابر، أو مخازن مواقع بلا
 * مركزي. **وبناء أنواع مختلفة يجعل كل تغيّر في حجم العميل تعديلًا في النظام.**
 *
 * **ولا مستوى «مزرعة»** (#161 «ثالث عشر» البند ٣): «مخزن مزرعته» خطأ في اللفظ،
 * **والمقصود مخزن الموقع** — والموقع قد يضمّ أكثر من مزرعة (#113).
 */
export const WAREHOUSE_LEVEL = ["مركزي", "موقع", "عنبر"] as const;
export type WarehouseLevel = (typeof WAREHOUSE_LEVEL)[number];

/*
 * **`LOCATION_TYPE` حُذف بالقرار 199** — كان زوجًا `(نوع، معرّف)` يعنون الدفتر،
 * **وصار الدفتر يعنون مخزنًا بمعرّفه** بعد أن صار مخزن العنبر كيانًا (القرار
 * 198). **ولا مستهلك له بقي**: الجداول الأربعة تحوّلت، وطبقة الرصيد والحارس
 * معها. ويُذكر هنا كي لا يُعاد استحداثه ظنًّا أنه سقط سهوًا.
 */

/** أولوية المهمة الصحية (decisions.md #50 — حسمها صاحب المنتج). */
export const HEALTH_TASK_PRIORITY = ["عادي", "عاجل"] as const;
export type HealthTaskPriority = (typeof HEALTH_TASK_PRIORITY)[number];

/** حالة البلاغ الصحي (decisions.md #51). */
export const HEALTH_OBSERVATION_STATUS = ["جديد", "قيد المراجعة", "مغلق"] as const;
export type HealthObservationStatus = (typeof HEALTH_OBSERVATION_STATUS)[number];

/**
 * حالة النزاع نفسها — منفصلة عن dispute_outcome (سبب الحسم). decisions.md #52.
 */
export const DISPUTE_STATUS = ["مفتوح", "مغلق"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUS)[number];

/** ظروف تخزين المنتج (decisions.md #53). */
export const STORAGE_CONDITIONS = ["عادي", "مبرّد 2-8°م", "مجمّد"] as const;
export type StorageConditions = (typeof STORAGE_CONDITIONS)[number];
