import { expect, test, type Page } from "@playwright/test";

/**
 * تأكيدات التخطيط لقواعد §10 الموضعية على مسار تسجيل الدخول — البند المجدول
 * في `docs/work-plan.md` §7-ب (البند 7، القرار #81)، وأول هدف له هو البند 6:
 * سهم الرجوع في `AppHeader`.
 *
 * لماذا هنا لا في اختبارات RTL بـjest: `react-test-renderer` لا يُنفّذ تخطيط
 * Yoga إطلاقًا — لا إحداثيات x/y ليُستعلَم عنها، وهو بالضبط سبب نجاح اختبار
 * `AppHeader` دائمًا بينما العرض خاطئ (القرار #80).
 *
 * الشبكة مُستبدَلة بـ`page.route` لا خادم حقيقي: التأكيدات على التخطيط، فربطها
 * بقاعدة بيانات يجعل فشلها غامضًا بين تخطيط وبيانات.
 */

const ACCOUNTS = [
  {
    tenantId: 41,
    // اسم قصير واسم طويل عمدًا في نفس الشاشة — §10 قاعدة 7
    tenantName: "مزارع الوادي",
    fullName: "د. سالم الحضرمي",
    role: "vet",
  },
  {
    tenantId: 77,
    tenantName: "شركة الأمانة لإنتاج وتسمين دواجن اللحم المحدودة",
    fullName: "د. سالم الحضرمي",
    role: "vet",
  },
];

/**
 * يستبدل استجابة تسجيل الدخول بطلب اختيار حساب — بلا خادم ولا قاعدة.
 *
 * النمط يجب أن يتضمّن بادئة `/api` لا أن ينتهي بـ`/auth/login` وحده: الأخير
 * يطابق **تنقّل الصفحة نفسه** (`/auth/login`) فيُستبدَل مستند HTML بـJSON
 * ولا يُقلَع التطبيق أصلًا — كلّف هذا خمس محاولات فاشلة قبل تشخيصه.
 */
async function stubTenantSelection(page: Page): Promise<void> {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ needsTenantSelection: true, accounts: ACCOUNTS }),
    });
  });
}

/** يمرّ بشاشة الدخول فعليًا حتى شاشة اختيار الحساب — لا انتقال مباشر بالرابط. */
async function reachSelectAccount(page: Page): Promise<void> {
  await stubTenantSelection(page);
  await page.goto("/auth/login");

  await page.getByTestId("login-phone").fill("770000000");
  await page.getByTestId("login-password").fill("Passw0rd!23");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();

  await expect(page.getByTestId("account-card-0")).toBeVisible();
}

/**
 * يقرأ صندوق عنصر ويفشل بوضوح إن غاب — `boundingBox()` يُرجع null لعنصر
 * غير مرئي، و`null.x` يعطي رسالة فشل لا تدل على السبب.
 */
async function boxOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (box === null) throw new Error(`العنصر ${testId} غير مرئي — لا صندوق له`);
  return box;
}

test.describe("قواعد §10 الموضعية — مسار تسجيل الدخول", () => {
  test("قاعدة 1: سهم الرجوع يمين الهيدر والجرس يساره (§7-ب البند 6)", async ({ page }) => {
    await reachSelectAccount(page);

    const arrow = page.getByTestId("app-header-back");
    const bell = page.getByTestId("app-header-bell");
    const arrowBox = await arrow.boundingBox();
    const bellBox = await bell.boundingBox();
    if (arrowBox === null || bellBox === null) throw new Error("عناصر الهيدر غير مرئية");

    // في RTL: البداية يمينًا. سهم الرجوع يجب أن يكون **أيمن** من الجرس
    // إحداثيًا لا في ترتيب DOM وحده — وهذا ما عجز اختبار jest عن فحصه.
    expect(arrowBox.x).toBeGreaterThan(bellBox.x);
  });

  test("قاعدة 4: عنوان الشاشة محاذاته يمين — أيمن من مركز الهيدر", async ({ page }) => {
    await reachSelectAccount(page);

    const header = await boxOf(page, "app-header");
    const title = await boxOf(page, "app-header-title");

    const titleRight = title.x + title.width;
    const headerRight = header.x + header.width;
    // حافة العنوان اليمنى قريبة من حافة الهيدر اليمنى (بعد السهم والحشو)،
    // لا في منتصفها ولا على يسارها
    expect(headerRight - titleRight).toBeLessThan(header.width / 2);
    expect(title.x).toBeGreaterThan(header.x);
  });

  test("قاعدة 5: ارتفاع البطاقة مشتق من محتواها لا ثابت", async ({ page }) => {
    await reachSelectAccount(page);

    const short = await boxOf(page, "account-card-0");
    const long = await boxOf(page, "account-card-1");

    // البطاقة ذات الاسم الطويل أطول فعليًا — ارتفاع ثابت كان ليجعلهما
    // متساويتين ويقصّ النص (§10 قاعدة 5 و7)
    expect(long.height).toBeGreaterThan(short.height);

    // ولا تتداخلان: الثانية تبدأ بعد نهاية الأولى
    expect(long.y).toBeGreaterThanOrEqual(short.y + short.height);
  });

  test("قاعدة 2: حقل رقم الجوال باتجاه ltr — الأرقام لاتينية", async ({ page }) => {
    await page.goto("/auth/login");
    const direction = await page
      .getByTestId("login-phone")
      .evaluate((element: Element) => getComputedStyle(element).direction);
    expect(direction).toBe("ltr");
  });
});

test.describe("رسائل الخطأ تحت الحقل لا أعلى الشاشة (§8.11)", () => {
  test("رسالة بيانات خاطئة تظهر أسفل حقل كلمة المرور", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "invalid_credentials", message: "غير صحيحة" }),
      });
    });

    await page.goto("/auth/login");
    await page.getByTestId("login-phone").fill("770000000");
    await page.getByTestId("login-password").fill("wrong");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();

    const message = page.getByTestId("login-password-error");
    await expect(message).toBeVisible();

    const field = await boxOf(page, "login-password");
    const messageBox = await message.boundingBox();
    if (messageBox === null) throw new Error("رسالة الخطأ غير مرئية");

    // **تحت** الحقل: أعلى الرسالة تحت أسفل الحقل — لا أعلى الشاشة
    expect(messageBox.y).toBeGreaterThanOrEqual(field.y + field.height);
  });
});
