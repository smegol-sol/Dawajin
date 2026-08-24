import { HttpError } from "@dawajin/shared";
import { ZodError, z } from "zod";

/**
 * يحوّل ZodError (فشل .parse() في أي route) إلى 400 برسالة عربية عامة
 * وتفاصيل الحقول في details (§18: "رسالة عربية جاهزة للعرض دائمًا" — رسائل
 * zod الافتراضية إنجليزية، فتبقى في details كتفصيل تقني لا كرسالة عرض
 * أساسية). القرار #62: بلا هذا التحويل كل فشل تحقق كان يصل 500 عام لا 400
 * محدَّد — خطأ حقيقي اكتُشف أثناء بناء فاحص "لا نص إنجليزي في رسالة خطأ".
 */
export function translateZodError(error: unknown): HttpError | null {
  if (!(error instanceof ZodError)) return null;
  return new HttpError(400, "invalid_input", "بيانات غير صالحة", z.flattenError(error).fieldErrors);
}
