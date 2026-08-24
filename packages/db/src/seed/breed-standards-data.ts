import type { Breed } from "@dawajin/shared";

/**
 * ⚠️⚠️⚠️ بيانات تقريبية مولَّدة رياضيًا — ليست جداول الأداء الرسمية.
 * راجع docs/decisions.md #56 قبل أي تعديل على هذا الملف.
 *
 * المصادر الرسمية المطلوبة عند الاستبدال:
 *   - Ross 308 · Arbor Acres  ← Aviagen  (Performance Objectives)
 *   - Cobb 500                ← Cobb-Vantress (Performance & Nutrition Supplement)
 *
 * الغرض الحالي فقط: تعبئة `breed_standards` من اليوم 1 إلى 45 بمنحنى نمو
 * معقول الشكل (Gompertz) يكفي لتطوير واختبار الشاشات ومنطق المقارنة
 * بالمعيار — لا أكثر.
 *
 * 🚫 **بوابة قطع منفصلة قبل الإنتاج — لا اختيارية ولا ضمن قائمة عامة:**
 * ممنوع تسليم هذا النظام لأي عميل حقيقي قبل استبدال هذه الدالة بالكامل
 * بجداول الأداء الرسمية أعلاه، بصرف النظر عن اكتمال أي معيار قبول آخر
 * (docs/work-plan.md المرحلة 7 — بند "الاكتمال"). البيانات هنا *تبدو*
 * مكتملة (45 يومًا × 3 سلالات بلا فراغات) وهذا بالضبط ما يجعلها خطرة —
 * كل مقارنة بالمعيار في التطبيق ستنتج رقمًا يبدو صحيحًا وهو ليس كذلك.
 */

export interface BreedStandardRow {
  breed: Breed;
  day: number;
  targetWeightG: number;
  cumulativeMortalityPct: number;
  targetFcr: number;
  dailyFeedGPerBird: number;
  chickWeightG: number;
}

interface BreedCurveParams {
  breed: Breed;
  chickWeightG: number;
  asymptoteG: number; // الوزن النظري الأقصى في المنحنى
  growthRate: number; // معدل النمو (Gompertz b)
  inflectionDay: number; // يوم أسرع نمو (Gompertz c)
  finalMortalityPct: number; // النفوق التراكمي المتوقع في اليوم 45
  finalFcr: number; // FCR المستهدف في اليوم 45
  startFcr: number; // FCR المستهدف في اليوم 1
}

const CURVES: BreedCurveParams[] = [
  {
    breed: "Ross 308",
    chickWeightG: 42,
    asymptoteG: 3100,
    growthRate: 3.7,
    inflectionDay: 19,
    finalMortalityPct: 4.2,
    finalFcr: 1.62,
    startFcr: 0.9,
  },
  {
    breed: "Cobb 500",
    chickWeightG: 43,
    asymptoteG: 3050,
    growthRate: 3.6,
    inflectionDay: 19.5,
    finalMortalityPct: 4.0,
    finalFcr: 1.6,
    startFcr: 0.9,
  },
  {
    breed: "Arbor Acres",
    chickWeightG: 42,
    asymptoteG: 3000,
    growthRate: 3.65,
    inflectionDay: 19.2,
    finalMortalityPct: 4.3,
    finalFcr: 1.63,
    startFcr: 0.9,
  },
];

/** منحنى Gompertz: W(t) = A × exp(-b × exp(-k × t)) */
function gompertzWeight(day: number, params: BreedCurveParams): number {
  const k = 0.115; // ثابت انحناء موحّد يعطي شكلًا واقعيًا لدجاج التسمين
  const b = params.growthRate;
  return params.asymptoteG * Math.exp(-b * Math.exp(-k * day));
}

function buildBreedRows(params: BreedCurveParams): BreedStandardRow[] {
  const rows: BreedStandardRow[] = [];
  let previousWeight = params.chickWeightG;

  for (let day = 1; day <= 45; day++) {
    const targetWeightG = Math.round(gompertzWeight(day, params));
    const dailyGainG = Math.max(targetWeightG - previousWeight, 1);

    // FCR يتحسن كفاءة إطعام مبكرة ثم يرتفع تدريجيًا مع تقدّم العمر (نمط واقعي عام)
    const fcrProgress = day / 45;
    const targetFcr = params.startFcr + (params.finalFcr - params.startFcr) * fcrProgress ** 1.3;

    // الاستهلاك اليومي يُشتق من الزيادة اليومية والـ FCR الجاري
    const dailyFeedGPerBird = Math.round(dailyGainG * targetFcr * 1.15 + day * 1.2);

    // نفوق تراكمي تصاعدي أبطأ في البداية (منحنى قريب من الأسي)
    const mortalityProgress = 1 - Math.exp(-day / 22);
    const cumulativeMortalityPct = Number(
      (params.finalMortalityPct * mortalityProgress).toFixed(2)
    );

    rows.push({
      breed: params.breed,
      day,
      targetWeightG,
      cumulativeMortalityPct,
      targetFcr: Number(targetFcr.toFixed(3)),
      dailyFeedGPerBird,
      chickWeightG: params.chickWeightG,
    });

    previousWeight = targetWeightG;
  }

  return rows;
}

/**
 * يولّد صفوف بذر breed_standards لثلاث السلالات، الأيام 1-45.
 * @returns 135 صفًا (45 يومًا × 3 سلالات) — ⚠️ تقريبية، راجع تحذير الملف أعلاه والقرار #56
 */
export function buildBreedStandardsSeedData(): BreedStandardRow[] {
  return CURVES.flatMap(buildBreedRows);
}
