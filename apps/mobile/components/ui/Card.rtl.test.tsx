import { fireEvent, render, screen } from "@testing-library/react-native";

import { Card } from "@/components/ui/Card";

const LONG_TITLE = "عنبر رقم أربعة عشر - الجناح الشرقي الملحق بمزرعة الوادي الأخضر";
const SHORT_TITLE = "عنبر 1";

/**
 * قاعدتا RTL #6 و#7 (docs/app-complete-spec.md §10 و§15-3: "أسماء الأصناف
 * والعنابر متغيرة الطول فعليًا") — Card هو المكوّن الأساسي لعرض أسماء
 * الكيانات (عنابر/دفعات). لا snapshot ولا اختبار ألوان/مسافات.
 */
describe("Card — قاعدة RTL: أسماء متغيّرة الطول ونص عربي حقيقي", () => {
  it("اسم قصير واسم طويل لنفس نوع الكيان يظهران كنص عربي حقيقي كاملًا", () => {
    render(
      <>
        <Card title={SHORT_TITLE} subtitle="دفعة روس 308" />
        <Card title={LONG_TITLE} subtitle="اسم طويل لاختبار الالتفاف" />
      </>
    );
    expect(screen.getByText(SHORT_TITLE)).toBeTruthy();
    expect(screen.getByText(LONG_TITLE)).toBeTruthy();
  });
});

/**
 * **التنقّل بالبطاقة لا بزرّ داخلها** (القرار رقم 180)، ومعه الشرط الذي
 * يجعله سليمًا: **ضغط ⋮ لا يُطلق التنقّل**.
 *
 * والاختبار **يفشل لو انعكس السلوك**: يفحص أن `onPress` لم يُنادَ ولا مرة
 * واحدة عند ضغط ⋮ — لا يكتفي بأن `onMorePress` نودي.
 */
describe("بطاقة الكيان — التنقّل والخيارات", () => {
  it("الضغط على البطاقة يُطلق التنقّل", () => {
    const onPress = jest.fn();
    const view = render(<Card title="مزرعة الجبل 1" onPress={onPress} testID="card" />);

    fireEvent.press(view.getByTestId("card"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("الضغط على ⋮ لا يُطلق التنقّل — الإيقاف صريح لا اتّكال على العمق", () => {
    const onPress = jest.fn();
    const onMorePress = jest.fn();
    const view = render(
      <Card title="مزرعة الجبل 1" onPress={onPress} onMorePress={onMorePress} testID="card" />
    );

    fireEvent.press(view.getByTestId("card-more"));

    expect(onMorePress).toHaveBeenCalledTimes(1);
    // **هذا هو التأكيد الحاسم**: لو انتشر الضغط لصار 1 وسقط الاختبار
    expect(onPress).not.toHaveBeenCalled();
  });

  it("بطاقة بلا onPress ليست زرًّا", () => {
    const view = render(<Card title="بطاقة ساكنة" testID="card" />);

    expect(view.getByTestId("card").props.accessibilityRole).toBeUndefined();
  });

  it("بطاقة قابلة للضغط تحمل دور زرّ واسمها", () => {
    const view = render(<Card title="مزرعة الجبل 1" onPress={() => undefined} testID="card" />);

    const card = view.getByTestId("card");
    expect(card.props.accessibilityRole).toBe("button");
    expect(card.props.accessibilityLabel).toBe("مزرعة الجبل 1");
  });

  it("⋮ يحمل اسم الكيان في تسميته — لا «خيارات» مجرّدة", () => {
    const view = render(
      <Card title="مزرعة الجبل 1" onMorePress={() => undefined} testID="card" />
    );

    expect(view.getByTestId("card-more").props.accessibilityLabel).toBe("خيارات مزرعة الجبل 1");
  });
});
