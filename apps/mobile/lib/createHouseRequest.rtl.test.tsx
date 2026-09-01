import { HOUSE_CREATABLE_STATUSES } from "@dawajin/shared";
import { AxiosHeaders } from "axios";

import { apiClient } from "@/lib/api";
import { createHouse, renameHouse } from "@/lib/infrastructureApi";

/**
 * جسمُ طلب إنشاء العنبر — §7-ب البند 40 (شقّ الشاشة)، والقرار 226.
 *
 * **والمقصود إثباتُ ما يُرسَل لا ما يُعرض:** الحالة **كما اختيرت** لا كما
 * تُفترض (القرار 186)، **والسبب لا يُرسَل فارغًا** ولا يُرسَل لحالةٍ لا
 * توجبه (القرار 222).
 */
function ok() {
  return {
    data: {},
    status: 201,
    statusText: "Created",
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
}

/** نداءات `post` مقروءةً بأنواعها — لا `any` يتسرّب إلى التأكيدات. */
type PostCall = [url: string, body: Record<string, unknown>];

function callsOf(post: jest.SpyInstance): PostCall[] {
  return post.mock.calls as PostCall[];
}

function bodyOfLastPost(post: jest.SpyInstance): Record<string, unknown> {
  return callsOf(post).at(-1)?.[1] ?? {};
}

describe("createHouse — الحالة تُرسَل كما اختيرت", () => {
  let post: jest.SpyInstance;

  beforeEach(() => {
    post = jest.spyOn(apiClient, "post").mockResolvedValue(ok());
  });

  afterEach(() => {
    post.mockRestore();
  });

  it.each(HOUSE_CREATABLE_STATUSES)("«%s» تُرسَل كما هي لا مبدَّلة", async (status) => {
    await createHouse("t", 7, { name: "عنبر", status, reason: "سبب" });
    expect(bodyOfLastPost(post).status).toBe(status);
  });

  it("**ولا قيمة افتراضية تُرسَل نيابةً عن المستخدم** — الثلاث تصل مختلفة", async () => {
    for (const status of HOUSE_CREATABLE_STATUSES) {
      await createHouse("t", 7, { name: "عنبر", status, reason: "سبب" });
    }
    const sent = callsOf(post).map((call) => call[1].status);
    expect(new Set(sent).size).toBe(HOUSE_CREATABLE_STATUSES.length);
  });

  it("المسار والاسم كما هما", async () => {
    await createHouse("t", 12, { name: "عنبر الشمال", status: "جاهز للإسكان" });
    expect(callsOf(post).at(-1)?.[0]).toBe("/farms/12/houses");
    expect(bodyOfLastPost(post).name).toBe("عنبر الشمال");
  });
});

describe("createHouse — السبب لا يُرسَل فارغًا", () => {
  let post: jest.SpyInstance;

  beforeEach(() => {
    post = jest.spyOn(apiClient, "post").mockResolvedValue(ok());
  });

  afterEach(() => {
    post.mockRestore();
  });

  it("بلا سبب إطلاقًا ← لا مفتاح `reason` في الجسم", async () => {
    await createHouse("t", 7, { name: "عنبر", status: "جاهز للإسكان" });
    expect("reason" in bodyOfLastPost(post)).toBe(false);
  });

  it("سببٌ فراغاتٌ وحدها ← لا يُرسَل", async () => {
    await createHouse("t", 7, { name: "عنبر", status: "تحت الصيانة", reason: "   " });
    expect("reason" in bodyOfLastPost(post)).toBe(false);
  });

  it("سببٌ مكتوب ← يُرسَل مُشذَّبًا", async () => {
    await createHouse("t", 7, {
      name: "عنبر",
      status: "معطّل",
      reason: "  مروحةٌ تالفة  ",
    });
    expect(bodyOfLastPost(post).reason).toBe("مروحةٌ تالفة");
  });
});

describe("renameHouse — لا يمسّ الحالة (القرار 220)", () => {
  it("جسمُ التعديل اسمٌ وحده — فتغييرُ الحالة مسارٌ آخر بآلته", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue(ok());
    try {
      await renameHouse("t", 5, "اسم جديد");
      expect(callsOf(patch).at(-1)?.[1]).toEqual({ name: "اسم جديد" });
    } finally {
      patch.mockRestore();
    }
  });
});
