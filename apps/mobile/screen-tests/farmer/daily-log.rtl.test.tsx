import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, fireEvent, screen, waitFor } from "@testing-library/react-native";

import FarmerDailyLog from "@/app/(farmer)/daily-log";
import * as dailyLogApi from "@/lib/dailyLogApi";
import * as infra from "@/lib/infrastructureApi";
import * as session from "@/lib/session";
import { renderWithSafeArea } from "@/test-utils/rtl";

/**
 * **شاشة السجل اليوميّ — الحالات الأربع ونصوصها** (§8.17).
 *
 * **والنموذج الخالص مفحوص وحده** في `lib/dailyLogForm.rtl.test.tsx`؛ **هنا
 * يُفحص ما يراه المربّي**: أيّ حالةٍ تظهر متى، **وبأيّ جملةٍ ومدخلِ فعل**.
 *
 * **والفارغةُ هي الغالبة اليوم** — فلها شاهدان لا واحد: عنبرٌ بلا دفعة، وعنبرٌ
 * دفعتُه «قيد الوصول» ولم تُؤكَّد.
 */
configure({ asyncUtilTimeout: 20_000 });

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/session", () => ({
  readToken: jest.fn(),
  saveToken: jest.fn(),
  clearToken: jest.fn(),
}));

const sitesSpy = jest.spyOn(infra, "fetchSites");
const farmsSpy = jest.spyOn(infra, "fetchFarms");
const housesSpy = jest.spyOn(infra, "fetchHouses");
const batchesSpy = jest.spyOn(dailyLogApi, "fetchHouseBatches");
const productsSpy = jest.spyOn(dailyLogApi, "fetchProducts");
const submitSpy = jest.spyOn(dailyLogApi, "submitDailyLog");

function house(waterTankCapacityL: string | null = "1000"): infra.HouseCard {
  return {
    id: 5,
    farmId: 1,
    name: "العنبر الشمالي",
    type: null,
    status: "مشغول",
    waterTankCapacityL,
  };
}

function batch(status: string): dailyLogApi.BatchCard[] {
  return [
    {
      id: 3,
      houseId: 5,
      breed: "Ross 308",
      status,
      startDate: "2026-09-01",
      receivedBirdCount: 4800,
    },
  ];
}

const starterFeed: dailyLogApi.ProductCard = {
  id: 11,
  category: "علف",
  name: "علف بادئ",
  feedStage: "بادئ",
  stockUnit: "كيس",
  packageSize: 50,
  packageUnit: "كجم",
};

const clients: QueryClient[] = [];

/** نتيجةُ حفظٍ ناجح — **تُكتب مرة واحدة** ويُعاد استعمالها. */
const SAVED: dailyLogApi.DailyLogResult = {
  dailyLogId: 1,
  batchId: 3,
  logDate: "2026-09-03",
  duplicate: false,
  waterLiters: null,
  avgWeightG: null,
  feedKgTotal: 0,
  negativeBalances: [],
};

/** يعرض الشاشة على دفعةٍ نشطة وينتظر ظهور زرّ الحفظ. */
async function renderWithActiveBatch(): Promise<void> {
  batchesSpy.mockResolvedValue(batch("نشطة"));
  renderScreen();
  await waitFor(() => {
    expect(screen.getByText("حفظ السجل")).toBeTruthy();
  });
}

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  clients.push(client);
  return renderWithSafeArea(
    <QueryClientProvider client={client}>
      <FarmerDailyLog />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (session.readToken as jest.Mock).mockResolvedValue("token");
  sitesSpy.mockResolvedValue([{ id: 1, name: "الموقع", farmCount: 1, houseCount: 1 }]);
  farmsSpy.mockResolvedValue([
    {
      id: 1,
      siteId: 1,
      name: "المزرعة",
      powerSources: ["مولدات"],
      houseCount: 1,
      houseStatusCounts: { occupied: 1, ready: 0, other: 0 },
    },
  ]);
  housesSpy.mockResolvedValue([house()]);
  productsSpy.mockResolvedValue([starterFeed]);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe("الحالة الفارغة — وهي الغالبة اليوم", () => {
  it("عنبرٌ بلا دفعة: الجملةُ تقول لماذا، ومدخلُ الفعل يفتح الاستلام", async () => {
    batchesSpy.mockResolvedValue([]);
    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("عنبرك بلا دفعة نشطة — التسجيل يبدأ بعد أن تصل الطيور وتؤكّد استلامها")
      ).toBeTruthy();
    });
    fireEvent.press(screen.getByText("الذهاب إلى الاستلام"));
    expect(mockNavigate).toHaveBeenCalledWith("/(farmer)/receiving");
  });

  it("ودفعةٌ «قيد الوصول» جملتُها أخصّ — فمن ينتظر تأكيده غيرُ من لم تصله شحنة", async () => {
    batchesSpy.mockResolvedValue(batch("قيد الوصول"));
    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("شحنتك وصلت ولم تؤكّد استلامها بعد — التسجيل يبدأ بعد التأكيد")
      ).toBeTruthy();
    });
  });

  it("ومن لا عنبر له يُقال له ذلك — لا يُترك أمام نموذجٍ لا يعمل", async () => {
    housesSpy.mockResolvedValue([]);
    batchesSpy.mockResolvedValue([]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("لا عنبر مُسند إليك بعد — راجع مشرفك ليُسنده")).toBeTruthy();
    });
  });
});

describe("حالة الخطأ — السببُ وإعادةُ المحاولة", () => {
  it("انقطاعُ الشبكة يُقال شبكةً لا عطبًا، ومعه زرُّ إعادة", async () => {
    batchesSpy.mockRejectedValue(
      new dailyLogApi.DailyLogRequestError({ status: null, code: null })
    );
    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("تعذّر الاتصال بالخادم — تحقّق من الشبكة ثم أعد المحاولة")
      ).toBeTruthy();
    });
    expect(screen.getByText("إعادة المحاولة")).toBeTruthy();
  });
});

describe("الحالة العادية — النموذج", () => {
  it("يعرض العنبر ودفعتَه، ولا يعرض المشترى: المربّي أعمى عنه (276)", async () => {
    batchesSpy.mockResolvedValue(batch("نشطة"));
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("العنبر الشمالي")).toBeTruthy();
    });
    expect(screen.getByText("عدد الطيور المستلم: 4800")).toBeTruthy();
    // **الحقلُ المحجوب غائبٌ بالاسم** — والخادم لا يرسله للمربّي أصلًا (280)
    expect(screen.queryByText(/المشترى/)).toBeNull();
  });

  it("وحقلُ الماء يُخفى كلَّه لعنبرٍ بلا سعة خزان — والخادم يردّه بـ422", async () => {
    batchesSpy.mockResolvedValue(batch("نشطة"));
    housesSpy.mockResolvedValue([house(null)]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("النفوق")).toBeTruthy();
    });
    expect(screen.queryByText("الماء")).toBeNull();
    expect(screen.queryByText("عدد الخزانات")).toBeNull();
  });

  it("ويظهر حين لها سعة", async () => {
    batchesSpy.mockResolvedValue(batch("نشطة"));
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("عدد الخزانات")).toBeTruthy();
    });
  });

  it("والصورةُ والصوتُ غائبان — مؤجَّلان بحدٍّ معلن حتى يُبنى أوّلُ مسار رفع", async () => {
    batchesSpy.mockResolvedValue(batch("نشطة"));
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("ملاحظات")).toBeTruthy();
    });
    expect(screen.queryByText(/صورة/)).toBeNull();
    expect(screen.queryByText(/صوتية/)).toBeNull();
  });

  it("والحفظ يُرسل ما بُني ثم يُظهر ما حُفظ", async () => {
    submitSpy.mockResolvedValue(SAVED);
    await renderWithActiveBatch();
    fireEvent.press(screen.getByText("حفظ السجل"));

    await waitFor(() => {
      expect(screen.getByText("حُفظ سجل اليوم")).toBeTruthy();
    });
    const [, body] = submitSpy.mock.calls[0] ?? [];
    expect(body?.houseId).toBe(5);
    expect(body?.mortalityCount).toBe(0);
  });
});

/**
 * **عطالةُ إعادة الإرسال** — **مفصولةٌ في وصفٍ مستقلّ لأن الحدّ يُحترم
 * بالفصل لا برفعه** (`max-lines-per-function` على كتلة `describe`).
 */
describe("العطالة — المعرّف لا الزرّ", () => {
  /**
   * **العطالةُ في المعرّف لا في الزرّ** (§14.1): إعادةُ الإرسال بعد فشلٍ
   * **تحمل نفس `clientId`** — **فطلبٌ وصل ثم انقطعت شبكتُه لا يُنشئ سجلًّا
   * ثانيًا**. **وتوليدُه في كل ضغطةٍ يُبطل العطالة من أصلها.**
   */
  it("وإعادةُ الإرسال بعد فشلٍ تحمل نفس معرّف العميل", async () => {
    batchesSpy.mockResolvedValue(batch("نشطة"));
    submitSpy.mockRejectedValue(new dailyLogApi.DailyLogRequestError({ status: null, code: null }));
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("حفظ السجل")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("حفظ السجل"));
    // **يُنتظر استقرارُ الفشل لا مجرّدُ الاستدعاء**: الزرّ معطَّلٌ ما دام
    // الحفظ جاريًا (§8.2)، فضغطةٌ ثانيةٌ قبل ذلك لا تفعل شيئًا
    await waitFor(() => {
      expect(
        screen.getByText("تعذّر الاتصال بالخادم — تحقّق من الشبكة ثم أعد المحاولة")
      ).toBeTruthy();
    });
    fireEvent.press(screen.getByText("حفظ السجل"));
    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(2);
    });

    const [first, second] = submitSpy.mock.calls;
    expect(first?.[1].clientId).toBe(second?.[1].clientId);
  });

  it("وسجلٌّ جديد بعد نجاحٍ يأخذ معرّفًا آخر — فلا يُقرأ مكرَّرًا", async () => {
    submitSpy.mockResolvedValue(SAVED);
    await renderWithActiveBatch();
    fireEvent.press(screen.getByText("حفظ السجل"));
    await waitFor(() => {
      expect(screen.getByText("سجل يوم آخر")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("سجل يوم آخر"));
    await waitFor(() => {
      expect(screen.getByText("حفظ السجل")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("حفظ السجل"));
    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(2);
    });

    const [first, second] = submitSpy.mock.calls;
    expect(first?.[1].clientId).not.toBe(second?.[1].clientId);
  });

  it("وسجلُّ اليوم المحفوظ سلفًا واقعةٌ تُقال لا شاشةُ خطأ", async () => {
    submitSpy.mockRejectedValue(
      new dailyLogApi.DailyLogRequestError({ status: 409, code: "duplicate" })
    );
    await renderWithActiveBatch();
    fireEvent.press(screen.getByText("حفظ السجل"));

    await waitFor(() => {
      expect(
        screen.getByText("سجل اليوم محفوظ بالفعل — لا يُسجَّل يومان لنفس الدفعة")
      ).toBeTruthy();
    });
  });
});
