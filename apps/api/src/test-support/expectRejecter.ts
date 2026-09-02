import type { Response } from "supertest";
import { expect } from "vitest";

/**
 * يؤكّد **الرادَّ** لا الحالةَ وحدها (القرار 271): الرمزَ، **وجزءًا من رسالته
 * حين يكون الرمزُ ملتبسًا** (`forbidden` تُرمى من خمسة ملفات، و`not_found` من
 * سبعة عشر).
 *
 * **فيسقط الاختبار إن كان الرادُّ غير الذي سمّاه عنوانُه** — **وهو التصديق
 * الثاني الذي يُغني عن المِسبار المؤقّت الذي اشتُقّت منه الأسماء.**
 */
export function expectRejecter(res: Response, code: string, messageFragment?: string): void {
  expect((res.body as { code: string }).code).toBe(code);
  if (messageFragment !== undefined) {
    expect((res.body as { message: string }).message).toContain(messageFragment);
  }
}
