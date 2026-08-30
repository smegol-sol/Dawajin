import { createDbClient, platformAdmins } from "@dawajin/db";
import { normalizePhoneE164, PLATFORM_MIN_PASSWORD_LENGTH } from "@dawajin/shared";
import bcrypt from "bcryptjs";

import { loadEnv } from "../lib/env";
import { generateTotpSecret, totpEnrollmentUri } from "../lib/platformTotp";
import { generateTemporaryPassword } from "../lib/tempPassword";

/**
 * إنشاء حساب مدير منصة — **سكربت لا مسار API** (القرار #147 حرفيًّا: «الحساب
 * الوحيد في النظام الذي لا يُنشئه أحد من داخل التطبيق»)، **وخارج قاعدة البذر
 * عبر الـAPI (#27) لأنه ليس بيانات مستأجر**.
 *
 * **ويُنفَّذ على الخادم بيد من يملكه** — نفس مستوى الوصول الذي يصفه القرار 187:
 * «من يملك خادم الإنتاج يملك المنصة».
 *
 * **ويطبع الكلمة المؤقتة وسرّ TOTP مرة واحدة ولا يخزّنهما بنصّهما**: الكلمة
 * تُجزَّأ قبل الكتابة، والسرّ يُكتب لأن التحقق يحتاجه — **ولا يُقرأ في أي مسار
 * قراءة بعدها**.
 *
 * **والسرّ يُمسح على جهازين عند الإنشاء** (القرار 188): **سرّ واحد وجهازان**،
 * فضياع أحدهما لا يقفل الحساب.
 *
 * ```bash
 * pnpm --filter @dawajin/api run platform:create-admin -- "الاسم الكامل" 770000000
 * ```
 */

function readArgs(): { fullName: string; phone: string } {
  const [fullName, phone] = process.argv.slice(2);
  if (!fullName || !phone) {
    throw new Error(
      '[platform:create-admin] الاستعمال: platform:create-admin -- "الاسم الكامل" 770000000'
    );
  }
  return { fullName, phone };
}

async function main(): Promise<void> {
  const env = loadEnv();
  const { fullName, phone } = readArgs();
  const phoneE164 = normalizePhoneE164(phone, env.DEFAULT_COUNTRY_CODE);
  const { pool, db } = createDbClient(env.DATABASE_URL);

  try {
    const temporaryPassword = generateTemporaryPassword();
    const totpSecret = generateTotpSecret();

    const [created] = await db
      .insert(platformAdmins)
      .values({
        fullName,
        phone,
        phoneE164,
        passwordHash: await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS),
        totpSecret,
        mustChangePassword: true,
      })
      .returning({ id: platformAdmins.id });
    if (!created) throw new Error("[platform:create-admin] تعذّر إنشاء الحساب");

    console.log(`\n[platform:create-admin] أُنشئ الحساب رقم ${String(created.id)} — ${fullName}`);
    console.log("هذه المخرجات تُعرض مرة واحدة ولا تُسترجَع:\n");
    console.log(`  الجوال:           ${phoneE164}`);
    console.log(`  كلمة مرور مؤقتة:  ${temporaryPassword}`);
    console.log(`  سرّ TOTP:          ${totpSecret}`);
    console.log(`  رابط التسجيل:      ${totpEnrollmentUri(totpSecret, phoneE164)}\n`);
    console.log(
      `  امسح الرابط على **جهازين** (القرار 188)، وبدّل الكلمة المؤقتة عند أول دخول ` +
        `بكلمة لا تقل عن ${String(PLATFORM_MIN_PASSWORD_LENGTH)} محرفًا.\n`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
