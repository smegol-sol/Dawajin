import type { Database } from "@dawajin/db";
import type { Logger } from "pino";

import { assertBootstrapEnvironment, assignDemoScope, bootstrapAccounts } from "./accounts";
import { DEMO_ACCOUNTS } from "./fixtures";
import { startSeedClient } from "./httpClient";
import { loginOwner, seedHierarchy, type SeedCounts } from "./seedViaApi";
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
}

/** حساب المالك من قائمة العرض — نقطة الدخول الوحيدة إلى الـAPI. */
function ownerPhone(): string {
  const owner = DEMO_ACCOUNTS.find((account) => account.key === "owner");
  if (owner === undefined) throw new Error("[seed:demo] حساب المالك غير معرَّف في بيانات العرض");
  return owner.phone;
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
    return { tenantId: bootstrap.tenantId, counts: undefined, alreadySeeded: true };
  }

  const client = await startSeedClient(createApp(db, env, logger));
  try {
    const token = await loginOwner(client, ownerPhone(), password, bootstrap.tenantId);
    const counts = await seedHierarchy(client, token);
    await assignDemoScope(
      {
        db,
        tenantId: bootstrap.tenantId,
        supervisorId: bootstrap.userIds.supervisor,
        vetId: bootstrap.userIds.vet,
        farmerId: bootstrap.userIds.farmer,
      },
      counts.farmIds,
      counts.houseIds
    );
    return { tenantId: bootstrap.tenantId, counts, alreadySeeded: false };
  } finally {
    await client.close();
  }
}
