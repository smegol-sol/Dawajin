import type { HouseType, UserRole } from "@dawajin/shared";

/**
 * بيانات البذر الثابتة — **المواقع السبعة في ميدان المالك** (القرار #113):
 * الجبل · الكرنة · الصعيد · الطويلة · الجاح · الخماسية · الحمراء.
 *
 * **وخمسة منها بأكثر من مزرعة** — تصديق المالك في القرار #116 البند 2:
 * «المستوى الثالث الحالة الغالبة لا الاستثناء». فالبذر يعكس ذلك لا يبسّطه،
 * لأن بيانات تجريبية بمزرعة واحدة لكل موقع **تخفي** المستوى الذي بُني له.
 *
 * **أسماء المزارع والعنابر افتراضية** — المالك سمّى المواقع السبعة ولم يسمِّ
 * ما تحتها. تُستبدل بأسماء الميدان متى وردت، ولا يُبنى عليها شيء.
 *
 * **وأرقامها لاتينية لا كلمات ترتيب** («مزرعة الصعيد 2» لا «الثانية»):
 * السرد مرتَّب بالاسم، **وكلمات الترتيب تُرتَّب أبجديًّا لا عدديًّا** فتظهر
 * «الأولى · الثالثة · الثانية» — ترتيب صحيح يبدو خطأً (القرار #168).
 */

export interface HouseFixture {
  readonly name: string;
  readonly type: HouseType;
  readonly waterTankCapacityL: number;
}

export interface FarmFixture {
  readonly name: string;
  readonly powerSources: readonly string[];
  readonly houses: readonly HouseFixture[];
}

export interface SiteFixture {
  readonly name: string;
  readonly farms: readonly FarmFixture[];
}

/**
 * عنابر مرقَّمة بنمط واحد — الاختلاف في النوع والسعة لا في التسمية.
 *
 * **ولا بادئة باسم المزرعة** (القرار رقم 178): العنبر يُعرض داخل مزرعته دائمًا،
 * فتكرار اسمها في كل عنبر حشوٌ يبتلع مربّع الشبكة ويكسر الاسم سطرين. **والعلاج
 * في بيانات العرض لا في الواجهة** — اسم المستخدم يُعرض كما أدخله، ومعالجته في
 * العرض تلاعب ببياناته.
 */
function houses(_farmLabel: string, specs: readonly [HouseType, number][]): HouseFixture[] {
  return specs.map(([type, waterTankCapacityL], index) => ({
    name: `عنبر ${(index + 1).toString()}`,
    type,
    waterTankCapacityL,
  }));
}

export const SITES: readonly SiteFixture[] = [
  {
    name: "الجبل",
    farms: [
      {
        name: "مزرعة الجبل 1",
        powerSources: ["شمسية", "مولدات"],
        houses: houses("الجبل 1", [
          ["مغلق", 1000],
          ["مغلق", 1000],
          ["مفتوح", 500],
          ["هجين", 500],
        ]),
      },
      {
        name: "مزرعة الجبل 2",
        powerSources: ["شمسية"],
        houses: houses("الجبل 2", [
          ["مفتوح", 500],
          ["مفتوح", 500],
          ["مغلق", 1000],
        ]),
      },
    ],
  },
  {
    name: "الكرنة",
    farms: [
      {
        name: "الكرنة الشرقية",
        powerSources: ["مولدات"],
        houses: houses("الكرنة الشرقية", [
          ["مغلق", 1000],
          ["مغلق", 1000],
          ["هجين", 500],
        ]),
      },
      {
        name: "الكرنة الغربية",
        powerSources: ["شمسية", "مولدات"],
        houses: houses("الكرنة الغربية", [
          ["مفتوح", 500],
          ["مفتوح", 500],
        ]),
      },
    ],
  },
  {
    name: "الصعيد",
    farms: [
      {
        name: "مزرعة الصعيد 1",
        powerSources: ["شمسية"],
        houses: houses("الصعيد 1", [
          ["مغلق", 1000],
          ["مفتوح", 500],
        ]),
      },
      {
        name: "مزرعة الصعيد 2",
        powerSources: ["شمسية"],
        houses: houses("الصعيد 2", [
          ["مفتوح", 500],
          ["هجين", 500],
        ]),
      },
      {
        name: "مزرعة الصعيد 3",
        powerSources: ["مولدات"],
        houses: houses("الصعيد 3", [
          ["مغلق", 1000],
          ["مغلق", 1000],
          ["مفتوح", 500],
        ]),
      },
    ],
  },
  {
    name: "الطويلة",
    farms: [
      {
        name: "مزرعة الطويلة",
        powerSources: ["شمسية", "مولدات"],
        houses: houses("الطويلة", [
          ["مغلق", 1000],
          ["مغلق", 1000],
          ["مفتوح", 500],
          ["هجين", 500],
        ]),
      },
    ],
  },
  {
    name: "الجاح",
    farms: [
      {
        name: "الجاح العليا",
        powerSources: ["مولدات"],
        houses: houses("الجاح العليا", [
          ["مفتوح", 500],
          ["مفتوح", 500],
          ["هجين", 500],
        ]),
      },
      {
        name: "الجاح السفلى",
        powerSources: ["شمسية"],
        houses: houses("الجاح السفلى", [
          ["مغلق", 1000],
          ["مفتوح", 500],
        ]),
      },
    ],
  },
  {
    name: "الخماسية",
    farms: [
      {
        name: "مزرعة الخماسية 1",
        powerSources: ["شمسية"],
        houses: houses("الخماسية 1", [
          ["مغلق", 1000],
          ["مفتوح", 500],
        ]),
      },
      {
        name: "مزرعة الخماسية 2",
        powerSources: ["شمسية", "مولدات"],
        houses: houses("الخماسية 2", [
          ["هجين", 500],
          ["مفتوح", 500],
        ]),
      },
    ],
  },
  {
    name: "الحمراء",
    farms: [
      {
        name: "مزرعة الحمراء",
        powerSources: ["مولدات"],
        houses: houses("الحمراء", [
          ["مغلق", 1000],
          ["مغلق", 1000],
          ["مفتوح", 500],
        ]),
      },
    ],
  },
];

/**
 * حسابات العرض الأربعة. **الأرقام ثابتة عمدًا** كي يستطيع المالك الدخول بها
 * من جواله بلا بحث في القاعدة، **وكلمة المرور من البيئة لا من الكود**.
 */
export interface DemoAccount {
  readonly key: "owner" | "supervisor" | "vet" | "farmer";
  readonly role: UserRole;
  readonly fullName: string;
  readonly phone: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { key: "owner", role: "owner", fullName: "مالك العرض", phone: "770000001" },
  { key: "supervisor", role: "supervisor", fullName: "مشرف العرض", phone: "770000002" },
  { key: "vet", role: "vet", fullName: "طبيب العرض", phone: "770000003" },
  { key: "farmer", role: "farmer", fullName: "مربّي العرض", phone: "770000004" },
];
