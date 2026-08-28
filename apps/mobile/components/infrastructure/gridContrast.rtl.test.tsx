import { statusFill } from "@/constants/theme";

/**
 * **حارس التباين — يمنع النكسة.**
 *
 * نصّ مربّع الشبكة أبيض على تعبئة ملوّنة، فيلزم **≥4.5** مع الأبيض
 * (WCAG 1.4.3). و15px وزن 700 **نصٌّ عادي** لا عريض: عتبة العريض 14 **نقطة**
 * = 18.66px، وبلوغها في عمود 114px غير معقول.
 *
 * وهذا الفحص هو سبب وجود `statusFill` أصلًا: `#B37714` قِيس **3.77** فسقط،
 * فاشتُقّ `#8A5A0F` عند **5.92** للشبكة وحدها (القرار رقم 178). وبلا هذا
 * الحارس يعود لون ساقط في أول تعديل رموز بلا أن يراه أحد.
 */
const MIN_CONTRAST = 4.5;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** إضاءة نسبية لـhex بصيغة `#RRGGBB` (WCAG 1.4.3). */
function luminance(hex: string): number {
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastWithWhite(hex: string): number {
  return (1 + 0.05) / (luminance(hex) + 0.05);
}

describe("تباين تعبئة الشبكة مع النصّ الأبيض", () => {
  it.each(Object.entries(statusFill))("«%s» يبلغ 4.5 على الأقل", (_tone, hex) => {
    expect(contrastWithWhite(hex)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("الحارس نفسه يمسك اللون الساقط — مخالفة متعمَّدة", () => {
    // `#B37714` هو ما كان مستعملًا فعلًا وسقط بالقياس. لولا أن الفحص يمسكه
    // لكان حارسًا بلا أسنان (نفس درس القرار #111: بوّابة تُثبَت بمخالفة).
    expect(contrastWithWhite("#B37714")).toBeLessThan(MIN_CONTRAST);
  });

  it("قيم التعبئة كلها hex نقي بست خانات", () => {
    for (const hex of Object.values(statusFill)) {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
