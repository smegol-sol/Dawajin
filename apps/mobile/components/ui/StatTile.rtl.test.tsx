import { render, screen } from "@testing-library/react-native";

import { StatTile } from "@/components/ui/StatTile";
import { textStyleOf } from "@/test-utils/rtl";

/**
 * قاعدة RTL #2 (docs/app-complete-spec.md §10): "الأرقام لاتينية دائمًا
 * وبـ direction: ltr" — "أيام التغطية هي الرقم البطل" (§11)، فهذا المكوّن
 * هو المرشّح الأول لهذه القاعدة. لا snapshot ولا اختبار ألوان/مسافات.
 */
describe("StatTile — قاعدة RTL: القيمة الرقمية بـ writingDirection ltr", () => {
  it("قيمة رقمية بفاصلة عشرية تُعرض بـ direction: ltr", () => {
    render(<StatTile label="أيام تغطية العلف" value="18" unit="يوم" />);
    const style = textStyleOf(screen.getByText("18"));
    expect(style.writingDirection).toBe("ltr");
  });

  it("عند غياب القيمة: سبب الغياب نص عربي حقيقي لا شرطة صامتة", () => {
    render(<StatTile label="نسبة الماء إلى العلف" unavailableReason="لم تُسجَّل معاينة وزن" />);
    expect(screen.getByText("لم تُسجَّل معاينة وزن")).toBeTruthy();
    expect(screen.queryByText("-")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });
});
