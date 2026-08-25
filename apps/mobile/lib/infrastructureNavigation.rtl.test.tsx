import {
  contextLine,
  currentLevel,
  descend,
  goBack,
  hasSkippedAncestor,
  initialTrail,
  type Level,
} from "@/lib/infrastructureNavigation";

/**
 * التخطّي والرجوع — النموذج الخالص. يُفحص هنا لا عبر الشاشة لأن السؤال
 * («إلى أين يعود من هبط بلا اختيار؟») منطقي بحت، وفحصه عبر الشاشة يخلطه
 * بجلب البيانات وحالات القائمة.
 */

const farms: Level = { kind: "farms", siteId: 1, siteName: "الجبل" };
const houses: Level = { kind: "houses", farmId: 7, farmName: "مزرعة 1", siteName: "الجبل" };

describe("التخطّي — أي مستوى بعنصر واحد مرئي", () => {
  it("موقع واحد ← ينزل للمزارع، والمواقع صارت متخطّاة", () => {
    const trail = descend(initialTrail(), farms, true);
    expect(currentLevel(trail)).toEqual(farms);
    expect(hasSkippedAncestor(trail)).toBe(true);
  });

  it("اختيار المستخدم ليس تخطّيًا — نفس النزول بعلامة أخرى", () => {
    const trail = descend(initialTrail(), farms, false);
    expect(hasSkippedAncestor(trail)).toBe(false);
  });

  it("متتابع: موقع واحد فيه مزرعة واحدة ← العنابر بلا ضغطة", () => {
    const trail = descend(descend(initialTrail(), farms, true), houses, true);
    expect(currentLevel(trail)).toEqual(houses);
    expect(hasSkippedAncestor(trail)).toBe(true);
  });
});

describe("الرجوع لا يهبط في مستوى متخطّى", () => {
  it("مواقع متعددة ومزرعة واحدة ← الرجوع من العنابر يصل المواقع لا المزارع", () => {
    const trail = descend(descend(initialTrail(), farms, false), houses, true);
    const back = goBack(trail);
    expect(back).not.toBeNull();
    expect(currentLevel(back ?? [])).toEqual({ kind: "sites" });
  });

  it("لا تخطّي ← الرجوع من العنابر يصل المزارع", () => {
    const trail = descend(descend(initialTrail(), farms, false), houses, false);
    expect(currentLevel(goBack(trail) ?? [])).toEqual(farms);
  });

  it("كل ما فوقه متخطّى ← لا مستوى يُرجَع إليه، تُغادَر الشاشة", () => {
    const trail = descend(descend(initialTrail(), farms, true), houses, true);
    expect(goBack(trail)).toBeNull();
  });

  it("موقع واحد ومزارع متعددة ← الرجوع من العنابر يصل المزارع، ومنها تُغادَر", () => {
    const trail = descend(descend(initialTrail(), farms, true), houses, false);
    const atFarms = goBack(trail);
    expect(currentLevel(atFarms ?? [])).toEqual(farms);
    expect(goBack(atFarms ?? [])).toBeNull();
  });

  it("الرجوع من المستوى الأول ← مغادرة (لا مستوى فوقه)", () => {
    expect(goBack(initialTrail())).toBeNull();
  });
});

/**
 * أثر فارغ لا يحدث داخل الشاشة (`goBack` تُرجع `null` بدل أن تفرّغه)، لكن
 * الدالتين تحتملانه دفاعيًا — والفرع الدفاعي يُغطّى كي لا يبقى سلوكه مجهولًا
 * لو استُدعيتا من موضع جديد لاحقًا.
 */
describe("الفروع الدفاعية — أثر فارغ", () => {
  it("currentLevel على أثر فارغ ← المواقع", () => {
    expect(currentLevel([])).toEqual({ kind: "sites" });
  });

  it("descend على أثر فارغ ← المستوى الجديد وحده بلا أب مصطنع", () => {
    expect(descend([], farms, true)).toEqual([{ level: farms, skipped: false }]);
  });
});

describe("سطر السياق", () => {
  it("عند العنابر: الموقع › المزرعة", () => {
    const trail = descend(descend(initialTrail(), farms, true), houses, true);
    expect(contextLine(trail)).toBe("الجبل › مزرعة 1");
  });

  it("عند المزارع لا سطر — العنوان اسم الموقع نفسه", () => {
    expect(contextLine(descend(initialTrail(), farms, true))).toBeUndefined();
  });

  it("عند المواقع لا سطر", () => {
    expect(contextLine(initialTrail())).toBeUndefined();
  });
});
