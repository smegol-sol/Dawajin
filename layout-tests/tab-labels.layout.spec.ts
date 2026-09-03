import { expect, test, type Page } from "@playwright/test";

/**
 * تسميات الشريط السفلي (§8.9، والقرار رقم 181).
 *
 * **ولا يبرهن هذا الملف سلوك الجهاز** (القرار رقم 180): التأكيدات تقيس
 * `react-native-web` لا Yoga، **وتعمل على 390dp ومقياس خط 1.0 بينما جهاز
 * المالك 361dp ومقياسه 0.85** (§7-ب البند 38). فهو حارس للثابت المشترك —
 * أن التسمية تُصيَّر بمكوّننا بسطرين لا بسطر واحد مفروض — **والبرهان البصري
 * عينٌ على جهاز فعلي.**
 */
/** تسمياتُ شريط كل دور كما تُصيَّر فعلًا — **بعد التقصيرَين المقيسَين** (283 و284). */
const TAB_LABELS: Record<string, readonly string[]> = {
  farmer: ["الرئيسية", "التسجيل", "الصحة", "الاستلام", "سجلاتي"],
  supervisor: ["الرئيسية", "العنابر", "الشحنات", "المخزون", "المراجعات"],
  vet: ["الرئيسية", "البلاغات", "المنتجات", "التقارير", "المزيد"],
  owner: ["الرئيسية", "المزارع", "الموظفون", "التقارير", "الإعدادات"],
};

const TABS = TAB_LABELS.owner ?? [];

/** يبلغ شريطَ تبويبات دورٍ بعينه — **والدورُ يُملى من `/auth/me` لا من المسار**. */
async function reachTabs(page: Page, role: string): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("dawajin.auth.token", "layout-test-token");
  });
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        tenantId: 1,
        fullName: "مستخدم",
        role,
        phone: "770000000",
        isActive: true,
        mustChangePassword: false,
      }),
    });
  });
  await page.route("**/api/sites", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sites: [] }),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "الرئيسية" })).toBeVisible();
}

async function reachOwnerTabs(page: Page): Promise<void> {
  await reachTabs(page, "owner");
}

/** نصُّ كل تسمية وفائضُها عن المتاح — **والفائضُ هو القطع** (`text-overflow`). */
async function labelOverflows(page: Page): Promise<{ text: string; overflow: number }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => {
      const label = Array.from(tab.querySelectorAll("div")).find(
        (element) => element.children.length === 0 && element.textContent.trim().length > 0
      );
      if (label === undefined) return { text: "", overflow: 0 };
      return { text: label.textContent.trim(), overflow: label.scrollWidth - label.clientWidth };
    })
  );
}

test.describe("تسميات الشريط السفلي", () => {
  test("التسميات الخمس تُصيَّر كاملة بلا فيض أفقي", async ({ page }) => {
    await reachOwnerTabs(page);

    for (const label of TABS) {
      const tab = page.getByRole("tab", { name: label });
      await expect(tab).toBeVisible();
    }
  });

  test("التسمية من مكوّننا لا من المكتبة — النشط بوزن 700", async ({ page }) => {
    await reachOwnerTabs(page);

    /**
     * **البصمة التي تميّز مكوّننا**: `Label` في `@react-navigation/elements`
     * يصيّر كل التسميات بوزن واحد، ومكوّننا يعطي النشط 700 (§8.9). فاختلاف
     * الوزن بين النشط والخامل هو ما يسقط لو عاد مكوّن المكتبة.
     *
     * **ولا يُفحص `numberOfLines` هنا**: قيمتنا 1 وقيمة المكتبة 1، فلا يفرّق.
     */
    const fonts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => {
        const label = Array.from(tab.querySelectorAll("div")).find(
          (d) => d.children.length === 0 && d.textContent.trim().length > 0
        );
        return {
          text: label === undefined ? "" : label.textContent.trim(),
          selected: tab.getAttribute("aria-selected"),
          fontFamily: label === undefined ? "" : getComputedStyle(label).fontFamily,
        };
      });
    });

    const active = fonts.find((f) => f.selected === "true");
    const idle = fonts.find((f) => f.selected !== "true");
    expect(active).toBeDefined();
    expect(idle).toBeDefined();
    expect(active?.fontFamily).not.toBe(idle?.fontFamily);

    // **ولا يُفحص `webkitLineClamp`**: يُرجع `none` لسطر واحد على
    // `react-native-web`، فلا يقيس شيئًا — والسطر الواحد محروس في المصدر
    // وبعين المالك على الجهاز (القرار رقم 181).
  });

  test("سطرا التسمية والأيقونة يسعان في الشريط بلا رفع ارتفاعه", async ({ page }) => {
    await reachOwnerTabs(page);

    const sizes = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const first = tabs[0];
      if (first === undefined) return { barH: 0, lineH: 0 };
      const label = Array.from(first.querySelectorAll("div")).find(
        (d) => d.children.length === 0 && d.textContent.trim().length > 0
      );
      return {
        barH: Math.round(first.getBoundingClientRect().height),
        lineH: label === undefined ? 0 : Math.round(label.getBoundingClientRect().height),
      };
    });

    // أيقونة 24 + سطران + حشو رأسي، داخل 72 المنصوص عليها في §8.9
    expect(sizes.lineH * 2 + 24).toBeLessThanOrEqual(sizes.barH);
  });
});

/**
 * **لا تسميةَ مقطوعة في أيّ شريط** (§8.9، والقرار 284).
 *
 * **وأربعةُ أدوارٍ لا واحد — والعلّة واقعةٌ لا احتياط:** القطعُ أصاب **دورين
 * في يومين** («السجل اليومي» للمربّي و«المستخدمون» للمالك)، **وحارسٌ يفحص
 * شريطًا واحدًا يترك الباقين** (حكم المالك).
 *
 * **والقطعُ يُقاس ولا يُرى:** `numberOfLines: 1` **يقصّ بـ`text-overflow`
 * فيبقى العنصر «مرئيًّا»** — **فتأكيدُ الرؤية يخضرّ على المقصوص**، وكذلك
 * تأكيدُ المصدر أعلاه. **والقياسُ الذي يمسكه `scrollWidth − clientWidth`.**
 *
 * **ويُشغَّل على المشروعين معًا**، **والحكمُ يقع على الأضيق** (361dp — جهاز
 * المالك): **ما يسع فيه يسع في 390 ولا عكس**.
 */
test.describe("قطعُ تسميات التبويبات", () => {
  for (const [role, labels] of Object.entries(TAB_LABELS)) {
    test(`شريط ${role} — الخمس كاملةٌ بلا قطع`, async ({ page }) => {
      await reachTabs(page, role);

      const rendered = await labelOverflows(page);
      // **الخمسُ حاضرة** — فلا يخضرّ التأكيد على شريطٍ لم يُصيَّر (قائمةٌ
      // فارغة تمرّ من مرشِّح الفائض مجّانًا)
      expect(rendered).toHaveLength(labels.length);
      // **ويُسمّى النصّ مع الفائض** — فرسالة الفشل تقول أيَّ تسميةٍ قُطعت وبكم.
      // **ولا تُقارَن الأسماء هنا عمدًا**: تغييرُ تسميةٍ يجب أن يُسقط قياسَ
      // القطع لا سطرَ أسماءٍ قبله، **وإلا لم يفرّق الشاهد** (القرار 277) —
      // والتسجيلُ في `TAB_LABELS` توثيقٌ وعدَدٌ لا تأكيدُ تسمية.
      expect(rendered.filter((one) => one.overflow > 0)).toEqual([]);
    });
  }
});
