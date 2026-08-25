import type { BadgeTone } from "@/components/ui/Badge";

/**
 * لون حالة العنبر — **جدول صريح لا شرط متفرّع**، فحالة جديدة في المخطط تظهر
 * هنا فورًا بدل أن تسقط في لون افتراضي صامت.
 *
 * الحالات السبع من `HOUSE_STATUS` المشترك (docs/app-complete-spec.md §3.3).
 * القيمة غير المعروفة تأخذ `warning` عمدًا: **لون تنبيه لا لون سليم** — حالة
 * لا يعرفها التطبيق يجب أن تلفت لا أن تمرّ.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  مشغول: "info",
  "تحت الإخلاء": "warning",
  "تحت التنظيف والتطهير": "warning",
  "في فترة الراحة": "warning",
  "جاهز للإسكان": "success",
  "تحت الصيانة": "critical",
  معطّل: "critical",
};

export function houseStatusTone(status: string): BadgeTone {
  return STATUS_TONE[status] ?? "warning";
}
