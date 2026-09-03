import type { BatchCard, ProductCard } from "@/lib/dailyLogApi";
import {
  activeBatchOf,
  addFeedRow,
  arrivingBatchOf,
  avgWeightLine,
  buildRequest,
  emptyDraft,
  feedComputedLine,
  feedProductsOf,
  formatNumber,
  newClientId,
  patchFeedRow,
  removeFeedRow,
  saveDisabledReason,
  todayIso,
  waterComputedLine,
  type DailyLogDraft,
} from "@/lib/dailyLogForm";

/**
 * **نموذج السجل اليوميّ الخالص** — الحسابُ المعروض، وسببُ التعطيل، وبناءُ
 * الطلب. **يحمل قرارات منتج فيُفحص وحده** (نمط `infrastructureNavigation`).
 */

function batch(status: string): BatchCard {
  return { id: 1, houseId: 9, breed: "Ross 308", status, startDate: null, receivedBirdCount: null };
}

function feed(id: number, stage: string | null, size: number | null): ProductCard {
  return {
    id,
    category: "علف",
    name: `علف ${stage ?? "عام"}`,
    feedStage: stage,
    stockUnit: "كيس",
    packageSize: size,
    packageUnit: size === null ? null : "كجم",
  };
}

describe("اختيار الدفعة", () => {
  it("«نشطة» وحدها تُسجَّل عليها — و«قيد الوصول» ليست نشطة", () => {
    expect(activeBatchOf([batch("قيد الوصول")])).toBeUndefined();
    expect(activeBatchOf([batch("قيد الوصول"), batch("نشطة")])?.status).toBe("نشطة");
    expect(activeBatchOf([batch("منتهية")])).toBeUndefined();
  });

  it("و«قيد الوصول» تُميَّز عن لا شيء — فنصّ الحالة الفارغة يختلف", () => {
    expect(arrivingBatchOf([batch("قيد الوصول")])?.status).toBe("قيد الوصول");
    expect(arrivingBatchOf([batch("منتهية")])).toBeUndefined();
    expect(arrivingBatchOf([])).toBeUndefined();
  });
});

describe("أصناف العلف المعروضة", () => {
  it("«علف» بوحدة «كيس» وحدها — وما سواها محجوب بالاسم", () => {
    const medicine: ProductCard = {
      id: 7,
      category: "دواء",
      name: "دواء ما",
      feedStage: null,
      stockUnit: "زجاجة",
      packageSize: null,
      packageUnit: null,
    };
    const bagged: ProductCard = { ...feed(8, null, 25), category: "مستلزمات تشغيل" };
    const names = feedProductsOf([feed(1, "بادئ", 50), medicine, bagged], "بادئ").map(
      (p) => p.name
    );
    expect(names).toEqual(["علف بادئ"]);
  });

  it("وصنفُ مرحلةٍ أخرى غائب — والصنفُ بلا مرحلة يظهر في كلّها", () => {
    const products = [feed(1, "بادئ", 50), feed(2, "ناهي", 50), feed(3, null, 50)];
    expect(feedProductsOf(products, "بادئ").map((p) => p.id)).toEqual([1, 3]);
    expect(feedProductsOf(products, "ناهي").map((p) => p.id)).toEqual([2, 3]);
  });
});

describe("الأسطر المحسوبة — تُعرض ولا تُرسَل", () => {
  it("كجم العلف = الأكياس × وزن العبوة، بوحدته لا بوحدةٍ مفترضة", () => {
    expect(feedComputedLine(feed(1, "بادئ", 50), 2.5)).toBe("= 125 كجم");
  });

  it("ولا سطر بلا صنفٍ أو بلا وزن عبوة — فلا يُفترض وزن", () => {
    expect(feedComputedLine(undefined, 3)).toBeUndefined();
    expect(feedComputedLine(feed(1, "بادئ", null), 3)).toBeUndefined();
  });

  it("ولترات الماء = الخزانات × السعة، ولا سطر لعنبرٍ بلا سعة", () => {
    expect(waterComputedLine(1000, 1.25)).toBe("= 1250 لتر");
    expect(waterComputedLine(null, 2)).toBeUndefined();
  });

  it("ومتوسط الوزن يظهر حين يكتمل الرقمان وحدهما", () => {
    expect(avgWeightLine(10, 21)).toBe("= 2100 جم للطير");
    expect(avgWeightLine(0, 21)).toBeUndefined();
    expect(avgWeightLine(10, 0)).toBeUndefined();
  });

  it("والأرقام لاتينية بلا ذيلٍ عشريّ لا معنى له", () => {
    expect(formatNumber(125)).toBe("125");
    expect(formatNumber(1.5)).toBe("1.5");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
  });
});

describe("سبب تعطيل الحفظ — يظهر قبل الضغط لا بعده", () => {
  const withRow = (patch: Partial<DailyLogDraft["feedRows"][number]>): DailyLogDraft => ({
    ...emptyDraft,
    feedRows: [{ key: "k", productId: 1, stage: "بادئ", bags: 1, ...patch }],
  });

  it("لا سبب لنموذجٍ سليم", () => {
    expect(saveDisabledReason(emptyDraft, false)).toBeUndefined();
    expect(saveDisabledReason(withRow({}), false)).toBeUndefined();
  });

  it("صفُّ علفٍ بلا صنف يُسمّى — ولا يُرسَل فيُردّ", () => {
    expect(saveDisabledReason(withRow({ productId: null }), false)).toBe(
      "اختر صنف العلف في كل صفّ"
    );
  });

  it("وصفرُ أكياسٍ يُسمّى — والخادم يردّه", () => {
    expect(saveDisabledReason(withRow({ bags: 0 }), false)).toBe(
      "كمية العلف في كل صفّ أكبر من صفر"
    );
  });

  it("وعيّنةٌ بنصفها تُسمّى — والخادم يردّها بـsample_pair_required", () => {
    expect(saveDisabledReason({ ...emptyDraft, sampledBirds: 5 }, false)).toBe(
      "عيّنة الوزن رقمان معًا: عدد الطيور ووزنها"
    );
    expect(saveDisabledReason({ ...emptyDraft, sampledWeightKg: 5 }, false)).toBe(
      "عيّنة الوزن رقمان معًا: عدد الطيور ووزنها"
    );
    expect(
      saveDisabledReason({ ...emptyDraft, sampledBirds: 5, sampledWeightKg: 5 }, false)
    ).toBeUndefined();
  });

  it("وأثناء الحفظ يُعطَّل الزرّ", () => {
    expect(saveDisabledReason(emptyDraft, true)).toBe("جارٍ الحفظ");
  });
});

describe("بناء الطلب — الاختياريّ يُحذف ولا يُرسَل صفرًا", () => {
  const base = { houseId: 9, logDate: "2026-09-03", clientId: "cid", hasTankCapacity: true };

  it("نموذجٌ فارغ يُرسل النفوق والتاريخ والعنبر وحدها", () => {
    const request = buildRequest({ draft: emptyDraft, ...base });
    expect(request).toEqual({
      houseId: 9,
      logDate: "2026-09-03",
      mortalityCount: 0,
      clientId: "cid",
      feedRows: [],
    });
    // **والحقول المحسوبة غائبة بالاسم** — الخادم يحسبها ولا يقبلها (§15)
    for (const forbidden of ["waterLiters", "avgWeightG", "kg", "bagWeightKg"]) {
      expect(Object.keys(request)).not.toContain(forbidden);
    }
  });

  it("ولا سببَ نفوقٍ بلا نفوق — فالسبب بلا واقعة لا يُحفظ", () => {
    const draft = { ...emptyDraft, mortalityCount: 0, mortalityCause: "إجهاد حراري" };
    expect(Object.keys(buildRequest({ draft, ...base }))).not.toContain("mortalityCause");
    const withDeaths = { ...draft, mortalityCount: 3 };
    expect(buildRequest({ draft: withDeaths, ...base }).mortalityCause).toBe("إجهاد حراري");
  });

  it("ولا ماءَ لعنبرٍ بلا سعة — ولو أدخل المربّي رقمًا", () => {
    const draft = { ...emptyDraft, waterTanks: 2 };
    expect(buildRequest({ draft, ...base }).waterTanks).toBe(2);
    expect(Object.keys(buildRequest({ draft, ...base, hasTankCapacity: false }))).not.toContain(
      "waterTanks"
    );
  });

  it("والعيّنة رقمان معًا أو لا شيء", () => {
    const half = { ...emptyDraft, sampledBirds: 5 };
    expect(Object.keys(buildRequest({ draft: half, ...base }))).not.toContain("sampledBirds");
    const full = { ...emptyDraft, sampledBirds: 5, sampledWeightKg: 10 };
    expect(buildRequest({ draft: full, ...base }).sampledWeightKg).toBe(10);
  });

  it("والحقول النصّية الرقمية تُحذف حين لا تُقرأ رقمًا", () => {
    const draft = { ...emptyDraft, temperatureC: "٣٠درجة", humidityPct: " 55 ", notes: "   " };
    const request = buildRequest({ draft, ...base });
    expect(Object.keys(request)).not.toContain("temperatureC");
    expect(request.humidityPct).toBe(55);
    expect(Object.keys(request)).not.toContain("notes");
  });

  it("والملاحظة تُرسل مشذّبةً حين تُكتب", () => {
    const draft = { ...emptyDraft, notes: "  الجوّ حارّ منذ الفجر  " };
    expect(buildRequest({ draft, ...base }).notes).toBe("الجوّ حارّ منذ الفجر");
  });

  it("وصفُّ علفٍ بلا صنف يسقط من الطلب ولا يُرسَل بمعرّفٍ معدوم", () => {
    const draft: DailyLogDraft = {
      ...emptyDraft,
      feedRows: [
        { key: "a", productId: null, stage: "بادئ", bags: 1 },
        { key: "b", productId: 4, stage: "ناهي", bags: 2 },
      ],
    };
    expect(buildRequest({ draft, ...base }).feedRows).toEqual([
      { productId: 4, feedStage: "ناهي", bags: 2 },
    ]);
  });
});

describe("صفوف العلف — تعديلٌ لا يمسّ غيره", () => {
  it("تُضاف وتُعدَّل وتُحذف بمفتاحها", () => {
    const one = addFeedRow(emptyDraft, "a");
    const two = addFeedRow(one, "b");
    expect(two.feedRows.map((row) => row.key)).toEqual(["a", "b"]);

    const patched = patchFeedRow(two, "b", { bags: 3 });
    expect(patched.feedRows.map((row) => row.bags)).toEqual([0, 3]);

    expect(removeFeedRow(patched, "a").feedRows.map((row) => row.key)).toEqual(["b"]);
  });
});

describe("التاريخ ومعرّف العطالة", () => {
  it("تاريخ اليوم بتقويم الجهاز لا UTC — فلا يُسجَّل يومٌ مضى", () => {
    expect(todayIso(new Date(2026, 8, 3, 2, 0, 0))).toBe("2026-09-03");
    expect(todayIso(new Date(2026, 0, 9, 23, 30, 0))).toBe("2026-01-09");
  });

  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("ومعرّف العطالة بصيغة UUID يقبلها الخادم، ولا يتكرّر", () => {
    const ids = Array.from({ length: 50 }, () => newClientId());
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * **الفرعان يُفحصان معًا** — **وهو الفرقُ بين «يعمل عندي» و«يعمل حيث
   * يُشحَن»**: الشاشة تعمل على منصّةٍ بـ`randomUUID` وأخرى بلا واحد،
   * **والصيغةُ يجب أن تُقبل من الخادم في الحالتين**.
   */
  it("ويُقدَّم randomUUID حين توفّره المنصّة، ويعمل بلا وجوده", () => {
    const original = globalThis.crypto;
    const stub = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => stub },
      configurable: true,
    });
    expect(newClientId()).toBe(stub);

    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    expect(newClientId()).toMatch(UUID_V4);

    Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
  });
});
