import type { Database } from "@dawajin/db";
import type { Logger } from "pino";

import {
  assertBootstrapEnvironment,
  assignDemoScope,
  bootstrapAccounts,
  ensureDemoPartners,
} from "./accounts";
import { DEMO_ACCOUNTS, type DemoAccount } from "./fixtures";
import { startSeedClient } from "./httpClient";
import {
  login,
  seedChickArrival,
  seedHierarchy,
  type ChickArrivalSeed,
  type SeedCounts,
} from "./seedViaApi";
import { createApp } from "../../app";
import type { Env } from "../../lib/env";

/**
 * تنسيق البذر — **خطوتان بحدٍّ صريح بينهما**:
 * **(١) تهيئة الحسابات** بإدراج مباشر معزول في `accounts.ts` (القرار #163).
 * **(٢) كل ما بعدها عبر الـAPI** بصلاحية المالك وطلبات HTTP حقيقية.
 */

export interface SeedDemoInput {
  readonly db: Database;
  readonly env: Env;
  readonly logger: Logger;
  readonly password: string;
  readonly tenantName: string;
}

export interface SeedDemoResult {
  readonly tenantId: number;
  readonly counts: SeedCounts | undefined;
  readonly alreadySeeded: boolean;
  /** **سلسلةُ الاستقبال كما نفَّذتها الأدوار** — غائبةٌ حين يكون مبذورًا سابقًا. */
  readonly arrival: ChickArrivalSeed | undefined;
}

/** رقمُ حسابٍ من قائمة العرض بمفتاحه — **ثلاثةٌ تدخل الآن لا واحد** (285). */
function phoneOf(key: DemoAccount["key"]): string {
  const account = DEMO_ACCOUNTS.find((one) => one.key === key);
  if (account === undefined) throw new Error(`[seed:demo] حساب العرض غير معرَّف: ${key}`);
  return account.phone;
}

/**
 * يبذر بيانات العرض كاملة.
 *
 * **عطالة على مستوى المستأجر**: وجوده يعني أن الهرم مبذور، فيُرجَع بلا عمل.
 * @returns معرّف المستأجر والأعداد المبذورة، أو علامة «مبذور سابقًا»
 * @throws Error خارج بيئتَي التطوير والاختبار
 */
export async function seedDemo(input: SeedDemoInput): Promise<SeedDemoResult> {
  const { db, env, logger, password, tenantName } = input;
  assertBootstrapEnvironment(env.NODE_ENV);

  const bootstrap = await bootstrapAccounts({
    db,
    tenantName,
    password,
    bcryptRounds: env.BCRYPT_ROUNDS,
  });
  if (!bootstrap.created) {
    return {
      tenantId: bootstrap.tenantId,
      counts: undefined,
      alreadySeeded: true,
      arrival: undefined,
    };
  }

  const client = await startSeedClient(createApp(db, env, logger));
  try {
    const tenantId = bootstrap.tenantId;
    const signIn = (key: DemoAccount["key"]): Promise<string> =>
      login(client, phoneOf(key), password, tenantId);

    const owner = await signIn("owner");
    const counts = await seedHierarchy(client, owner);

    // **الإسنادُ قبل السلسلة لا بعدها** — المشرف يوزّع على مزرعةٍ مُسندة إليه
    // والمربّي يؤكّد في عنبرٍ مُسندٍ له، **والفرضُ المركزيّ يردّ ما دون ذلك**
    await assignDemoScope(
      {
        db,
        tenantId,
        supervisorId: bootstrap.userIds.supervisor,
        vetId: bootstrap.userIds.vet,
        farmerId: bootstrap.userIds.farmer,
      },
      counts.farmIds,
      counts.houseIds
    );

    const partners = await ensureDemoPartners(db, tenantId);
    const arrival = await seedChickArrival(
      client,
      { owner, supervisor: await signIn("supervisor"), farmer: await signIn("farmer") },
      counts.houseIds,
      partners
    );

    return { tenantId, counts, alreadySeeded: false, arrival };
  } finally {
    await client.close();
  }
}
