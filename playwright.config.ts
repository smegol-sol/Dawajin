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
  use: {
    // الأساس أولًا ثم ما نريد فرضه — النشر بعد المفاتيح كان يبتلع
    // `viewport` بقيمة سطح المكتب صامتًا
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    // مقاس هاتف ثابت: الإحداثيات تُقارَن ببعضها لا بقيم مطلقة، لكن تثبيت
    // المقاس يمنع اختلاف نقطة الانكسار (breakpoint) بين البيئات
    viewport: { width: 390, height: 844 },
    // كل التأكيدات على اتجاه RTL — نفس ما يفرضه lib/rtl.ts على الجهاز
    locale: "ar",
    ...(EXECUTABLE_PATH === undefined ? {} : { launchOptions: { executablePath: EXECUTABLE_PATH } }),
  },
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
