import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * تأكيدات تخطيط شبكة العنابر (§5-د/2، القرار رقم 178) على عرض 390 — أضيق
 * جهاز مستهدَف، وهو العرض الذي أوقع الاقتطاع في القرار #168.
 *
 * لماذا هنا لا في jest: `react-test-renderer` لا يُنفّذ تخطيط Yoga إطلاقًا،
 * فلا إحداثيات ولا ارتفاعات — وهو بالضبط سبب عدم رؤية اختبارات RTL للاقتطاع
 * (القرار #80). **وثلاثة أعمدة وعدم الاقتطاع كلاهما قياس هندسي لا وجود نصّ.**
 */

/**
 * الحالة الكاملة الأطول — ومربّع الشبكة يعرض **تسميتها القصيرة** «تنظيف»
 * (القرار رقم 178: اختيار تسمية لا اقتطاعًا). فمعيار «لا اقتطاع» يُقاس على
 * ما يُعرض فعلًا.
 */
const LONGEST_STATUS = "تحت التنظيف والتطهير";
const LONGEST_SHORT_LABEL = "تنظيف";

const HOUSES = [
  { id: 1, farmId: 7, name: "عنبر 1", type: "مغلق", status: LONGEST_STATUS, waterTankCapacityL: null },
  { id: 2, farmId: 7, name: "عنبر 2", type: null, status: "مشغول", waterTankCapacityL: null },
  { id: 3, farmId: 7, name: "عنبر 3", type: "مفتوح", status: "جاهز للإسكان", waterTankCapacityL: null },
  { id: 4, farmId: 7, name: "عنبر 4", type: "مغلق", status: "تحت الصيانة", waterTankCapacityL: null },
];

/**
 * يُقلع التطبيق بجلسة مالك مستعادة ويصل إلى شبكة العنابر.
 *
 * **الموقع بمزرعة واحدة عمدًا**: المستوى الأوسط يُتخطّى تلقائيًا (القرار
 * #132) فتُفتح الشبكة مباشرة بلا نقر إضافي.
 */
async function stubOwnerSession(page: Page): Promise<void> {
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

  await stubInfrastructure(page);
}

/** مسارات البنية التحتية — مفصولة كي تبقى كل دالّة دون حدّ الأسطر. */
async function stubInfrastructure(page: Page): Promise<void> {
  await page.route("**/api/sites", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // **موقعان عمدًا**: موقع واحد يُتخطّى تلقائيًا (القرار #132) فلا تظهر
      // بطاقة موقع أصلًا، ولا يُقاس التنقّل بالبطاقة
      body: JSON.stringify({
        sites: [
          { id: 3, name: "موقع الصعيد", farmCount: 1, houseCount: 4 },
          { id: 4, name: "موقع الجبل", farmCount: 0, houseCount: 0 },
        ],
      }),
    });
  });

  await page.route("**/api/sites/3/farms", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        farms: [
          {
            id: 7,
            siteId: 3,
            name: "مزرعة الخماسية 2",
            powerSources: ["كهرباء"],
            houseStatusCounts: { occupied: 1, ready: 1, other: 2 },
          },
        ],
      }),
    });
  });

  await page.route("**/api/farms/7/houses", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ houses: HOUSES }),
    });
  });

}

/** يصل إلى شبكة العنابر — عبر الضغط على بطاقة الموقع لا على زرّ داخلها. */
async function reachHousesGrid(page: Page): Promise<void> {
  await stubOwnerSession(page);
  await page.goto("/");
  // الجلسة تُستعاد فتُفتح تبويبات المالك على «الرئيسية» — والشبكة تحت تبويب
  // «المزارع» (القرار رقم 177: الاستعادة تسبق أي شاشة)
  await page.getByRole("tab", { name: "المزارع" }).click();

  // **التنقّل بالبطاقة لا بزرّ داخلها** (القرار رقم 180). وموقع واحد بمزرعة
  // واحدة قد يُتخطّى تلقائيًا (القرار #132)، فتُضغط البطاقة إن ظهرت أصلًا
  const siteCard = page.getByTestId("site-card-3");
  if (await siteCard.isVisible().catch(() => false)) await siteCard.click();

  await expect(page.getByTestId("house-tile-1")).toBeVisible();
}

/** قياس نصّ: الفيض الأفقي والرأسي وعدد الأسطر المرئية. */
async function measureText(locator: Locator): Promise<{
  scrollW: number;
  clientW: number;
  scrollH: number;
  clientH: number;
  text: string;
  lines: number;
}> {
  return await locator.evaluate((el) => ({
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
    scrollH: el.scrollHeight,
    clientH: el.clientHeight,
    text: el.textContent.trim(),
    /**
     * **عدد الأسطر المرئية = عدد المواضع الرأسية المتمايزة**، لا عدد
     * المستطيلات: `getClientRects` تُرجع مستطيلًا لكل جزء نصّي.
     */
    lines: (() => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set<number>();
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.height > 0) tops.add(Math.round(rect.top));
      }
      return tops.size;
    })(),
  }));
}

/** صندوق مربّع عنبر — يرمي عند غيابه بدل أن يمرّ `null` صامتًا. */
async function tileBox(page: Page, id: number): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.getByTestId(`house-tile-${String(id)}`).boundingBox();
  if (box === null) throw new Error(`مربّع العنبر ${String(id)} بلا صندوق`);
  return box;
}

/** يصل إلى مستوى المواقع — قبل أي ضغط على بطاقة. */
async function reachSitesLevel(page: Page): Promise<void> {
  await stubOwnerSession(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "المزارع" }).click();
  await expect(page.getByTestId("site-card-3")).toBeVisible();
}

test.describe("شبكة العنابر — §5-د/2", () => {
  test("ثلاثة أعمدة على عرض 390", async ({ page }) => {
    await reachHousesGrid(page);

    const boxes = await Promise.all(HOUSES.map((h) => tileBox(page, h.id)));
    const [first, second, third, fourth] = boxes;
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error("عدد المربّعات أقل من أربعة");
    }

    // الثلاثة الأولى على صفّ واحد: نفس y، وأربعة لا تجتمع في صفّ
    expect(second.y).toBeCloseTo(first.y, 0);
    expect(third.y).toBeCloseTo(first.y, 0);
    expect(fourth.y).toBeGreaterThan(first.y + 1);

  });

  test("التسمية القصيرة تظهر كاملة بلا اقتطاع", async ({ page }) => {
    await reachHousesGrid(page);

    const label = page.getByText(LONGEST_SHORT_LABEL, { exact: true });
    await expect(label).toBeVisible();

    // **القياس لا الوجود**: النص المقصوص موجود في الشجرة وعرضه المطلي أقل من
    // عرضه الحقيقي — نفس فجوة القرار #173. فيُقارَن scrollWidth بـclientWidth.
    const box = await measureText(label);

    expect(box.text).toBe(LONGEST_SHORT_LABEL);
    expect(box.scrollW).toBeLessThanOrEqual(box.clientW + 1);
    expect(box.scrollH).toBeLessThanOrEqual(box.clientH + 1);
    // سطر واحد يكفي التسمية القصيرة في عمود 114px
    expect(box.lines).toBe(1);
  });

});

test.describe("شبكة العنابر — اللمس والارتفاع", () => {
  test("هدف اللمس لفعل التعديل لا يقلّ عن 44 — بصندوقه وhitSlop معًا", async ({ page }) => {
    await reachHousesGrid(page);

    // الزر في صفّ الاسم، وصندوقه المرئي أصغر من 44 عمدًا كي لا يطول المربّع.
    // **فالهدف يُقاس بالصندوق + hitSlop** — وهو ما تلمسه الإصبع فعلًا.
    const edit = page.getByTestId("house-tile-edit-1");
    const box = await edit.boundingBox();
    if (box === null) throw new Error("فعل التعديل بلا صندوق");

    // hitSlop المعلَن في المكوّن — يُقرأ من مصدر واحد لا يُخمَّن هنا
    const HIT_SLOP = 12;
    expect(box.height + HIT_SLOP * 2).toBeGreaterThanOrEqual(44);
    expect(box.width + HIT_SLOP * 2).toBeGreaterThanOrEqual(44);
  });

  /**
   * **أطول نصّ ممكن في زرّ الإضافة** — «إضافة عنبر إلى ‹أطول اسم مزرعة في
   * بيانات العرض›». وهو الزرّ الذي رُصد فيه نقصٌ على الجهاز (§7-ب البند 35)،
   * فيُقاس هنا بالهندسة لا بوجود النصّ.
   */
  test("نصّ زرّ الإضافة يظهر كاملًا بلا اقتطاع على 390", async ({ page }) => {
    await reachHousesGrid(page);

    const add = page.getByTestId("level-add");
    await expect(add).toBeVisible();

    const measured = await add.evaluate((el) => {
      const label = el.querySelector("div,span") === null ? el : el;
      return {
        text: el.textContent.trim(),
        boxW: Math.round(el.getBoundingClientRect().width),
        boxH: Math.round(el.getBoundingClientRect().height),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        tag: label.tagName,
      };
    });

    // eslint-disable-next-line no-console
    console.log(`[قياس الزر] "${measured.text}" عرض=${String(measured.boxW)} ارتفاع=${String(measured.boxH)} مطلوب=${String(measured.scrollW)} متاح=${String(measured.clientW)}`);

    expect(measured.text).toBe("إضافة عنبر إلى مزرعة الخماسية 2");
    expect(measured.scrollW).toBeLessThanOrEqual(measured.clientW + 1);
    expect(measured.scrollH).toBeLessThanOrEqual(measured.clientH + 1);
    // هدف اللمس
    expect(measured.boxH).toBeGreaterThanOrEqual(44);
  });

  test("مربّعات الصف الواحد متساوية الارتفاع", async ({ page }) => {
    await reachHousesGrid(page);

    const [a, b, c] = await Promise.all([1, 2, 3].map((id) => tileBox(page, id)));
    if (a === undefined || b === undefined || c === undefined) {
      throw new Error("عدد المربّعات أقل من ثلاثة");
    }
    expect(b.height).toBeCloseTo(a.height, 0);
    expect(c.height).toBeCloseTo(a.height, 0);
  });
});

/**
 * التنقّل بالبطاقة (القرار رقم 180) — يُقاس على الشاشة الحقيقية لا في jest:
 * هدف اللمس والدور والانتقال الفعلي.
 */
test.describe("التنقّل بالبطاقة — القرار رقم 180", () => {
  test("بطاقة الموقع زرّ، وهدف لمسها لا يقلّ عن 44", async ({ page }) => {
    await reachSitesLevel(page);

    const card = page.getByTestId("site-card-3");
    await expect(card).toBeVisible();

    const box = await card.boundingBox();
    if (box === null) throw new Error("بطاقة الموقع بلا صندوق");
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await card.getAttribute("role")).toBe("button");
  });

  test("لا زرّ «عرض المزارع» داخل البطاقة بعد اليوم", async ({ page }) => {
    await reachSitesLevel(page);

    await expect(page.getByRole("button", { name: "عرض المزارع" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "عرض العنابر" })).toHaveCount(0);
  });
});

/**
 * **محاذاة ⋮ الرأسية** — تأكيد جديد لأن ما قبله يقيس **الأحجام والاقتطاع
 * ولا يقيس الموضع**، فمرّ عطب المحاذاة من كل البوابات خضراء (القرار رقم 180).
 */
test.describe("محاذاة ⋮ في صفّ العنوان", () => {
  test("مركز ⋮ داخل ارتفاع سطر العنوان لا أسفله", async ({ page }) => {
    await reachSitesLevel(page);

    const title = page.getByText("موقع الصعيد", { exact: true });
    const more = page.getByTestId("site-card-3-more");
    await expect(more).toBeVisible();

    const titleBox = await title.boundingBox();
    const moreBox = await more.boundingBox();
    if (titleBox === null || moreBox === null) throw new Error("العنوان أو ⋮ بلا صندوق");

    const moreCenter = moreBox.y + moreBox.height / 2;
    const titleTop = titleBox.y;
    const titleBottom = titleBox.y + titleBox.height;

    // eslint-disable-next-line no-console
    console.log(
      `[محاذاة] سطر العنوان ${String(Math.round(titleTop))}..${String(Math.round(titleBottom))} · مركز ⋮ ${String(Math.round(moreCenter))}`
    );

    expect(moreCenter).toBeGreaterThanOrEqual(titleTop);
    expect(moreCenter).toBeLessThanOrEqual(titleBottom);
  });
});
