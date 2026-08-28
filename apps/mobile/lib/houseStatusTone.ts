import {
  Ban,
  CircleCheckBig,
  CircleHelp,
  DoorClosed,
  DoorOpen,
  Hourglass,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";

/**
 * **محور الإنتاج** — أربع فئات تصف موقع العنبر من دورة الإنتاج، لا درجة خطر
 * (قرار المالك، القرار رقم 178):
 *
 * | الفئة | المعنى |
 * |---|---|
 * | `producing` | يُنتج الآن |
 * | `preparing` | يُجهَّز — إخلاء أو تنظيف |
 * | `idle` | جاهز وساكن — راحة أو جاهز للإسكان |
 * | `outOfService` | خارج الخدمة — صيانة أو معطّل |
 */
export type HouseStatusTone = "producing" | "preparing" | "idle" | "outOfService";

/**
 * فئة حالة العنبر — **جدول صريح لا شرط متفرّع**، فحالة جديدة في المخطط تظهر
 * هنا فورًا بدل أن تسقط في فئة افتراضية صامتة.
 *
 * الحالات السبع من `HOUSE_STATUS` المشترك (docs/app-complete-spec.md §3.3).
 * القيمة غير المعروفة تأخذ `preparing` عمدًا: **لون يلفت لا لون «يُنتج»** —
 * حالة لا يعرفها التطبيق يجب أن تلفت لا أن تمرّ.
 */
const STATUS_TONE: Record<string, HouseStatusTone> = {
  مشغول: "producing",
  "تحت الإخلاء": "preparing",
  "تحت التنظيف والتطهير": "preparing",
  "في فترة الراحة": "idle",
  "جاهز للإسكان": "idle",
  "تحت الصيانة": "outOfService",
  معطّل: "outOfService",
};

export function houseStatusTone(status: string): HouseStatusTone {
  return STATUS_TONE[status] ?? "preparing";
}

/**
 * أيقونة حالة العنبر — **جدول ثانٍ بنفس مفاتيح الأول**، لأن شارة الحالة
 * تحمل لونًا وأيقونة ونصًّا معًا دائمًا (§8.1، §11: الاعتماد على اللون وحده
 * ممنوع لأن عمى الألوان شائع).
 *
 * والقيمة غير المعروفة تأخذ علامة استفهام لا أيقونة سليمة — تلفت ولا تمرّ،
 * كما في `houseStatusTone`.
 */
const STATUS_ICON: Record<string, LucideIcon> = {
  مشغول: DoorClosed,
  "تحت الإخلاء": DoorOpen,
  "تحت التنظيف والتطهير": Sparkles,
  "في فترة الراحة": Hourglass,
  "جاهز للإسكان": CircleCheckBig,
  "تحت الصيانة": Wrench,
  معطّل: Ban,
};

export function houseStatusIcon(status: string): LucideIcon {
  return STATUS_ICON[status] ?? CircleHelp;
}

/**
 * **تسمية عرض قصيرة** لمربّع الشبكة — **جدول ثالث بنفس مفاتيح الأولين**.
 *
 * **والتسمية الكاملة تبقى كما هي** في القوائم والتفاصيل والشارات: هذا الجدول
 * للشبكة وحدها، حيث العمود 114px على عرض 390 فلا يتّسع لـ«تحت التنظيف
 * والتطهير» إلا بثلاثة أسطر (مقيس).
 *
 * **وهي اختيار تسمية لا اقتطاعًا أعمى**: لا حرف يُقصّ ولا «…» تظهر — كل قيمة
 * كلمة كاملة أقرّها المالك.
 *
 * **وثلاث من الحالات السبع تشترك في نغمة `warning`** (إخلاء · تنظيف · راحة)
 * فتتّحد ألوانها في الشبكة — **فاللون يجمّع والتسمية تميّز**. وهذا وحده يكفي
 * لرفض دليل ألوان يحلّ محلّ النص داخل المربّع (§11).
 */
const STATUS_SHORT_LABEL: Record<string, string> = {
  مشغول: "مشغول",
  "تحت الإخلاء": "إخلاء",
  "تحت التنظيف والتطهير": "تنظيف",
  "في فترة الراحة": "راحة",
  "جاهز للإسكان": "جاهز",
  "تحت الصيانة": "صيانة",
  معطّل: "معطّل",
};

export function houseStatusShortLabel(status: string): string {
  return STATUS_SHORT_LABEL[status] ?? "غير معروفة";
}
