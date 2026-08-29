import { defineConfig, devices } from "@playwright/test";

/**
 * تأكيدات التخطيط (`boundingBox()`) لقواعد RTL الموضعية — القرار #81.
 * **ليست لقطة مرجعية** (مرفوضة صراحة هناك): لا صورة ثنائية، ولا اعتماد على
 * تصيير الخط، ولا إعادة توليد مرجع عند كل تغيير لون. تأكيدات إحداثيات
 * حتمية يُقرأ فرقها نصيًا في المراجعة.
 *
 * المخرَج المُختبَر هو بناء `expo export --platform web` الثابت لا خادم
 * التطوير — أسرع وأحتم، وبلا الأثر الجانبي الموثَّق لـ`expo start --web`
 * على `apps/mobile/tsconfig.json` (القرار #80).
 */

const PORT = Number(process.env.LAYOUT_TEST_PORT ?? "8787");
const WEB_BUILD_DIR = process.env.LAYOUT_TEST_ROOT ?? "apps/mobile/dist";

/**
 * مسار متصفح جاهز في بيئة تحمل نسخة مثبَّتة مسبقًا لا تطابق بناء Playwright
 * المتوقَّع. غير مضبوط = السلوك الافتراضي (`npx playwright install`)، وهو ما
 * يحدث في CI. لا مسار حاوية مثبَّت في الملف — ذلك يكسره على كل جهاز آخر.
 */
const EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./layout-tests",
  testMatch: /.*\.layout\.spec\.ts/,
  // متسلسل: التأكيدات على تخطيط صفحة واحدة، والتوازي لا يشتري شيئًا
  // ويجعل فشلًا نادرًا أصعب في إعادة إنتاجه
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  reporter: process.env.CI === undefined ? "list" : [["list"], ["github"]],
  /**
   * **مشروعان بعرضين، لا عرض واحد** (القرار رقم 182، ودَين §7-ب البند 38).
   *
   * كل التأكيدات كانت تعمل على 390 وحده، **وجهاز المالك 361.1dp**
   * (1264px ÷ كثافة 560/160) — فارق 29dp أي **7.4%** من العرض. فكل قياس
   * سابق قِيس على شاشة لا وجود لها عنده.
   *
   * **والمشتركات تبقى في `use`** فلا تتباعد نسختان منها: العنوان الأساسي ·
   * `locale: "ar"` · مسار المتصفح · وإعدادات `devices`.
   *
   * **وحدٌّ معلَن: `device-361` يحاكي العرض وحده لا مقياس الخط.** مقياس الخط
   * على جهاز المالك **0.85** و`react-native-web` لا يطبّقه، **وأي تقريب له
   * يصنع رقمًا كاذبًا — وذلك أسوأ من غيابه**.
   */
  use: {
    // الأساس أولًا ثم ما نريد فرضه — النشر بعد المفاتيح كان يبتلع
    // `viewport` بقيمة سطح المكتب صامتًا
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    // كل التأكيدات على اتجاه RTL — نفس ما يفرضه lib/rtl.ts على الجهاز
    locale: "ar",
    ...(EXECUTABLE_PATH === undefined ? {} : { launchOptions: { executablePath: EXECUTABLE_PATH } }),
  },
  projects: [
    {
      // جهاز المالك: 1264×2728 بكثافة 560 ← 361.1×779.4dp
      name: "device-361",
      use: { viewport: { width: 361, height: 779 } },
    },
    {
      // الأساس القائم — يبقى كما هو كي لا يضيع ما حرسه حتى اليوم
      name: "baseline-390",
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "node layout-tests/static-server.mjs",
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 60_000,
    env: {
      LAYOUT_TEST_PORT: String(PORT),
      LAYOUT_TEST_ROOT: WEB_BUILD_DIR,
    },
  },
});
