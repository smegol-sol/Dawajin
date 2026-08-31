import { spawnSync } from "node:child_process";

/**
 * فاحص سلسلة الترحيلات — `drizzle-kit check` (القرار 215).
 *
 * **العلّة واقعة لا فرضية:** لقطة `0022_snapshot.json` **نُسخت من
 * `0021_snapshot.json` كما هي** في دفعة القرار 213 — **لأن الترحيل 0022 كُتب
 * بيدٍ ولا تغيير مخطط فيه** (مُشغِّل حارس)، **فورثت معرّف أختها ومعرّف أبيها
 * معًا**. **فصار لسلسلة اللقطات أبوان لابنٍ واحد**، ورفض `drizzle-kit generate`
 * أن يولّد أي ترحيل بعدها:
 *
 * > `[0021_snapshot.json, 0022_snapshot.json] are pointing to a parent
 * > snapshot … which is a collision.`
 *
 * **ومرّت الدفعتان 212 و213 فوقها بلا أن يعترض شيء** — **لأن `check:all` لم
 * يكن يشغّل `generate` ولا `check`**، **والاختبارات تقرأ القاعدة المهجَّرة لا
 * ملفات اللقطات**. **فالعطب لا يظهر إلا لمن يحاول توليد ترحيل جديد** — وهو
 * أول عمل في المرحلة 3.
 *
 * **وهذا الفاحص هو ما كان سيمسكها:** `drizzle-kit check` **يكشف التصادم
 * ويخرج برمز 1** — أُثبت في الاتجاهين: بكسر السلسلة عمدًا سقط برسالته، وبعد
 * الإصلاح خرج بصفر.
 *
 * **ولا يحتاج اتصال قاعدة** — يقرأ ملفات `migrations/` وحدها، **بخلاف فاحص
 * المفتاح المركَّب** (القرار 206). **فيمسك انحراف الملفات عن بعضها، لا انحراف
 * الملفات عن القاعدة** — وهما عطبان مختلفان لكلٍّ فاحصه.
 */
export function checkMigrationChain(): { ok: boolean; message: string } {
  const result = spawnSync("npx", ["drizzle-kit", "check"], {
    cwd: "packages/db",
    encoding: "utf8",
    stdio: "pipe",
  });

  const output = `${result.stdout}${result.stderr}`.trim();

  if (result.status !== 0) {
    return {
      ok: false,
      message:
        `سلسلة لقطات الترحيلات مكسورة — و\`drizzle-kit generate\` لا يعمل بعدها:\n${output}\n\n` +
        "**والعلاج تصحيح `prevId` في اللقطة المخالفة لا حذف ترحيل ولا تعديل ملف `.sql`** — " +
        "الترحيلات مطبَّقة على قواعد قائمة، وتغيير ملف SQL يفتح فجوة بين المكتوب والمطبَّق.",
    };
  }

  return {
    ok: true,
    message: `سلسلة اللقطات متصلة وتطابق الترحيلات — ${output.split("\n").pop() ?? "سليمة"}`,
  };
}
