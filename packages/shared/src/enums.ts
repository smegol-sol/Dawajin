/**
 * مصدر الحقيقة الوحيد لكل قيم enum في النظام.
 * يُستهلك من packages/db (pgEnum) ومن apps/api و apps/mobile (zod) —
 * لا تُعرَّف هذه القوائم في أي مكان آخر (backend-technical-spec.md §6).
 * راجع backend-technical-spec.md §8 لجدول الأنواع الكامل.
 */

export const USER_ROLE = ["farmer", "supervisor", "vet", "owner", "platform_admin"] as const;
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

export const PRODUCT_CATEGORY = ["علف", "دواء", "لقاح", "فيتامين", "مستلزمات"] as const;
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
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPE)[number];

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

/** نوع الموقع في دفتر المخزون — القيدان المذكوران حرفيًا في قيد CHECK بـ §7.3. */
export const LOCATION_TYPE = ["warehouse", "house"] as const;
export type LocationType = (typeof LOCATION_TYPE)[number];

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
