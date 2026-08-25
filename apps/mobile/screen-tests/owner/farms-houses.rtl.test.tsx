import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, configure, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackHandler } from "react-native";

import OwnerFarmsHouses from "@/app/(owner)/farms-houses";
import * as api from "@/lib/api";
import * as infra from "@/lib/infrastructureApi";
import * as session from "@/lib/session";

/**
 * شاشة المواقع والمزارع والعنابر — **التخطّي والرجوع من طرف إلى طرف**.
 *
 * النموذج الخالص مفحوص في `lib/infrastructureNavigation.rtl.test.tsx`؛ هنا
 * يُفحص أن الشاشة **تستدعيه بالبيانات الصحيحة**: التخطّي مبنيّ على العدد
 * **المرئي القادم من الخادم**، والرجوع لا يهبط في مستوى لم يُعرض.
 */

/**
 * **مهلة `waitFor` مرفوعة عمدًا — لا تجميلًا (القرار #133).**
 *
 * المهلة الافتراضية ثانية واحدة، وأول اختبار في هذا الملف يأخذ ~370ms على
 * جهاز **ذاكرة تحويل babel فيه دافئة**. وفي CI الذاكرة **باردة دائمًا**
 * (نسخة جديدة كل مرة)، فيتجاوز الثانية ويسقط — **حتميًا لا عشوائيًا**.
 *
 * مُثبَت: نفس الـcommit يمرّ محليًا ويسقط في نسخة نظيفة بتثبيت من القفل،
 * بنفس أرقام التغطية التي أظهرها CI حرفيًا. والمهلة الأطول لا تُبطئ اختبارًا
 * ناجحًا — `waitFor` تعود فور تحقق الشرط.
 */
configure({ asyncUtilTimeout: 20_000 });

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock("@/lib/session", () => ({
  readToken: jest.fn(),
  saveToken: jest.fn(),
  clearToken: jest.fn(),
}));

const sitesSpy = jest.spyOn(infra, "fetchSites");
const farmsSpy = jest.spyOn(infra, "fetchFarms");
const housesSpy = jest.spyOn(infra, "fetchHouses");
const meSpy = jest.spyOn(api, "fetchCurrentUser");

function site(id: number, name: string): infra.SiteCard {
  return { id, name, farmCount: 1, houseCount: 1 };
}
function farm(id: number, name: string): infra.FarmCard {
  return {
    id,
    siteId: 1,
    name,
    powerSources: ["مولدات"],
    houseCount: 1,
    houseStatusCounts: { occupied: 0, ready: 1, other: 0 },
  };
}
function house(id: number, name: string): infra.HouseCard {
  return { id, farmId: 1, name, type: null, status: "جاهز للإسكان", waterTankCapacityL: null };
}

/** عملاء react-query المنشأون في هذا الملف — يُنظَّفون بعد كل اختبار. */
const clients: QueryClient[] = [];

/**
 * `gcTime: 0` و`clear()` بعد كل اختبار **ضروريان لا تجميل**: عميل
 * react-query الافتراضي يحمل مؤقّت جمع مهملات خمس دقائق، فيبقى حيًّا بعد
 * انتهاء الاختبار ويمنع عامل jest من الخروج بلطف. ظهر ذلك تحذيرًا محليًا
 * وفشلًا في CI (القرار #133).
 */
function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <OwnerFarmsHouses />
    </QueryClientProvider>
  );
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.clear();
    client.unmount();
  }
});

/**
 * يضغط أول مطابقة لنصّ — الشاشة تعرض عدة بطاقات بنفس نصّ الزر، و`getByText`
 * تفشل عندها. الرمي الصريح أوضح من `!` لأنه يسمّي النص المفقود في الرسالة.
 */
function pressFirst(text: string): void {
  const [first] = screen.getAllByText(text);
  if (first === undefined) throw new Error(`لا عنصر بالنص: ${text}`);
  fireEvent.press(first);
}

type BackHandlerCallback = () => boolean;

/** آخر معالج سجّلته الشاشة — الشاشة تعيد التسجيل مع كل تغيّر في الأثر. */
let lastBackHandler: BackHandlerCallback | null = null;

/**
 * يشغّل معالج زر الرجوع العتادي كما يشغّله النظام.
 *
 * `act` لأن المعالج يغيّر حالة الشاشة — بدونها يحذّر React وقد تُقرأ النتيجة
 * قبل إعادة الرسم.
 */
function pressHardwareBack(): boolean {
  if (lastBackHandler === null) throw new Error("لم تسجّل الشاشة معالج رجوع");
  const handler = lastBackHandler;
  let handled = false;
  act(() => {
    handled = handler();
  });
  return handled;
}

beforeEach(() => {
  jest.clearAllMocks();
  (session.readToken as jest.Mock).mockResolvedValue("jwt");
  meSpy.mockResolvedValue({
    id: 1,
    tenantId: 1,
    fullName: "مالك",
    role: "owner",
    phone: "0771234567",
    isActive: true,
    mustChangePassword: false,
  });
  lastBackHandler = null;
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(((
    _event: string,
    callback: BackHandlerCallback
  ) => {
    lastBackHandler = callback;
    return { remove: jest.fn() };
  }) as never);
});

describe("التخطّي مبنيّ على العدد المرئي", () => {
  it("موقع واحد ← ينزل لمزارعه بلا ضغطة", async () => {
    sitesSpy.mockResolvedValue([site(1, "الجبل")]);
    farmsSpy.mockResolvedValue([farm(10, "مزرعة أ"), farm(11, "مزرعة ب")]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("مزرعة أ")).toBeTruthy();
    });
    // العنوان صار اسم الموقع — دليل أننا في مستوى المزارع لا المواقع
    expect(screen.getByText("الجبل")).toBeTruthy();
  });

  it("موقع واحد ومزرعة واحدة ← العنابر مباشرة، وسطر السياق ظاهر", async () => {
    sitesSpy.mockResolvedValue([site(1, "الجبل")]);
    farmsSpy.mockResolvedValue([farm(10, "مزرعة أ")]);
    housesSpy.mockResolvedValue([house(100, "عنبر 1")]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("عنبر 1")).toBeTruthy();
    });
    expect(screen.getByText("الجبل › مزرعة أ")).toBeTruthy();
  });

  it("مواقع متعددة ← لا تخطّي، تبقى قائمة المواقع", async () => {
    sitesSpy.mockResolvedValue([site(1, "الجبل"), site(2, "الوادي")]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("الجبل")).toBeTruthy();
    });
    expect(screen.getByText("الوادي")).toBeTruthy();
    expect(farmsSpy).not.toHaveBeenCalled();
  });

  it("**صفر مواقع ليس واحدًا** ← حالة فارغة لا تخطٍّ", async () => {
    sitesSpy.mockResolvedValue([]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("لا مواقع مُسندة إليك بعد")).toBeTruthy();
    });
    expect(farmsSpy).not.toHaveBeenCalled();
  });
});

describe("الرجوع لا يهبط في مستوى متخطّى", () => {
  it("كل ما فوق العنابر متخطّى ← الرجوع يغادر الشاشة", async () => {
    sitesSpy.mockResolvedValue([site(1, "الجبل")]);
    farmsSpy.mockResolvedValue([farm(10, "مزرعة أ")]);
    housesSpy.mockResolvedValue([house(100, "عنبر 1")]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("عنبر 1")).toBeTruthy();
    });
    // false = الحدث لم يُبتلَع، فيغادر النظامُ الشاشةَ كما يغادر أي تبويب
    expect(pressHardwareBack()).toBe(false);
  });

  it("مواقع متعددة ومزرعة واحدة ← الرجوع من العنابر يصل المواقع لا المزارع", async () => {
    sitesSpy.mockResolvedValue([site(1, "الجبل"), site(2, "الوادي")]);
    farmsSpy.mockResolvedValue([farm(10, "مزرعة أ")]);
    housesSpy.mockResolvedValue([house(100, "عنبر 1")]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText("عرض المزارع")).toHaveLength(2);
    });
    // اختيار موقع بيده — فالمواقع **ليست** متخطّاة
    pressFirst("عرض المزارع");

    // المزرعة واحدة ← تُخطّى المزارع تلقائيًا ونصل العنابر
    await waitFor(() => {
      expect(screen.getByText("عنبر 1")).toBeTruthy();
    });

    // الرجوع يُبتلَع (true) ويصعد **مستويين**: يقفز فوق المزارع المتخطّاة
    expect(pressHardwareBack()).toBe(true);
    await waitFor(() => {
      expect(screen.getByText("الوادي")).toBeTruthy();
    });
    expect(screen.getByText("الجبل")).toBeTruthy();
  });
});

describe("القدرات لا الأدوار، والحالات لا الانهيار", () => {
  it("دور بلا قدرة إنشاء ← لا زر إضافة ولا في الحالة الفارغة", async () => {
    meSpy.mockResolvedValue({
      id: 2,
      tenantId: 1,
      fullName: "مربّي",
      role: "farmer",
      phone: "0771234568",
      isActive: true,
      mustChangePassword: false,
    });
    sitesSpy.mockResolvedValue([]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("لا مواقع مُسندة إليك بعد")).toBeTruthy();
    });
    expect(screen.queryByText("إضافة موقع")).toBeNull();
  });

  it("المالك يرى زر الإضافة في الحالة الفارغة نفسها", async () => {
    sitesSpy.mockResolvedValue([]);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("إضافة موقع")).toBeTruthy();
    });
  });

  it("403 يُعرض كحالة برسالتها لا كانهيار", async () => {
    sitesSpy.mockResolvedValue([site(1, "الجبل"), site(2, "الوادي")]);
    farmsSpy.mockRejectedValue(
      new infra.InfrastructureRequestError({ status: 403, code: "forbidden" })
    );
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText("عرض المزارع")).toHaveLength(2);
    });
    pressFirst("عرض المزارع");

    await waitFor(() => {
      expect(screen.getByText("لم يعد هذا ضمن ما أُسند إليك — عد للقائمة السابقة")).toBeTruthy();
    });
  });
});
