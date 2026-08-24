import { render, screen } from "@testing-library/react-native";
import { ArrowRight } from "lucide-react-native";

import { AppHeader } from "@/components/ui/AppHeader";
import { textStyleOf } from "@/test-utils/rtl";

const LONG_TITLE = "عنبر رقم أربعة عشر - الجناح الشرقي الملحق بمزرعة الوادي الأخضر";
const SHORT_TITLE = "عنبر 1";

/**
 * قواعد RTL #1 و#4 و#7 (docs/app-complete-spec.md §10): سهم الرجوع يشير
 * يمينًا، عنوان الشاشة محاذاته يمين حصرًا، اختبار الأسماء الطويلة والقصيرة
 * في نفس المكوّن. لا snapshot ولا اختبار ألوان/مسافات.
 */
describe("AppHeader — قواعد RTL: السهم يمينًا والعنوان يمين حصرًا", () => {
  it("المتغيّر الفرعي: سهم الرجوع هو ArrowRight تحديدًا (يشير يمينًا)", () => {
    render(<AppHeader variant="sub" title={SHORT_TITLE} />);
    expect(screen.UNSAFE_getByType(ArrowRight)).toBeTruthy();
  });

  it("عنوان قصير: محاذاة العنوان يمين", () => {
    render(<AppHeader variant="main" title={SHORT_TITLE} />);
    const style = textStyleOf(screen.getByText(SHORT_TITLE));
    expect(style.textAlign).toBe("right");
  });

  it("عنوان طويل في نفس المكوّن: يظل نصًا عربيًا حقيقيًا ومحاذاته يمين أيضًا", () => {
    render(<AppHeader variant="sub" title={LONG_TITLE} contextLine="سياق إضافي" />);
    const style = textStyleOf(screen.getByText(LONG_TITLE));
    expect(style.textAlign).toBe("right");
  });
});
