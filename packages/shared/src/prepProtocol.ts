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
