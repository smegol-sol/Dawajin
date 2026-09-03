import { apiClient } from "./api";
import { toApiFailure } from "./apiError";
import type { LoginFailure } from "./authErrors";
import { fetchFarms, fetchHouses, fetchSites, type HouseCard } from "./infrastructureApi";

/**
 * نقاطُ شاشة السجل اليوميّ — **قراءةُ الدفعة والأصناف، وكتابةُ السجلّ**.
 *
 * **ولا تحرس هذه الطبقة شيئًا:** الفرضُ كلُّه في `POST /api/daily-logs`
 * (المربّي وحده · عنبرُه المُسند · دفعةٌ نشطة · سجلٌّ واحد لليوم) — **وما
 * يُخفى في الواجهة ليس حراسة**. **وما هنا عرضٌ لما يسمح به الخادم لا بديلٌ
 * عنه.**
 */

/** فشلُ طلبٍ في هذه الشاشة — نفس تمييز `apiError`: `status: null` يعني لا شبكة. */
export class DailyLogRequestError extends Error {
  readonly failure: LoginFailure;

  constructor(failure: LoginFailure) {
    super(`daily log request failed: ${String(failure.status)} ${failure.code ?? "-"}`);
    this.name = "DailyLogRequestError";
    this.failure = failure;
  }
}

function fail(error: unknown): never {
  throw new DailyLogRequestError(toApiFailure(error));
}

function auth(token: string): { headers: { Authorization: string } } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** دفعةُ عنبرٍ كما يراها حاملُ الرمز — **والمربّي بلا `purchasedBirdCount`** (القرار 276). */
export interface BatchCard {
  id: number;
  houseId: number;
  breed: string;
  status: string;
  startDate: string | null;
  receivedBirdCount: number | null;
}

/** صنفٌ يدخل مخزن العنبر — **ووزنُ العبوة ووحدتُه معًا** (القرار 201). */
export interface ProductCard {
  id: number;
  category: string;
  name: string;
  feedStage: string | null;
  stockUnit: string;
  packageSize: number | null;
  packageUnit: string | null;
}

/** `GET /houses/:houseId/batches` — دفعاتُ العنبر، الأحدثُ أولًا. */
export async function fetchHouseBatches(token: string, houseId: number): Promise<BatchCard[]> {
  const response = await apiClient
    .get<{ batches?: BatchCard[] }>(`/houses/${String(houseId)}/batches`, auth(token))
    .catch(fail);
  return response.data.batches ?? [];
}

/** `GET /products` — أصنافُ مخزن العنبر النشطة (القرار 231). */
export async function fetchProducts(token: string): Promise<ProductCard[]> {
  const response = await apiClient
    .get<{ products?: ProductCard[] }>("/products", auth(token))
    .catch(fail);
  return response.data.products ?? [];
}

/**
 * **عنابرُ حامل الرمز — تُجمَع بثلاث نداءات متتابعة** (الموقع ← المزرعة ←
 * العنبر)، **وكلُّها مفلترةٌ بالإسناد في الخادم** (القراران #129 و#131) **فما يعود هو
 * عنابرُه وحدها**.
 *
 * **وحدٌّ معلن (قاعدة 268): لا مسار يُرجع عنابر المستخدم مباشرةً اليوم** —
 * **لا `GET /api/houses` مسطَّح** (مقيس: ١٩ مسار `GET` مسجَّلًا، القرار 281).
 * **ويسقط الحدُّ يوم يُبنى مسارٌ يُرجعها في نداءٍ واحد**، فتُستبدل هذه
 * الدالّة به ولا يتغيّر ما فوقها.
 *
 * **ولا تُجمَع أكثرُ من مزرعةٍ لكل موقع ولا أكثرُ من موقع بالتوازي عمدًا:**
 * الشبكةُ في العنبر ضعيفة، **والتتابعُ يُبقي عددَ الطلبات مقروءًا**.
 */
export async function fetchAssignedHouses(token: string): Promise<HouseCard[]> {
  const houses: HouseCard[] = [];
  for (const site of await fetchSites(token)) {
    for (const farm of await fetchFarms(token, site.id)) {
      houses.push(...(await fetchHouses(token, farm.id)));
    }
  }
  return houses;
}

/** صفُّ علفٍ في الطلب — **بالأكياس لا بالكجم** (القرار 201). */
export interface DailyLogFeedRow {
  productId: number;
  feedStage: string;
  bags: number;
}

/** جسمُ `POST /daily-logs` — **بلا حقلٍ محسوب** (§15): الكجم واللتر والمتوسط تُحسب في الخادم. */
export interface DailyLogRequest {
  houseId: number;
  logDate: string;
  mortalityCount: number;
  mortalityCause?: string;
  waterTanks?: number;
  sampledBirds?: number;
  sampledWeightKg?: number;
  temperatureC?: number;
  humidityPct?: number;
  notes?: string;
  clientId: string;
  feedRows: DailyLogFeedRow[];
}

export interface DailyLogResult {
  dailyLogId: number;
  batchId: number;
  logDate: string;
  duplicate: boolean;
  waterLiters: number | null;
  avgWeightG: number | null;
  feedKgTotal: number;
  negativeBalances: { productId: number; balance: number }[];
}

/** `POST /daily-logs` — **والمكرَّر يعود بـ200 و`duplicate: true`** (§14.1). */
export async function submitDailyLog(
  token: string,
  body: DailyLogRequest
): Promise<DailyLogResult> {
  const response = await apiClient
    .post<DailyLogResult>("/daily-logs", body, auth(token))
    .catch(fail);
  return response.data;
}
