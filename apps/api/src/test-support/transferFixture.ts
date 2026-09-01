import { type Database } from "@dawajin/db";

import { seedTenant, seedUser } from "./hierarchy";

/**
 * فاعلو دفعة التحويل — **مشرفان لإثبات شرط #159 «ثانيًا»**، ومربٍّ وأمين مخزن
 * ومالك. **مفصولةٌ عن ملف الاختبار** كتجهيزتَي 221 و223: الملف تجاوز حدّ
 * الأسطر، **والحدّ يُحترم بالفصل لا برفعه**.
 */
export interface SeededActors {
  tenantId: number;
  ownerToken: string;
  supervisorToken: string;
  supervisorId: number;
  otherSupervisorToken: string;
  otherSupervisorId: number;
  farmerToken: string;
  farmerId: number;
  storekeeperToken: string;
}

/** المستأجر وخمسة فاعلين — مشرفان لإثبات شرط #159 «ثانيًا». */
export async function seedActors(
  db: Database,
  secret: string,
  label: string
): Promise<SeededActors> {
  const tenantId = await seedTenant(db, label);
  const { token: ownerToken } = await seedUser(db, { tenantId, role: "owner", secret });
  const { token: supervisorToken, id: supervisorId } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret,
  });
  const { token: otherSupervisorToken, id: otherSupervisorId } = await seedUser(db, {
    tenantId,
    role: "supervisor",
    secret,
  });
  const { token: farmerToken, id: farmerId } = await seedUser(db, {
    tenantId,
    role: "farmer",
    secret,
  });
  const { token: storekeeperToken } = await seedUser(db, {
    tenantId,
    role: "storekeeper",
    secret,
  });
  return {
    tenantId,
    ownerToken,
    supervisorToken,
    supervisorId,
    otherSupervisorToken,
    otherSupervisorId,
    farmerToken,
    farmerId,
    storekeeperToken,
  };
}
