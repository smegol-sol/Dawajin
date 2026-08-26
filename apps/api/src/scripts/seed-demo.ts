import { createDbClient } from "@dawajin/db";
import pino from "pino";

import { loadEnv } from "../lib/env";
import { DEMO_ACCOUNTS } from "./seed/fixtures";
import { seedDemo } from "./seed/seedDemo";

/**
 * بيانات العرض — **المواقع السبعة وما تحتها عبر الـAPI حصريًا** (القاعدة #27،
 * مُضيَّقة بالقرار #163: الحساب تهيئة لا بيانات).
 *
 * كلمة المرور **من البيئة لا من الكود**: كلمة مثبَّتة في المستودع تصير كلمة
 * كل من نسخه، ونصٌّ حرفي هنا يخالف القرار #100 أيضًا.
 */

const TENANT_NAME = "مزارع العرض";
const ENV_PASSWORD_KEY = "SEED_DEMO_PASSWORD";

function readPassword(): string {
  const value = process.env[ENV_PASSWORD_KEY];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `[seed:demo] ${ENV_PASSWORD_KEY} غير معرَّف — ` +
        "أضفه إلى .env (القيمة الافتراضية في .env.example) ثم أعد التشغيل"
    );
  }
  return value;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const password = readPassword();
  const logger = pino({ level: "error" });
  const { pool, db } = createDbClient(env.DATABASE_URL);

  try {
    const result = await seedDemo({ db, env, logger, password, tenantName: TENANT_NAME });

    if (result.alreadySeeded) {
      console.log(`[seed:demo] «${TENANT_NAME}» مبذور سابقًا — لا تغيير.`);
    } else {
      const { sites, farms, houses } = result.counts ?? { sites: 0, farms: 0, houses: 0 };

      console.log(
        `[seed:demo] تم: ${sites.toString()} مواقع · ${farms.toString()} مزارع · ` +
          `${houses.toString()} عنابر — كلها عبر الـAPI بصلاحية المالك.`
      );
    }

    console.log("\n[seed:demo] حسابات الدخول (كلمة المرور من متغيّر البيئة):");
    for (const account of DEMO_ACCOUNTS) {
      console.log(`  ${account.phone}  —  ${account.fullName}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
