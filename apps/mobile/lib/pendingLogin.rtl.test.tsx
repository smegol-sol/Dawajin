import {
  clearPendingLogin,
  getPendingLogin,
  selectPendingTenant,
  setPendingLogin,
} from "@/lib/pendingLogin";

/**
 * الحالة الوسيطة بين خطوات الدخول الثلاث (القرار #106).
 *
 * تُختبر مباشرةً لا عبر الشاشات، لأن حدّها 100% فروع: **مسار «لا حالة»**
 * (شاشة فُتحت بلا مسار دخول سابق) لا تبلغه أي شاشة — الشاشات تعالجه
 * بالعودة لشاشة الدخول قبل أن تلمس هذه الوحدة.
 */
beforeEach(() => {
  clearPendingLogin();
});

describe("الحالة الوسيطة للدخول", () => {
  it("لا حالة قبل أي خطوة", () => {
    expect(getPendingLogin()).toBeNull();
  });

  it("لا كلمة مرور في الحالة المخزَّنة إطلاقًا (§11)", () => {
    setPendingLogin({
      phone: "770123456",
      accounts: [{ tenantId: 3, tenantName: "مزارع الوادي" }],
      selectedTenantId: null,
    });

    expect(Object.keys(getPendingLogin() ?? {})).toEqual(["phone", "accounts", "selectedTenantId"]);
  });

  it("الاختيار يثبّت المستأجر ولا يمسّ بقية الحالة", () => {
    setPendingLogin({
      phone: "770123456",
      accounts: [
        { tenantId: 3, tenantName: "مزارع الوادي" },
        { tenantId: 9, tenantName: "شركة الأمانة" },
      ],
      selectedTenantId: null,
    });

    selectPendingTenant(9);

    const pending = getPendingLogin();
    expect(pending?.selectedTenantId).toBe(9);
    expect(pending?.phone).toBe("770123456");
    expect(pending?.accounts).toHaveLength(2);
  });

  it("اختيار بلا حالة سابقة لا ينشئ حالة من عدم", () => {
    selectPendingTenant(9);
    expect(getPendingLogin()).toBeNull();
  });

  it("المحو يُعيدها إلى لا شيء بعد الاستهلاك", () => {
    setPendingLogin({
      phone: "770123456",
      accounts: [{ tenantId: 3, tenantName: "مزارع الوادي" }],
      selectedTenantId: 3,
    });

    clearPendingLogin();
    expect(getPendingLogin()).toBeNull();
  });
});
