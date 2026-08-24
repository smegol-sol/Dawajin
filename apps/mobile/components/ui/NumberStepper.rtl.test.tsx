import { render, screen } from "@testing-library/react-native";

import { NumberStepper } from "@/components/ui/NumberStepper";
import { textStyleOf } from "@/test-utils/rtl";

/**
 * قاعدة RTL #2 (docs/app-complete-spec.md §10): "الأرقام لاتينية دائمًا
 * (0-9) وبـ direction: ltr" — لا اختبار ألوان أو مسافات، لا snapshot
 * (docs/work-plan.md §2-5).
 */
describe("NumberStepper — قاعدة RTL: الأرقام بـ writingDirection ltr", () => {
  it("رقم أحادي الخانة (3) يُعرض بـ direction: ltr", () => {
    render(<NumberStepper value={3} step={1} onChange={() => undefined} />);
    const style = textStyleOf(screen.getByText("3"));
    expect(style.writingDirection).toBe("ltr");
  });

  it("رقم عشري متعدد الخانات (12.5) يُعرض بـ direction: ltr أيضًا", () => {
    render(<NumberStepper value={12.5} step={0.5} onChange={() => undefined} />);
    const style = textStyleOf(screen.getByText("12.5"));
    expect(style.writingDirection).toBe("ltr");
  });
});
