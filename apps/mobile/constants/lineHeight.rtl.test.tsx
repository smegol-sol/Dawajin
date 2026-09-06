import { render, screen } from "@testing-library/react-native";

import { BRAND, Logo } from "@/components/ui/Logo";
import { font } from "@/constants/theme";
import { textStyleOf } from "@/test-utils/rtl";

/**
 * **ارتفاع السطر — §7.2 منزَّلًا على الشاشة لا معرَّفًا وحده** (القرار 293).
 *
 * **وعلّةُ وجود هذا الملف أن ما تحته لا يراه شيءٌ آخر:** النسبُ الثلاث كانت
 * **مصدَّرةً في `theme.ts` بصفرِ مستدعين** في المستودع كلّه — **فبقيت §7.2
 * حبرًا**، **ورأى المالك النصّ العربيّ مقصوصًا رأسيًّا على جهازه** (ذيلُ الجيم
 * في «دواجن» وسطرُ التوضيح تحت حقل الجوال ولفظُ «متابعة»).
 *
 * **ولا تراه بوابةٌ ولا تأكيدُ تخطيط:** المتصفّح **يفيض بالنصّ ولا يقصّه** —
 * **فالعمى بنيويّ لا نقصُ فاحص** (§7-ب البند 37، الدليل السابع).
 *
 * ## واتجاهُ خطئه معلَن (القرار 270)
 *
 * **يمرّ ظلمًا على كل ما ليس هذه الكتلةَ بعينها**: لا يقيس أن السطر يتّسع
 * فعلًا للحرف — **ذلك يلزمه تخطيطُ Yoga وخطًّا محمَّلًا** (البند 37)، **ولا
 * يقع إلا على جهاز**. **ويمسك الغيابَ في كل كتلةٍ أخرى فاحصُ رموز التصميم.**
 * **ولا يفشل ظلمًا.**
 */
describe("ارتفاع السطر — §7.2", () => {
  /**
   * **شاهدُ ثابتٍ يعيد الحساب من أجزائه بأرقامٍ مسمّاة** (القرار 262):
   * الأرقامُ من جدول §7.2 ونصِّها، **لا من نفس الرمز المفحوص** — فمقارنةُ
   * `font.lineHeight.content` بـ`font.size.content * font.lineHeight...`
   * تطابقُ مجموعٍ بمجموعٍ من مصدرٍ واحد، تخضرّ ولو انحرف المصدر كلُّه.
   */
  it("**النصّ 1.7 · العناوين المضغوطة 1.4 · الأرقام الكبيرة 1 — مُقرَّبةً لأعلى**", () => {
    expect(font.lineHeight.content).toBe(26); // 15 × 1.7 = 25.5
    expect(font.lineHeight.badge).toBe(23); // 13 × 1.7 = 22.1
    expect(font.lineHeight.tabLabel).toBe(21); // 12 × 1.7 = 20.4
    expect(font.lineHeight.technicalRef).toBe(19); // 11 × 1.7 = 18.7
    expect(font.lineHeight.indicatorValue).toBe(26); // 18 × 1.4 = 25.2
    expect(font.lineHeight.subtitle).toBe(28); // 20 × 1.4 = 28 بالضبط
    expect(font.lineHeight.screenTitle).toBe(34); // 24 × 1.4 = 33.6
    expect(font.lineHeight.heroNumber).toBe(44); // 44 × 1
    expect(font.lineHeight.numberStepperValue).toBe(34); // 34 × 1
  });

  /**
   * **الكسرُ يقصّ النصّ على أندرويد** (القرار 296) — **مقيسٌ على جهاز المالك
   * في ثلاث جولات**. **والتقريبُ لأعلى لا لأقرب**: لأسفلَ يُضيّق الصندوق
   * فيعيد العطب.
   *
   * **وشاهدُ الصحيح لا يقلّ لزومًا عن شاهد الكسر:** `subtitle` حاصلُه **28
   * بالضبط**، **فالسطرُ الأخير يمسك تقريبًا يرفع صحيحًا إلى صحيح** — وذلك ما
   * يقع لو بلغت بقايا حجمٍ جديدٍ العائمةُ حدَّ الرفع.
   */
  it("**كلُّ ارتفاعٍ عددٌ صحيح — ولا كسرَ واحد**", () => {
    for (const [name, value] of Object.entries(font.lineHeight)) {
      expect(`${name}=${String(value)}`).toBe(`${name}=${String(Math.trunc(value))}`);
    }
    // **والصحيحُ لا يُرفع**: 20 × 1.4 يبقى 28 لا 29
    expect(font.lineHeight.subtitle).toBe(font.size.subtitle * 1.4);
  });

  /**
   * **الشمول** — حجمٌ بلا ارتفاعِ سطرٍ يصل الشاشة مقصوصًا. **و`satisfies` في
   * `theme.ts` يمسكها في `typecheck` أيضًا**، وهذا يمسكها لو زال.
   */
  it("**لكلّ حجمٍ في الرموز ارتفاعُ سطرٍ باسمه — لا حجمَ بلا ارتفاع**", () => {
    expect(Object.keys(font.lineHeight).sort()).toEqual(Object.keys(font.size).sort());
  });

  /**
   * **الشاهدُ الذي يفرّق** (القرار 277): **يقرأ النمطَ المحسوب من الشاشة لا
   * من الرمز** — **فإسقاطُ السطر من `Logo.tsx` يُسقطه**، ولا يُسقطه تطابقُ
   * الرموز أعلاه. **وهذه هي الكتلةُ التي رآها المالك مقصوصةً بعينه.**
   */
  it("**اسمُ العلامة يحمل ارتفاعَ سطرِ عنوانِ الشاشة على الشاشة نفسها**", () => {
    render(<Logo variant="full" />);
    const style = textStyleOf(screen.getByText(BRAND.name));
    expect(style.fontSize).toBe(font.size.screenTitle);
    expect(style.lineHeight).toBe(font.lineHeight.screenTitle);
  });
});
