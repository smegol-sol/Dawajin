import { CHICK_ARRIVAL, SITES } from "./fixtures";
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

/**
 * يسجّل دخول حسابٍ بالمسار العام — **بحسابه هو لا برمز المالك**.
 *
 * **وهذا ما يجعل البذر برهانًا لا تعبئة** (القاعدة #27، والتوسيع 285):
 * **المشرف يصادق ويوزّع برمزه، والمربّي يؤكّد برمزه** — **فتمرّ الطلبات
 * بسلسلة الفرض كاملةً بأدوارها**: `requireRole` و`enforceEntityAccess`
 * وحرّاسُ الخدمة. **ورمزُ المالك في كل الخطوات كان سيتخطّى قسمةَ الأدوار
 * نفسَها التي بُنيت لتُمنع** (المبدأ #155).
 */
export async function login(
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

/** اسمٌ سابق يبقى للمستدعين — الدخول واحدٌ لكل الأدوار. */
export const loginOwner = login;

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

interface ShipmentCreated {
  readonly shipmentId: number;
}

/**
 * **ردُّ التأكيد كما يصل المربّي — بلا فرقٍ ولا مخصَّص** (القرار 276).
 *
 * **وهذا ليس نقصًا في الرد بل الاستلامُ الأعمى يعمل:** البذر يؤكّد **بحساب
 * المربّي**، **فلا يقرأ ما حُجب عنه** — **والفرقُ يُقرأ بعدها بحساب المالك**
 * من مسار قراءة الشحنة. **ولو قُرئ من دالّة الخدمة لتخطّى الحجبَ نفسَه.**
 */
interface ConfirmResult {
  readonly batchId: number;
  readonly countedQuantity: number;
  readonly deadOnArrival: number;
  readonly receivedBirdCount: number;
  readonly startDate: string;
}

/** التوزيعة كما يراها المالك — **وفيها المخصَّص والفرق**. */
interface OwnerDistribution {
  readonly houseId: number;
  readonly allocatedQuantity: number;
  readonly variance: number | null;
  readonly varianceStatus: string | null;
}

/**
 * تأكيدٌ واحد مع عنبره **وفرقِه المقروء بحساب المالك** — **وجمعُهما هنا هو
 * الفرقُ بين ما يراه العادّ وما يراه المحاسِب**.
 */
export interface ConfirmedHouse extends ConfirmResult {
  readonly houseId: number;
  readonly allocatedQuantity: number;
  readonly variance: number | null;
  readonly varianceStatus: string | null;
}

export interface ChickArrivalSeed {
  readonly shipmentId: number;
  /** ما أكّده المربّي فعلًا — **مقروءٌ من ردّ الخادم لا محسوبٌ هنا**. */
  readonly confirmed: readonly ConfirmedHouse[];
  /** عنابرُ وُزّعت ولم تُؤكَّد — تبقى دفعاتُها «قيد الوصول». */
  readonly arrivingHouses: number;
  /** عنبرٌ مُسندٌ للمربّي بلا دفعة إطلاقًا — **الحالة الفارغة تبقى مرئية**. */
  readonly houseWithoutBatch: number | undefined;
}

export interface ChickArrivalTokens {
  readonly owner: string;
  readonly supervisor: string;
  readonly farmer: string;
}

/**
 * **يمرّ بسلسلة الاستقبال كاملةً بأدوارها** (160 «أولًا»، والتنفيذ 275 و276).
 *
 * **المالك يُدخل الشحنة · والمشرف يصادق ويوزّع · والمربّي يؤكّد بما يعدّه** —
 * **ثلاثةُ رموزٍ لا رمزٌ واحد**، **فالبذر يبرهن أن السلسلة تعمل بأدوارها لا
 * بدوالّ الخدمة** (حكم المالك).
 *
 * **والعدّ بالصناديق رقمان لا رقم** (160 «ثانيًا»): `countedBoxes` و
 * `birdsPerBox` — **ولا حقلَ للكمية الكلية إطلاقًا**، فالحاصلُ يُحسب في
 * الخادم ولا يُرسَل.
 *
 * @returns ما أنشأته السلسلة، **مقروءًا من ردود الخادم** لا مفترضًا
 */
export async function seedChickArrival(
  client: SeedHttpClient,
  tokens: ChickArrivalTokens,
  houseIds: readonly number[],
  partners: { supplierId: number; carrierId: number }
): Promise<ChickArrivalSeed> {
  const shipment = await client.post<ShipmentCreated>(
    "/api/chick-shipments",
    {
      breed: CHICK_ARRIVAL.breed,
      supplierId: partners.supplierId,
      carrierId: partners.carrierId,
      purchasedQuantity: CHICK_ARRIVAL.purchasedQuantity,
    },
    tokens.owner
  );

  // **المصادقة والتوزيع فعلٌ واحد بيد المشرف** (275) — والمالك ممنوعٌ منه
  // صراحةً لأنه من أدخل الشحنة (المبدأ #155)
  const path = `/api/chick-shipments/${shipment.shipmentId.toString()}`;
  await client.post(
    `${path}/distribute`,
    {
      distributions: CHICK_ARRIVAL.distributions.map((one) => ({
        houseId: houseAt(houseIds, one.houseIndex),
        allocatedQuantity: one.allocatedQuantity,
      })),
    },
    tokens.supervisor
  );

  const confirmed = await confirmShares(client, tokens.farmer, path, houseIds);

  return {
    shipmentId: shipment.shipmentId,
    confirmed: await withOwnerView(client, tokens.owner, path, confirmed),
    arrivingHouses: CHICK_ARRIVAL.distributions.length - CHICK_ARRIVAL.confirmedCount,
    houseWithoutBatch: houseIds[CHICK_ARRIVAL.distributions.length],
  };
}

/** **يؤكّد الحصص بحساب المربّي** — بالصناديق لا بالكمية الكلية (160 «ثانيًا»). */
async function confirmShares(
  client: SeedHttpClient,
  farmerToken: string,
  path: string,
  houseIds: readonly number[]
): Promise<{ result: ConfirmResult; houseId: number }[]> {
  const confirmed: { result: ConfirmResult; houseId: number }[] = [];
  for (const one of CHICK_ARRIVAL.distributions.slice(0, CHICK_ARRIVAL.confirmedCount)) {
    const houseId = houseAt(houseIds, one.houseIndex);
    const result = await client.post<ConfirmResult>(
      `${path}/confirm`,
      {
        houseId,
        countedBoxes: one.countedBoxes,
        birdsPerBox: one.birdsPerBox,
        deadOnArrival: one.dead,
      },
      farmerToken
    );
    confirmed.push({ result, houseId });
  }
  return confirmed;
}

/**
 * **يضمّ المخصَّصَ والفرقَ مقروءَين بحساب المالك** — **والمربّي أعمى عنهما**
 * (276)، **فلا يُقرآن من ردّ تأكيده ولا من دالّة خدمة**.
 */
async function withOwnerView(
  client: SeedHttpClient,
  ownerToken: string,
  path: string,
  confirmed: readonly { result: ConfirmResult; houseId: number }[]
): Promise<ConfirmedHouse[]> {
  const view = await client.get<{ distributions: OwnerDistribution[] }>(path, ownerToken);
  const byHouse = new Map(view.distributions.map((one) => [one.houseId, one]));
  return confirmed.map(({ result, houseId }) => {
    const owned = byHouse.get(houseId);
    return {
      ...result,
      houseId,
      allocatedQuantity: owned?.allocatedQuantity ?? 0,
      variance: owned?.variance ?? null,
      varianceStatus: owned?.varianceStatus ?? null,
    };
  });
}

/** يقرأ عنبرًا بفهرسه — **ويسقط بصوتٍ عالٍ إن نقص**، فلا يُرسَل معرّفٌ معدوم. */
function houseAt(houseIds: readonly number[], index: number): number {
  const houseId = houseIds[index];
  if (houseId === undefined) {
    throw new Error(`[seed:demo] العنبر رقم ${index.toString()} غير مبذور`);
  }
  return houseId;
}
