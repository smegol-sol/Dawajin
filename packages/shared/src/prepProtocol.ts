import { z } from "zod";

/**
 * شكل tenants.prep_protocol (jsonb) — خطوات دورة تجهيز العنبر مرتّبة صراحة
 * (decisions.md #55). العمود يبقى jsonb بلا مخطط قاعدة بيانات صارم، لكن كل
 * قراءة/كتابة في الخادم تمر عبر هذا المخطط.
 */
export const prepProtocolStepSchema = z.object({
  key: z.string().min(1), // يطابق house_prep_steps.step_key
  label: z.string().min(1), // نص عربي يظهر في واجهة المشرف
  required: z.boolean(),
  order: z.number().int().nonnegative(),
});
export type PrepProtocolStep = z.infer<typeof prepProtocolStepSchema>;

export const prepProtocolSchema = z.array(prepProtocolStepSchema);
export type PrepProtocol = z.infer<typeof prepProtocolSchema>;

/**
 * **البروتوكول الافتراضي — تسعُ خطوات بأسمائها وترتيبها من §3.3**، حرفيًّا
 * ولا تُختزل (القرار #153: «تبقى كما في §3.3 بأسمائها، ولا تُختزل إلى أربع»).
 *
 * **وهو افتراضٌ لا قائمةٌ مثبَّتة:** `tenants.prep_protocol` يعلوه متى كُتب —
 * **«لا تُثبَّت قائمة واحدة، كل شركة لها بروتوكولها»** (#153). **وهذا يُقرأ حين
 * تُفتح الدورة، فلا تتغيّر خطوات دورةٍ جارية بتغيير الإعداد.**
 *
 * **وحدٌّ زمنيّ يُعلَن: لا مسار يقرأ البروتوكول اليوم** — §17 من المواصفة
 * التقنية تُعلن `GET /prep-protocol` **ولم يُبنَ** (القرار 269)، **فالخطواتُ
 * تصل الشاشةَ في رد الدورة وحده**. **يسقط هذا الحدّ يوم يُسجَّل المسار.**
 * @limit no-route GET /api/prep-protocol
 *
 * **والترتيب ملزم** (القرار #55): لا تُطهَّر قبل الغسيل، **والفهرس الفريد
 * `(cycle_id, step_order)` يفرضه في القاعدة**.
 *
 * **و`required: true` للتسع جميعًا — وهذا قراءةٌ لافتراضي المخطط لا حكمُ
 * مالك:** `house_prep_steps.is_required` افتراضه `true`، **والوثيقة تقول «8-9
 * خطوة» و«عند اكتمال الإلزامية» ولا تسمّي أيّها يجوز تركه**. **فالأحوط
 * إلزامها كلها**: خطوةٌ تُترك سهوًا تفتح عنبرًا لم يكتمل تعقيمه، **وعكسه
 * يُصحَّح بإعدادٍ لا بترحيل**. **وتسميةُ المتروك قرار مالك** — §7-ب.
 */
export const DEFAULT_PREP_PROTOCOL: PrepProtocol = [
  { key: "litter-removal", label: "إخراج الفرشة", required: true, order: 0 },
  { key: "dry-clean", label: "تنظيف جاف", required: true, order: 1 },
  { key: "wash", label: "غسيل", required: true, order: 2 },
  { key: "disinfect", label: "تطهير", required: true, order: 3 },
  { key: "water-lines", label: "تطهير خطوط المياه", required: true, order: 4 },
  { key: "fumigate", label: "تبخير", required: true, order: 5 },
  { key: "equipment-check", label: "فحص معدات", required: true, order: 6 },
  { key: "bedding", label: "فرش نشارة", required: true, order: 7 },
  { key: "heating", label: "تشغيل تدفئة", required: true, order: 8 },
];
