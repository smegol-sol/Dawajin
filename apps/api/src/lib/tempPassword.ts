import { randomInt } from "node:crypto";

import {
  HttpError,
  TEMP_PASSWORD_ALPHABET,
  TEMP_PASSWORD_LENGTH,
  TEMP_PASSWORD_NOT_GENERATED_MESSAGE,
  isGeneratedTemporaryPassword,
} from "@dawajin/shared";

/**
 * توليد الكلمة المؤقتة — **خادمي حصرًا**.
 *
 * لماذا هنا لا في `@dawajin/shared` رغم أن السياسة هناك: الحزمة المشتركة
 * تُستهلَك **كمصدر TypeScript خام** (`main: "./src/index.ts"`) ويحزمها Metro
 * داخل تطبيق الموبايل. أي `import "node:crypto"` فيها يدخل حزمة React Native
 * ويكسر البناء. فالسياسة والتحقق من الشكل (نقيّان) يبقيان في `packages/shared/src/tempPassword.ts`، والتوليد
 * (يحتاج مولّد عشوائية آمنًا) يعيش هنا. الموبايل لا يولّد كلمات مؤقتة إطلاقًا.
 *
 * `randomInt` من `node:crypto` لا `Math.random`: الثاني مولّد شبه‑عشوائي
 * متوقَّع تمامًا لمن يعرف حالته الداخلية، ولا يصلح لسرّ.
 */

/**
 * يولّد كلمة مؤقتة عشوائية آمنة بالشكل المعتمد.
 * @returns نص بطول `TEMP_PASSWORD_LENGTH` من الأبجدية المعتمدة (≈60 بتّة)
 */
export function generateTemporaryPassword(): string {
  let out = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
    // charAt لا الفهرسة: `noUncheckedIndexedAccess` يجعل الفهرسة
    // `string | undefined` رغم أن randomInt(n) داخل المدى دائمًا — و charAt
    // مكتوب `string` فلا يحتاج تأكيدًا غير آمن
    out += TEMP_PASSWORD_ALPHABET.charAt(randomInt(TEMP_PASSWORD_ALPHABET.length));
  }
  return out;
}

/**
 * بوابة القبول: ترفض أي كلمة مؤقتة لم تخرج من المولّد أعلاه.
 *
 * تُستدعى في **كل** مسار يُنشئ مستخدمًا بكلمة مؤقتة. مسار الإنشاء
 * (`POST /api/users`) لم يُبنَ بعد (المرحلة 4) — هذه البوابة جاهزة له،
 * ويحرسها فاحص `dawajin/no-manual-temp-password` حتى لا يُنسى استدعاؤها.
 * @throws HttpError 400 إن لم تطابق الكلمة الشكل المولَّد
 */
export function assertGeneratedTemporaryPassword(candidate: string): void {
  if (!isGeneratedTemporaryPassword(candidate)) {
    throw new HttpError(400, "temp_password_not_generated", TEMP_PASSWORD_NOT_GENERATED_MESSAGE);
  }
}
