import { createDbClient } from "@dawajin/db";
import { PLATFORM_MIN_PASSWORD_LENGTH } from "@dawajin/shared";

import { loadEnv } from "../lib/env";
import { emergencyResetPlatformAdminPassword } from "../services/platformAuthService";

/**
 * **مفتاح الطوارئ — الطبقة الثانية من الاسترداد** (القرار 187، والقرار 196).
 *
 * **يُنفَّذ على خادم الإنتاج مباشرة لا من الشبكة:** لا مسار API له إطلاقًا —
 * **ملاذ أخير حين تسقط الطبقة الأولى** (مديرٌ يعيد تعيين مديرٍ آخر)، لا مسار
 * عادي. **ومن يصل الخادم يملك المنصة أصلًا** (نصّ 187)، **فالغاية أن يترك
 * الاسترداد أثرًا مكتوبًا لا يُمحى.**
 *
 * ```bash
 * pnpm --filter @dawajin/api run platform:emergency-reset -- 770000000 "اسم المنفّذ"
 * ```
 */

function readArgs(): { phone: string; operator: string } {
  const [phone, operator] = process.argv.slice(2);
  if (!phone || !operator?.trim()) {
    throw new Error(
      "[platform:emergency-reset] الاستعمال: platform:emergency-reset -- 770000000 " +
        '"اسم المنفّذ"\n' +
        "  والاسم مطلوب لا اختياري — تنفيذٌ بلا اسم يجعل الأثر بلا صاحب (القرار 196)."
    );
  }
  return { phone, operator };
}

async function main(): Promise<void> {
  const env = loadEnv();
  const { phone, operator } = readArgs();
  const { pool, db } = createDbClient(env.DATABASE_URL);

  try {
    const { temporaryPassword, adminId } = await emergencyResetPlatformAdminPassword(db, env, {
      phone,
      operator,
    });

    console.log(`\n[platform:emergency-reset] أُعيد تعيين كلمة المدير رقم ${String(adminId)}`);
    console.log("هذه الكلمة تُعرض مرة واحدة ولا تُسترجَع:\n");
    console.log(`  كلمة مرور مؤقتة:  ${temporaryPassword}`);
    console.log(`  نُفِّذ بيد:          ${operator}\n`);
    console.log(
      `  الجلسة مقيَّدة بمسار التغيير حتى تُبدَّل بكلمة لا تقل عن ` +
        `${String(PLATFORM_MIN_PASSWORD_LENGTH)} محرفًا. والإجراء مكتوب في سجل التدقيق ` +
        `بوسم الطوارئ واسم المنفّذ.\n`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
