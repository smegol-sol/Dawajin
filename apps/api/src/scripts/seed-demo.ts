import { createDbClient } from "@dawajin/db";
import pino from "pino";

import { loadEnv } from "../lib/env";
import { DEMO_ACCOUNTS } from "./seed/fixtures";
import { seedDemo, type SeedDemoResult } from "./seed/seedDemo";

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

/**
 * **ما فعلته سلسلةُ الاستقبال — مقروءًا من ردود الخادم لا محسوبًا هنا** (285).
 *
 * **والأرقام تُطبع كي تُقارَن بما يُرى على الشاشة** — فالبذر برهانٌ لا تعبئة.
 */
function printArrival(arrival: SeedDemoResult["arrival"]): void {
  if (arrival === undefined) return;
  console.log(
    `[seed:demo] سلسلة الاستقبال: شحنة #${arrival.shipmentId.toString()} — ` +
      "المالك أدخلها، والمشرف وزّعها، والمربّي أكّد بحسابه."
  );
  for (const one of arrival.confirmed) {
    // **المخصَّصُ والفرقُ مقروءان بحساب المالك** — والمربّي أعمى عنهما (276)
    const gap =
      one.variance === null
        ? "الفرق غير مقروء"
        : `المخصَّص ${one.allocatedQuantity.toString()} · الفرق ${one.variance.toString()} (${one.varianceStatus ?? "—"})`;
    console.log(
      `  دفعة #${one.batchId.toString()} — عدّ ${one.countedQuantity.toString()} · ` +
        `نافقٌ عند الوصول ${one.deadOnArrival.toString()} · ` +
        `مستلم ${one.receivedBirdCount.toString()} · ${gap}`
    );
  }
  console.log(
    `  والعنابر «قيد الوصول» بلا تأكيد: ${arrival.arrivingHouses.toString()}` +
      (arrival.houseWithoutBatch === undefined
        ? ""
        : ` · وعنبرٌ بلا دفعة إطلاقًا (#${arrival.houseWithoutBatch.toString()})`)
  );
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
        `[seed:demo] تم — مواقع: ${sites.toString()} · مزارع: ${farms.toString()} · ` +
          `عنابر: ${houses.toString()} — كلها عبر الـAPI بصلاحية المالك.`
      );
      printArrival(result.arrival);
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
