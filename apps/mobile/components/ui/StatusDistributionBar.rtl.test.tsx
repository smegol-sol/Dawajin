import { render, screen } from "@testing-library/react-native";

import { StatusDistributionBar } from "@/components/ui/StatusDistributionBar";
import { textStyleOf } from "@/test-utils/rtl";

/**
 * شريط توزيع الحالات (§5-د/2). **برهان التناسب هنا لا على الجهاز**: بيانات
 * البذر كلها في حالة واحدة (`0/2/0` و`0/3/0`)، فلا مزرعة بحالات مختلطة
 * يُقاس عليها عرض المقاطع. **وشريط نسب يبدو صحيحًا ونسبه خاطئة عطبٌ صامت**
 * — من صنف القرارين #169 و#172 — فيُحرَس بقياس حتمي لا بعين.
 */

const EMPTY = "لا عنابر في هذه المزرعة بعد";

function flexOf(testID: string): unknown {
  return textStyleOf(screen.getByTestId(testID)).flex;
}

describe("StatusDistributionBar — التناسب", () => {
  it("عرض كل مقطع يساوي عدده — النسبة لا التساوي", () => {
    render(
      <StatusDistributionBar
        counts={{ occupied: 5, ready: 3, other: 2 }}
        emptyLabel={EMPTY}
        testID="bar"
      />
    );

    expect(flexOf("bar-occupied")).toBe(5);
    expect(flexOf("bar-ready")).toBe(3);
    expect(flexOf("bar-other")).toBe(2);
  });

  it("المقطع الصفري لا يُرسم إطلاقًا — لا شريحة بعرض صفر", () => {
    render(
      <StatusDistributionBar
        counts={{ occupied: 0, ready: 4, other: 0 }}
        emptyLabel={EMPTY}
        testID="bar"
      />
    );

    expect(screen.queryByTestId("bar-occupied")).toBeNull();
    expect(screen.queryByTestId("bar-other")).toBeNull();
    expect(flexOf("bar-ready")).toBe(4);
  });

  it("الوسم يحمل التسمية والعدد معًا — لا لون وحده (§11)", () => {
    render(
      <StatusDistributionBar
        counts={{ occupied: 1, ready: 2, other: 0 }}
        emptyLabel={EMPTY}
        testID="bar"
      />
    );

    expect(screen.getByText("مشغول 1")).toBeTruthy();
    expect(screen.getByText("جاهز وشاغر 2")).toBeTruthy();
    expect(screen.queryByText(/غير ذلك/)).toBeNull();
  });
});

describe("StatusDistributionBar — الحالة الصفرية", () => {
  it("لا شريط فارغ بل نصّ يقول السبب (§11: لا شرطة صامتة)", () => {
    render(
      <StatusDistributionBar
        counts={{ occupied: 0, ready: 0, other: 0 }}
        emptyLabel={EMPTY}
        testID="bar"
      />
    );

    expect(screen.getByTestId("bar-empty")).toBeTruthy();
    expect(screen.getByText(EMPTY)).toBeTruthy();
    // الشريط نفسه غائب — لا شريحة رمادية توحي بتوزيع معدوم
    expect(screen.queryByTestId("bar")).toBeNull();
  });

  it("النصّ محاذاته يمين واتجاهه rtl (§10)", () => {
    render(
      <StatusDistributionBar
        counts={{ occupied: 0, ready: 0, other: 0 }}
        emptyLabel={EMPTY}
        testID="bar"
      />
    );

    const style = textStyleOf(screen.getByTestId("bar-empty"));
    expect(style.writingDirection).toBe("rtl");
    expect(style.textAlign).toBe("right");
  });
});
