import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص تغطية OpenAPI — يفشل البناء عند مسار غير موثّق (backend-technical-spec.md §21).
 * لا عقد OpenAPI بعد (يُبنى في المرحلة 1 مع أول مسارات أعمال حقيقية) —
 * الفحص يمر الآن بلا أثر ويُفعَّل فعليًا فور إنشاء apps/api/src/openapi/.
 */
export function checkOpenApiCoverage(): { ok: boolean; message: string } {
  const openapiDir = join(process.cwd(), "apps/api/src/openapi");
  if (!existsSync(openapiDir)) {
    return {
      ok: true,
      message: "لا عقد OpenAPI بعد — سيُفعَّل هذا الفحص فعليًا في المرحلة 1 (TODO)",
    };
  }
  // TODO المرحلة 1: تحميل ملف OpenAPI ومقارنته بمسارات apps/api/src/routes فعليًا
  return { ok: true, message: "عقد OpenAPI موجود — المقارنة التفصيلية غير مُفعَّلة بعد (TODO)" };
}
