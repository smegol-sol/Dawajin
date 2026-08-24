import { render, screen } from "@testing-library/react-native";

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
