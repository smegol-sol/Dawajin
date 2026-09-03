import { expect, test, type Page } from "@playwright/test";

/**
 * **ماسحاتٌ عامّة تُشغَّل على كل شاشةٍ مبنيّة** (القرار 289، بحكم المالك).
 *
 * **وهي ثلاثةٌ، ومناطُها واحد: صنفُ عطبٍ لا يمسكه فاحصُ مصدرٍ إطلاقًا** —
 * **الخاصّيةُ الغائبة** لا القيمةُ المكتوبة. **وفاحصُ رموز التصميم يقرأ
 * `fontFamily:` حين تُكتب**، **والماسحُ يقرأ ما صُيِّر فعلًا** — فيمسك
 * الغيابَ والتركيبَ والوراثة معًا.
 *
 * **وعلّةُ العموم مقيسة لا مقدَّرة:** العطب الذي أنشأها — نصُّ حالة العنبر
 * بخطّ الأرقام (القرار 168) — **أُصلح في موضعه وحده**، **ووقع نظيرُه بعده
 * في `PlaceholderScreen`** (289): **الكتلتان تضبطان `fontSize` ولا تضبطان
 * `fontFamily`** — **فسقطت العربيةُ على خطّ النظام في ثمانَ عشرةَ شاشة**.
 * **فحارسٌ لموضعٍ واحد يترك الباقي، كما في القرار 284.**
 *
 * ## واتجاهُ خطئها معلَن (القرار 270): **تفشل ظلمًا، ولا تمرّ ظلمًا فيما
 * تفحصه**
 *
 * **والإنذارُ الكاذب مقيسٌ لا مفترَض** — وقع مرتين وأنا أبنيها:
 *
 * 1. **`<title>` في `head`** يحمل «دواجن» بخطّ `Times New Roman` **ولا
 *    يُصيَّر أصلًا** — **فالمسحُ محصورٌ بـ`document.body`**.
 * 2. **ومُحدِّدٌ يطابق عنصرين** يُرجع `isVisible() === false` — **والشاشةُ
 *    السابقة تبقى مركَّبة** (القرار 87).
 *
 * **وما يمرّ ظلمًا يُسمّى:** **كلُّ ما ليس خطًّا ولا اتجاهًا ولا خطأَ وحدةِ
 * تحكّم** — **ومنه الصوابُ اللغويّ** («ولك 3 عنبرٌ آخر» تُصيَّر بخطٍّ سليم
 * واتجاهٍ سليم، القرار 287) — **ومنه ما لا يُصيَّر إلا ببياناتٍ حيّة**.
 * **فهي لا تُغني عن نظر المالك، وشرطُ 287 قائمٌ بحاله.**
 */

/** الأدوار الأربعة — **وشريطُ كلٍّ خمسةُ تبويبات**، فالمسح على عشرين شاشة. */
const ROLES = ["farmer", "supervisor", "vet", "owner"] as const;

interface Violation {
  text: string;
  font: string;
  direction: string;
}

interface ScanResult {
  total: number;
  offFont: Violation[];
  ltr: Violation[];
}

/**
 * **يمسح كلَّ عقدةٍ ورقيّةٍ تحمل حرفًا عربيًّا داخل `body`.**
 *
 * **وورقيّةٌ لا حاويةٌ** (`children.length === 0`): الحاويةُ تُرجع نصَّ كلِّ
 * أبنائها **فيُعدّ النصُّ الواحد مرارًا**، **ونمطُها المحسوب ليس نمطَ ما يُرى**.
 *
 * **و`body` لا `document`** — **إنذارٌ كاذبٌ مقيس**: `<title>` في `head`
 * يحمل «دواجن» بخطّ `Times New Roman` **ولا يُصيَّر إطلاقًا**.
 */
async function scan(page: Page): Promise<ScanResult> {
  return page.evaluate(() => {
    const arabic = /[\u0600-\u06FF]/;
    const offFont: { text: string; font: string; direction: string }[] = [];
    const ltr: { text: string; font: string; direction: string }[] = [];
    let total = 0;
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
      if (element.children.length !== 0) continue;
      const text = element.textContent.trim();
      if (!text || !arabic.test(text)) continue;
      total++;
      const style = getComputedStyle(element);
      const row = {
        text: text.slice(0, 60),
        font: style.fontFamily,
        direction: style.direction,
      };
      if (!style.fontFamily.includes("Tajawal")) offFont.push(row);
      if (style.direction === "ltr") ltr.push(row);
    }
    return { total, offFont, ltr };
  });
}

/** استجابةُ JSON جاهزة — يتكرر بناؤها لكل مسار مستبدَل. */
function json(body: unknown): { status: number; contentType: string; body: string } {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

/**
 * **يستبدل الشبكةَ بأقلّ ما يجعل الشاشاتِ تُصيَّر** — **ولا قاعدةَ بيانات**:
 * الماسحُ حتميٌّ بلا تبعيةٍ ثالثة، **وهو شرطُ دخوله البوابة** (حكم المالك).
 */
/** بياناتُ الهرم — أقلُّ ما تحتاجه شاشتا المزارع والتسجيل كي تُصيَّرا. */
const SITE = { id: 1, name: "الموقع", farmCount: 1, houseCount: 1 };

const FARM = {
  id: 1,
  siteId: 1,
  name: "المزرعة",
  powerSources: ["مولدات"],
  houseCount: 1,
  houseStatusCounts: { occupied: 1, ready: 0, other: 0 },
};

const HOUSE = {
  id: 5,
  farmId: 1,
  name: "العنبر الشمالي",
  type: "مغلق",
  status: "مشغول",
  waterTankCapacityL: "1000",
};

const BATCH = {
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

const ACCOUNTS = { accounts: [{ tenantId: 1, tenantName: "مزارع العرض" }] };

function meBody(role: string): unknown {
  return {
    id: 1,
    tenantId: 1,
    fullName: "مستخدم العرض",
    role,
    phone: "770000000",
    isActive: true,
    mustChangePassword: false,
  };
}

/**
 * **يستبدل الشبكةَ بأقلّ ما يجعل الشاشاتِ تُصيَّر** — **ولا قاعدةَ بيانات**:
 * الماسحُ حتميٌّ بلا تبعيةٍ ثالثة، **وهو شرطُ دخوله البوابة** (حكم المالك).
 *
 * **والحدُّ 60 سطرًا يُحترم بالفصل لا برفعه** — فالأجسامُ ثوابتُ فوقه.
 */
async function stubNetwork(page: Page, role: string): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("dawajin.auth.token", "layout-test-token");
  });
  const routes: [string, unknown][] = [
    ["**/api/auth/me", meBody(role)],
    ["**/api/sites", { sites: [SITE] }],
    ["**/api/sites/*/farms", { farms: [FARM] }],
    ["**/api/farms/*/houses", { houses: [HOUSE] }],
    ["**/api/houses/*/batches", { batches: [BATCH] }],
    ["**/api/products", { products: [FEED] }],
    ["**/api/auth/accounts", ACCOUNTS],
  ];
  for (const [pattern, body] of routes) {
    await page.route(pattern, (route) => route.fulfill(json(body)));
  }
}

/** يلتقط كلَّ خطأٍ في وحدة التحكّم وكلَّ استثناءٍ غير ملتقَط في الصفحة. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 200));
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message.slice(0, 200)}`));
  return errors;
}

test.describe("ماسحاتٌ عامّة — كلُّ شاشةٍ مبنيّة", () => {
  for (const role of ROLES) {
    test(`شاشاتُ ${role} الخمس — خطُّ التطبيق واتجاهُ RTL وبلا خطأ`, async ({ page }) => {
      const errors = collectErrors(page);
      await stubNetwork(page, role);
      await page.goto("/");
      await expect(page.getByRole("tab").first()).toBeVisible();

      const tabs = await page.getByRole("tab").count();
      // **الخمسُ حاضرة** — فلا يخضرّ المسحُ على شريطٍ لم يُصيَّر
      expect(tabs).toBe(5);

      for (let index = 0; index < tabs; index++) {
        await page.getByRole("tab").nth(index).click();
        await expect(page.getByRole("tab").nth(index)).toHaveAttribute("aria-selected", "true");
        const result = await scan(page);
        // **ويُعدّ المفحوصُ لا الفارغُ وحده** — شاشةٌ بلا نصٍّ عربيّ تمرّ
        // من كل مرشِّحٍ مجّانًا، **فالعددُ هو ما يقول إن المسح وقع**
        expect(result.total).toBeGreaterThan(0);
        expect(result.offFont).toEqual([]);
        expect(result.ltr).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }

  test("شاشتا الدخول وكلمة المرور — ونظامُ التصميم", async ({ page }) => {
    const errors = collectErrors(page);
    await page.route("**/api/auth/accounts", (route) => route.fulfill(json(ACCOUNTS)));

    await page.goto("/auth/login");
    await expect(page.getByTestId("login-phone").first()).toBeVisible();
    const login = await scan(page);
    expect(login.total).toBeGreaterThan(0);
    expect(login.offFont).toEqual([]);
    expect(login.ltr).toEqual([]);

    await page.getByTestId("login-phone").first().fill("770000000");
    await page.getByRole("button", { name: "متابعة" }).click();
    await expect(page.getByTestId("password-field").first()).toBeVisible();
    const password = await scan(page);
    expect(password.total).toBeGreaterThan(0);
    expect(password.offFont).toEqual([]);
    expect(password.ltr).toEqual([]);

    // **ونظامُ التصميم أكثفُ شاشةٍ نصًّا** — يمرّ فيه كلُّ مكوّنٍ مبنيّ
    await page.goto("/design-system");
    await expect(page.getByText("نظام التصميم")).toBeVisible();
    const system = await scan(page);
    expect(system.total).toBeGreaterThan(50);
    expect(system.offFont).toEqual([]);
    expect(system.ltr).toEqual([]);

    expect(errors).toEqual([]);
  });
});
