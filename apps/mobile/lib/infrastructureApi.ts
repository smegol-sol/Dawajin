import { apiClient } from "./api";
import { toApiFailure } from "./apiError";
import type { LoginFailure } from "./authErrors";

/**
 * نقاط البنية التحتية (الموقع ← المزرعة ← العنبر) كما يراها **هذا المستخدم**.
 *
 * **العدّادات تأتي من الخادم محسوبة تحت فلتر الإسناد (القرار #131)، وتُعرض
 * كما هي.** لا يُعاد حساب أي عدد هنا ولا تُجلب المزارع لتُعدّ: العميل لا يرى
 * ما حُجب عنه أصلًا، فأي عدّ محلي سيكون **أقل** من الحقيقة المرئية لا أدقّ
 * منها، وسيصير مصدر حقيقة ثانيًا يتباعد عن الأول.
 */

/** فشل طلب بنية تحتية — نفس تمييز `apiError`: `status: null` يعني لا شبكة. */
export class InfrastructureRequestError extends Error {
  readonly failure: LoginFailure;

  constructor(failure: LoginFailure) {
    super(`infrastructure request failed: ${String(failure.status)} ${failure.code ?? "-"}`);
    this.name = "InfrastructureRequestError";
    this.failure = failure;
  }
}

function fail(error: unknown): never {
  throw new InfrastructureRequestError(toApiFailure(error));
}

function auth(token: string): { headers: { Authorization: string } } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export interface SiteCard {
  id: number;
  name: string;
  farmCount: number;
  houseCount: number;
}

export interface HouseStatusCounts {
  occupied: number;
  ready: number;
  other: number;
}

export interface FarmCard {
  id: number;
  siteId: number;
  name: string;
  powerSources: string[];
  houseCount: number;
  houseStatusCounts: HouseStatusCounts;
}

export interface HouseCard {
  id: number;
  farmId: number;
  name: string;
  type: string | null;
  status: string;
  waterTankCapacityL: string | null;
}

/** `GET /sites` — مواقع المستأجر المرئية لحامل الرمز، مرتّبة بالاسم. */
export async function fetchSites(token: string): Promise<SiteCard[]> {
  const response = await apiClient.get<{ sites?: SiteCard[] }>("/sites", auth(token)).catch(fail);
  return response.data.sites ?? [];
}

/** `GET /sites/:siteId/farms` — مزارع الموقع المرئية لحامل الرمز. */
export async function fetchFarms(token: string, siteId: number): Promise<FarmCard[]> {
  const response = await apiClient
    .get<{ farms?: FarmCard[] }>(`/sites/${String(siteId)}/farms`, auth(token))
    .catch(fail);
  return response.data.farms ?? [];
}

/** `GET /farms/:farmId/houses` — عنابر المزرعة المرئية لحامل الرمز. */
export async function fetchHouses(token: string, farmId: number): Promise<HouseCard[]> {
  const response = await apiClient
    .get<{ houses?: HouseCard[] }>(`/farms/${String(farmId)}/houses`, auth(token))
    .catch(fail);
  return response.data.houses ?? [];
}

export async function createSite(token: string, name: string): Promise<void> {
  await apiClient.post("/sites", { name }, auth(token)).catch(fail);
}

export async function renameSite(token: string, siteId: number, name: string): Promise<void> {
  await apiClient.patch(`/sites/${String(siteId)}`, { name }, auth(token)).catch(fail);
}

export async function createFarm(
  token: string,
  siteId: number,
  input: { name: string; powerSources: string[] }
): Promise<void> {
  await apiClient.post(`/sites/${String(siteId)}/farms`, input, auth(token)).catch(fail);
}

export async function updateFarm(
  token: string,
  farmId: number,
  input: { name: string; powerSources: string[] }
): Promise<void> {
  await apiClient.patch(`/farms/${String(farmId)}`, input, auth(token)).catch(fail);
}

export async function createHouse(token: string, farmId: number, name: string): Promise<void> {
  await apiClient.post(`/farms/${String(farmId)}/houses`, { name }, auth(token)).catch(fail);
}

export async function renameHouse(token: string, houseId: number, name: string): Promise<void> {
  await apiClient.patch(`/houses/${String(houseId)}`, { name }, auth(token)).catch(fail);
}
