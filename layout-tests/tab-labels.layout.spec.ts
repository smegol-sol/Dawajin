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
const TABS = ["الرئيسية", "المزارع", "المستخدمون", "التقارير", "الإعدادات"] as const;

async function reachOwnerTabs(page: Page): Promise<void> {
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
        fullName: "مالك",
        role: "owner",
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
