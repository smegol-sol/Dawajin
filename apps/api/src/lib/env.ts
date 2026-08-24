import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL غير معرَّف"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET غير معرَّف"),
  JWT_EXPIRES_IN: z.string().default("30d"),
  BCRYPT_ROUNDS: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DEFAULT_COUNTRY_CODE: z.string().default("+967"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * يقرأ ويتحقق من متغيرات البيئة، مع حارس صريح ضد أشهر خطأ نشر (الإنتاج
 * يشير لـlocalhost أو يستخدم سر JWT التطويري).
 * @returns متغيرات البيئة مُحقَّقة الشكل مع القيم الافتراضية مطبَّقة
 * @throws Error إن نقصت متغيرات مطلوبة، أو عند حارس بيئة الإنتاج
 */
export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // نقطة الإقلاع الوحيدة قبل بناء pino — env نفسه غير محمَّل بعد (LOG_LEVEL
    // يأتي منه)، فلا logger متاح هنا بنيويًا. console هو الخيار الوحيد فعليًا.
    // eslint-disable-next-line no-console
    console.error(
      "[env] متغيرات بيئة ناقصة أو غير صالحة:",
      z.flattenError(parsed.error).fieldErrors
    );
    throw new Error("فشل تحميل متغيرات البيئة");
  }
  const env = parsed.data;

  // أشهر خطأ نشر: بناء أو تشغيل الإنتاج وهو يشير إلى قاعدة بيانات محلية
  // (backend-technical-spec.md الملحق ج — تنبيه صريح).
  if (env.NODE_ENV === "production") {
    if (/localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) {
      throw new Error(
        "DATABASE_URL يشير إلى localhost في بيئة الإنتاج — هذا خطأ نشر شائع، تحقق من القيمة المحقونة"
      );
    }
    if (env.JWT_SECRET === "dev-only-secret-change-me") {
      throw new Error("JWT_SECRET الافتراضي للتطوير مستخدم في بيئة الإنتاج");
    }
  }

  return env;
}
