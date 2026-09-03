import { expect, test, type Page } from "@playwright/test";

/**
 * تأكيداتُ تخطيطِ شاشة السجل اليوميّ — **زرُّ الحفظ وتسمياتُ التبويبات**
 * (§2 و§8.9، والقرار 283).
 *
 * **ولماذا هنا لا في اختبارات jest:** `react-test-renderer` **لا يُنفّذ تخطيط
 * Yoga إطلاقًا** — لا إحداثيات ولا عرضَ نصٍّ يُقاس (القرار #80). **واختبارُ
 * الشاشة يثبت أن الزرّ مُصيَّر؛ وهذا يثبت أنه مرئيّ** — والفرق بينهما هو
 * العطب بعينه: **الزرُّ كان آخرَ عنصرٍ في التمرير فيُدفَن تحت شريط التبويبات**.
 *
 * **والشبكة مستبدَلةٌ بـ`page.route`** كما في بقية ملفات هذا المجلد: التأكيدات
 * على التخطيط، **فربطُها بقاعدة بيانات يجعل فشلها غامضًا بين تخطيطٍ وبيانات**.
 */

const FARMER_TABS = ["الرئيسية", "التسجيل", "الصحة", "الاستلام", "سجلاتي"] as const;

const ME = {
  id: 1,
  tenantId: 1,
  fullName: "سالم المربّي",
  role: "farmer",
  phone: "770000000",
  isActive: true,
  mustChangePassword: false,
};

const HOUSE = {
  id: 5,
  farmId: 1,
  name: "العنبر الشمالي",
  type: "مغلق",
  status: "مشغول",
  waterTankCapacityL: "1000",
};

const ACTIVE_BATCH = {
  id: 3,
  houseId: 5,
  breed: "Ross 308",
  status: "نشطة",
  startDate: "2026-08-20",
  receivedBirdCount: 4800,
};

const FEED = {
  id: 11,
  category: "علف",
  name: "علف بادئ",
  feedStage: "بادئ",
  stockUnit: "كيس",
  packageSize: 50,
  packageUnit: "كجم",
};

const FARM = {
  id: 1,
  siteId: 1,
  name: "المزرعة",
  powerSources: ["مولدات"],
  houseCount: 1,
  houseStatusCounts: { occupied: 1, ready: 0, other: 0 },
};

async function stub(page: Page, path: string, body: unknown): Promise<void> {
  await page.route(path, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/** يبلغ شاشة السجل اليوميّ بدفعةٍ نشطة — فيُعرض النموذج كاملًا. */
async function reachDailyLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("dawajin.auth.token", "layout-test-token");
  });
  await stub(page, "**/api/auth/me", ME);
  await stub(page, "**/api/sites", {
    sites: [{ id: 1, name: "الموقع", farmCount: 1, houseCount: 1 }],
  });
  await stub(page, "**/api/sites/*/farms", { farms: [FARM] });
  await stub(page, "**/api/farms/*/houses", { houses: [HOUSE] });
  await stub(page, "**/api/houses/*/batches", { batches: [ACTIVE_BATCH] });
  await stub(page, "**/api/products", { products: [FEED] });

  await page.goto("/");
  // **يُنتقل بالترتيب لا بالنصّ**: تأكيدُ القطع أدناه **يجب أن يسقط على قياس
  // القطع لا على تعذّر التنقّل** — والانتقالُ بالاسم يجعل تغييرَ التسمية
  // يُسقط الملفَّ كلَّه لسببٍ آخر، **فلا يفرّق الشاهد** (القرار 277).
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByText("حفظ السجل")).toBeVisible();
}

test.describe("شاشة السجل اليوميّ", () => {
  /**
   * **الزرُّ مرئيٌّ بلا تمرير، لا موجودٌ فحسب.**
   *
   * **وقياسان لا واحد:** أن صندوقه داخل النافذة · **وأنه فوق شريط التبويبات
   * لا تحته** — والدفنُ تحته هو العطب الذي أُصلح.
   */
  test("زرُّ الحفظ مرئيّ بلا تمرير وفوق شريط التبويبات", async ({ page }) => {
    await reachDailyLog(page);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const height = viewport?.height ?? 0;

    const button = await page.getByText("حفظ السجل").boundingBox();
    expect(button).not.toBeNull();
    const box = button ?? { x: 0, y: 0, width: 0, height: 0 };

    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);

    const tabBar = await page.getByRole("tab").nth(1).boundingBox();
    expect(tabBar).not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual((tabBar?.y ?? 0) + 1);
  });

  /**
   * **والنموذجُ نفسُه يُمرَّر — فالثباتُ ليس قِصَرَ محتوى.**
   *
   * **بلا هذا يخضرّ التأكيد أعلاه على شاشةٍ لا تمرير فيها أصلًا**، فلا يقيس
   * الثبات — **وهو شكلُ «الشاهد الذي لا يفرّق»** (القرار 242).
   */
  test("والحقول أطول من الشاشة — فالثبات مقيس لا مصادفة", async ({ page }) => {
    await reachDailyLog(page);

    const scrollable = await page.evaluate(() =>
      Array.from(document.querySelectorAll("div")).some(
        (element) => element.scrollHeight > element.clientHeight + 8
      )
    );
    expect(scrollable).toBe(true);
  });

  /**
   * **ولا تسميةَ تبويبٍ مقطوعة** (§8.9).
   *
   * **والقطعُ يُقاس ولا يُرى:** `numberOfLines: 1` **يقصّ بـ`text-overflow`
   * فيبقى العنصر «مرئيًّا»** — فتأكيدُ الرؤية يخضرّ على تسميةٍ مقصوصة.
   * **والقياسُ الصحيح `scrollWidth > clientWidth`** — عرضُ النصّ مقابل المتاح.
   *
   * **وفاحصُ `tab-labels` يفحص المصدر لا القطع** (أن التسمية من مكوّننا)،
   * **فهذا يسدّ ما لا يراه** — والقطعُ قابلٌ للفحص آليًّا، وهذا فحصُه.
   */
  test("ولا تسميةَ تبويبٍ مقطوعة", async ({ page }) => {
    await reachDailyLog(page);

    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => {
        const label = Array.from(tab.querySelectorAll("div")).find(
          (element) => element.children.length === 0 && element.textContent.trim().length > 0
        );
        if (label === undefined) return { text: "", overflow: 0 };
        return {
          text: label.textContent.trim(),
          overflow: label.scrollWidth - label.clientWidth,
        };
      })
    );

    // **الخمسُ حاضرة** — فلا يخضرّ التأكيد على شريطٍ لم يُصيَّر
    expect(labels).toHaveLength(FARMER_TABS.length);
    // **ويُسمّى النصّ مع الرقم** — فرسالة الفشل تقول أيَّ تسميةٍ قُطعت وبكم
    expect(labels.filter((one) => one.overflow > 0)).toEqual([]);
  });
});
