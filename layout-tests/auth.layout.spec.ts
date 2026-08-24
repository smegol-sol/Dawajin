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
  /**
   * الهدف هنا `/design-system` لا شاشة اختيار الحساب: حُذف `AppHeader` منها
   * بقرار المالك (القرار #93 — لا رجوع بلا وجهة ولا جرس قبل الدخول). صفحة
   * العرض هي المستهلك الحقيقي الوحيد للمتغيّر الفرعي حاليًا، ونقل التأكيد
   * إليها يبقي §7-ب البند 6 محروسًا بدل أن تسقط الحراسة مع حذف المستهلك.
   */
  test("قاعدة 1: سهم الرجوع يمين الهيدر والجرس يساره (§7-ب البند 6)", async ({ page }) => {
    await page.goto("/design-system");
    await page.getByTestId("app-header-back").waitFor();

    const arrowBox = await page.getByTestId("app-header-back").boundingBox();
    const bellBox = await page.getByTestId("app-header-bell").last().boundingBox();
    if (arrowBox === null || bellBox === null) throw new Error("عناصر الهيدر غير مرئية");

    // في RTL: البداية يمينًا. سهم الرجوع يجب أن يكون **أيمن** من الجرس
    // إحداثيًا لا في ترتيب DOM وحده — وهذا ما عجز اختبار jest عن فحصه.
    expect(arrowBox.x).toBeGreaterThan(bellBox.x);
  });

  test("قاعدة 4: عنوان الشاشة محاذاته يمين حصرًا", async ({ page }) => {
    await reachSelectAccount(page);

    const title = await boxOf(page, "select-account-title");
    const card = await boxOf(page, "account-card-0");

    // حافة العنوان اليمنى تحاذي حافة المحتوى اليمنى — لا يسارًا ولا وسطًا
    const titleRight = title.x + title.width;
    const cardRight = card.x + card.width;
    expect(Math.abs(titleRight - cardRight)).toBeLessThan(24);
    expect(title.x).toBeGreaterThan(card.x - 24);
  });

  test("لا سهم رجوع ولا جرس في شاشة اختيار الحساب (القرار #93)", async ({ page }) => {
    await reachSelectAccount(page);

    // الرجوع بلا وجهة (كلمة المرور تحققت)، ولا إشعارات لحساب لم يُختَر بعد
    await expect(page.getByTestId("app-header-back")).toHaveCount(0);
    await expect(page.getByTestId("app-header-bell")).toHaveCount(0);
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

/**
 * **الشاشة الطويلة هي موضع الخلل لا القصيرة.** المحاولة الأولى وضعت تأكيدَي
 * التمديد على 360×640 فمرّا حتى مع `justifyContent: "space-between"` القديم —
 * لأن المحتوى يملأ الشاشة القصيرة فلا تبقى مساحة فائضة تُوزَّع، فالتخطيطان
 * متطابقان هناك. تأكيد يمرّ في الحالتين لا يحرس شيئًا (القرار #94).
 *
 * **وتُطبَّق على شاشات المصادقة الثلاث لا على شاشة الدخول وحدها** (القرار
 * #96): أُصلح التمديد في `login` وحدها أول مرة وبقي في `change-password`،
 * لأن التأكيد كان يعرف شاشة واحدة. المِرساتان `auth-header`/`auth-content`
 * من `AuthScreen` تجعلان التأكيد عامًّا بلا معرفة ببنية أي شاشة.
 */
interface AuthScreenCase {
  name: string;
  /**
   * حاوية الشاشة نفسها. **الحصر بها إلزامي**: `router.push` يُبقي الشاشة
   * السابقة مركَّبة في المكدّس، فـ`auth-header` يطابق عنصرين على شاشة
   * اختيار الحساب (واحد مخفي من شاشة الدخول). قياس بلا حصر يقرأ الشاشة
   * الخطأ أو يفشل بلا سبب مفهوم.
   */
  screenTestID: string;
  hasFooter: boolean;
  open: (page: Page) => Promise<void>;
}

/** صندوق مِرساة داخل شاشة بعينها — لا على مستوى الصفحة (انظر `screenTestID`). */
async function anchorBox(page: Page, screenTestID: string, anchor: string) {
  const box = await page.getByTestId(screenTestID).getByTestId(anchor).boundingBox();
  if (box === null) throw new Error(`المِرساة ${anchor} غير مرئية داخل ${screenTestID}`);
  return box;
}

const AUTH_SCREENS: AuthScreenCase[] = [
  {
    name: "تسجيل الدخول",
    screenTestID: "login-screen",
    hasFooter: true,
    open: async (page) => {
      await page.goto("/auth/login");
      await page.getByTestId("login-screen").getByTestId("auth-content").waitFor();
    },
  },
  {
    name: "اختيار الحساب",
    screenTestID: "select-account-screen",
    hasFooter: false,
    open: reachSelectAccount,
  },
  {
    name: "تغيير كلمة المرور",
    screenTestID: "change-password-screen",
    hasFooter: true,
    open: async (page) => {
      await page.goto("/auth/change-password");
      await page.getByTestId("change-password-screen").getByTestId("auth-content").waitFor();
    },
  },
];

test.describe("تخطيط شاشات المصادقة — الشاشة الطويلة (موضع التمديد)", () => {
  for (const screen of AUTH_SCREENS) {
    test(`${screen.name}: المحتوى يبدأ في الثلث الأعلى لا قرب المنتصف`, async ({ page }) => {
      await screen.open(page);

      const header = await anchorBox(page, screen.screenTestID, "auth-header");
      const content = await anchorBox(page, screen.screenTestID, "auth-content");

      // كتلة العنوان في أعلى الشاشة، والمحتوى بعدها مباشرة — لا مدفوعًا
      // للمنتصف بتوزيع المساحة الفائضة (كان المحتوى عند ~339 من 844)
      expect(header.y).toBeLessThan(844 / 6);
      expect(content.y).toBeLessThan(844 / 3);
    });

    if (screen.hasFooter) {
      test(`${screen.name}: الفجوة بين المحتوى والإجراء ليست ممطوطة`, async ({ page }) => {
        await screen.open(page);

        const content = await anchorBox(page, screen.screenTestID, "auth-content");
        const footer = await anchorBox(page, screen.screenTestID, "auth-footer");

        // فجوة من مقياس المسافات لا تمديد `space-between` (كان ~220px)
        const gap = footer.y - (content.y + content.height);
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThan(120);
      });
    }
  }
});

test.describe("تخطيط شاشات المصادقة على شاشة صغيرة", () => {
  // أصغر مقاس شائع فعليًا (iPhone SE) — السؤال هنا مختلف: هل يبقى الإجراء
  // في متناول الإبهام بلا تمرير حين يضيق الارتفاع؟
  test.use({ viewport: { width: 360, height: 640 } });

  for (const screen of AUTH_SCREENS.filter((s) => s.hasFooter)) {
    test(`${screen.name}: الإجراء مرئي كاملًا بلا تمرير`, async ({ page }) => {
      await screen.open(page);
      const footer = await anchorBox(page, screen.screenTestID, "auth-footer");
      expect(footer.y + footer.height).toBeLessThanOrEqual(640);
    });
  }
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

  test("النص الإرشادي لصيغة الجوال تحت حقله مباشرة وفوق حقل كلمة المرور", async ({ page }) => {
    await page.goto("/auth/login");

    const phone = await boxOf(page, "login-phone");
    const hint = await boxOf(page, "login-phone-hint");
    const password = await boxOf(page, "login-password");

    expect(hint.y).toBeGreaterThanOrEqual(phone.y + phone.height);
    expect(hint.y).toBeLessThan(password.y);
  });
});
