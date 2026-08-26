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
