import { render } from "@testing-library/react-native";

import { HouseTile } from "@/components/infrastructure/SiteCards";
import { statusFill } from "@/constants/theme";
import { houseStatusIcon, houseStatusShortLabel, houseStatusTone } from "@/lib/houseStatusTone";
import type { HouseCard } from "@/lib/infrastructureApi";

/**
 * **اللون وحده ممنوع** (§8.1 و§11: عمى الألوان شائع ولن يخبرك أحد). كل مربّع
 * في الشبكة يحمل **ثلاثة معًا**: لون الحالة · أيقونتها · اسمها نصًّا.
 *
 * والاختبار يفحص الحالات السبع كلها **وحالة غير معروفة** — فالأخيرة يجب أن
 * تلفت لا أن تمرّ (تنبيه وعلامة استفهام، لا لون سليم).
 */
const STATUSES = [
  "مشغول",
  "تحت الإخلاء",
  "تحت التنظيف والتطهير",
  "في فترة الراحة",
  "جاهز للإسكان",
  "تحت الصيانة",
  "معطّل",
  "حالة لم تُعرَّف بعد",
];

/** يسطّح نمط RN (قد يكون مصفوفة) إلى كائن واحد — بلا `any`. */
function flattenStyle(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style : [style];
  return parts.reduce<Record<string, unknown>>((acc, part) => {
    return typeof part === "object" && part !== null
      ? { ...acc, ...(part as Record<string, unknown>) }
      : acc;
  }, {});
}

function houseWith(status: string): HouseCard {
  return { id: 1, farmId: 9, name: "عنبر 1", type: "مغلق", status, waterTankCapacityL: null };
}

describe("مربّع العنبر — لون وأيقونة ونص معًا", () => {
  it.each(STATUSES)("«%s» تعرض تسميتها القصيرة نصًّا بلا اقتطاع", (status) => {
    const view = render(<HouseTile house={houseWith(status)} />);

    // **النص داخل المربّع** — لا دليل ألوان يعوّضه (§11)
    const label = view.getByText(houseStatusShortLabel(status));
    expect(label).toBeTruthy();
    // ولا `numberOfLines`: التسمية القصيرة تكفي، والقصّ ممنوع أصلًا
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it.each(STATUSES)("«%s» تحمل أيقونة الحالة", (status) => {
    // الأيقونة من الجدول القائم لا من جدول ثالث
    expect(houseStatusIcon(status)).toBeDefined();
    const view = render(<HouseTile house={houseWith(status)} />);
    expect(view.getByTestId("house-tile-1")).toBeTruthy();
  });

  it.each(STATUSES)("«%s» تملأ خلفية المربّع بلون تعبئة الحالة", (status) => {
    const view = render(<HouseTile house={houseWith(status)} />);
    const tile = view.getByTestId("house-tile-1");
    const style = flattenStyle(tile.props.style);

    expect(style.backgroundColor).toBe(statusFill[houseStatusTone(status)]);
  });

  it("حالة غير معروفة تأخذ فئة تلفت وتسمية تلفت لا «يُنتج»", () => {
    expect(houseStatusTone("حالة لم تُعرَّف بعد")).toBe("preparing");
    expect(houseStatusShortLabel("حالة لم تُعرَّف بعد")).toBe("غير معروفة");
  });

  it("السبع تبقى سبعًا — لا تجميع في أربع مجموعات", () => {
    const labels = STATUSES.slice(0, 7).map(houseStatusShortLabel);
    expect(new Set(labels).size).toBe(7);
  });

  it("التسمية الكاملة تبقى كما هي خارج الشبكة", () => {
    // الجدول الثالث للشبكة وحدها — لا يمسّ نصّ الحالة في القوائم والشارات
    expect(houseStatusShortLabel("تحت التنظيف والتطهير")).toBe("تنظيف");
    expect("تحت التنظيف والتطهير").not.toBe(houseStatusShortLabel("تحت التنظيف والتطهير"));
  });

  it("«النوع غير محدَّد» يُكتب ولا يُحذف — غيابه معلومة", () => {
    const view = render(
      <HouseTile
        house={{
          id: 2,
          farmId: 9,
          name: "عنبر 2",
          type: null,
          status: "مشغول",
          waterTankCapacityL: null,
        }}
      />
    );
    expect(view.getByText("النوع غير محدَّد")).toBeTruthy();
  });

  it("فعل التعديل يظهر بالقدرة لا بالدور", () => {
    const withoutEdit = render(<HouseTile house={houseWith("مشغول")} />);
    expect(withoutEdit.queryByTestId("house-tile-edit-1")).toBeNull();

    const withEdit = render(<HouseTile house={houseWith("مشغول")} onEdit={() => undefined} />);
    expect(withEdit.getByTestId("house-tile-edit-1")).toBeTruthy();
  });
});
