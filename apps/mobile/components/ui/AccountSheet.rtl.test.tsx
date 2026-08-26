import { fireEvent, render, screen } from "@testing-library/react-native";

import { AccountSheet } from "./AccountSheet";

/**
 * **ورقة الحساب — الخروج والهوية** (القرار #166).
 *
 * ما يُفحص: أن الزرّ موجود ويستدعي الخروج، وأن **الاسم والدور معروضان**.
 * والثاني ليس تجميلًا: مراجعة الصلاحيات بأربعة حسابات على جهاز واحد
 * **تُنسب إلى الحساب الخطأ** بلا هوية ظاهرة.
 */
describe("ورقة الحساب", () => {
  it("تعرض الاسم والدور بالعربية", () => {
    render(
      <AccountSheet
        visible
        onClose={jest.fn()}
        identity={{ fullName: "مربّي العرض", role: "farmer" }}
        onLogout={jest.fn()}
      />
    );

    expect(screen.getByText("مربّي العرض")).toBeTruthy();
    expect(screen.getByText("مربّي")).toBeTruthy();
  });

  it("زرّ الخروج يستدعي الخروج مرة واحدة", () => {
    const onLogout = jest.fn();
    render(
      <AccountSheet
        visible
        onClose={jest.fn()}
        identity={{ fullName: "مالك العرض", role: "owner" }}
        onLogout={onLogout}
      />
    );

    fireEvent.press(screen.getByText("تسجيل الخروج"));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("تعمل قبل وصول الهوية — الخروج متاح بلا انتظار", () => {
    const onLogout = jest.fn();
    render(<AccountSheet visible onClose={jest.fn()} identity={undefined} onLogout={onLogout} />);

    fireEvent.press(screen.getByText("تسجيل الخروج"));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
