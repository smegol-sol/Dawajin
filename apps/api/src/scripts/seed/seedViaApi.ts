import { SITES } from "./fixtures";
import type { SeedHttpClient } from "./httpClient";

/**
 * إنشاء الهرم كاملًا **عبر الـAPI بصلاحية المالك** — الموقع ← المزرعة ←
 * العنبر. لا إدراج مباشر هنا إطلاقًا؛ التهيئة الوحيدة في `accounts.ts`.
 */

interface LoginResponse {
  readonly token: string;
}

interface CreatedEntity {
  readonly id: number;
}

export interface SeedCounts {
  readonly sites: number;
  readonly farms: number;
  readonly houses: number;
  readonly farmIds: readonly number[];
  readonly houseIds: readonly number[];
}

/** يسجّل دخول المالك بالمسار العام — أول طلب حقيقي في البذر. */
export async function loginOwner(
  client: SeedHttpClient,
  phone: string,
  password: string,
  tenantId: number
): Promise<string> {
  const result = await client.post<LoginResponse>("/api/auth/login", {
    phone,
    password,
    tenantId,
  });
  return result.token;
}

/**
 * يبذر المواقع السبعة وما تحتها.
 *
 * **بلا فحص وجود مسبق**: البذر يُستدعى بعد تهيئة مستأجر جديد فقط (انظر
 * `seedDemo`)، ومستأجر قائم يعني أن الهرم مبذور — فالعطالة في المستوى الأعلى
 * لا في كل طلب. وإعادة الإنشاء داخل مستأجر مبذور تُنتج مواقع مكرَّرة الاسم.
 *
 * @returns أعداد ما أُنشئ ومعرّفات المزارع والعنابر بترتيب الإنشاء
 */
export async function seedHierarchy(client: SeedHttpClient, token: string): Promise<SeedCounts> {
  const farmIds: number[] = [];
  const houseIds: number[] = [];

  for (const site of SITES) {
    const created = await client.post<CreatedEntity>("/api/sites", { name: site.name }, token);
    for (const farm of site.farms) {
      const farmPath = `/api/sites/${created.id.toString()}/farms`;
      const createdFarm = await client.post<CreatedEntity>(
        farmPath,
        { name: farm.name, powerSources: farm.powerSources },
        token
      );
      farmIds.push(createdFarm.id);
      for (const house of farm.houses) {
        const housePath = `/api/farms/${createdFarm.id.toString()}/houses`;
        const createdHouse = await client.post<CreatedEntity>(housePath, house, token);
        houseIds.push(createdHouse.id);
      }
    }
  }

  return {
    sites: SITES.length,
    farms: farmIds.length,
    houses: houseIds.length,
    farmIds,
    houseIds,
  };
}
