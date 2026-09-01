import { HOUSE_CREATABLE_STATUSES } from "@dawajin/shared";
import { render, screen } from "@testing-library/react-native";

import {
  HouseStatusPicker,
  houseStatusBlockReason,
  statusNeedsReason,
} from "@/components/infrastructure/HouseStatusPicker";
import { Chip } from "@/components/ui/Chip";
import { propsOf } from "@/test-utils/rtl";

/**
 * خانة الحالة الابتدائية — §7-ب البند 40 (شقّ الشاشة)، والقرار 226.
 *
 * **وجوهر الإثبات أن لا خيار مُسبَق الاختيار** (القرار 186): **الفرق بين
 * «اختار جاهزًا» و«لم يختر فوُضع جاهزًا» هو كل ما في 186.**
 */
function noop(): void {
  // مقصود
}

function renderPicker(
  selected: (typeof HOUSE_CREATABLE_STATUSES)[number] | null = null,
  reason = ""
) {
  return render(
    <HouseStatusPicker selected={selected} onSelect={noop} reason={reason} onChangeReason={noop} />
  );
}

describe("خانة الحالة — لا خيار مُسبَق الاختيار (جوهر القرار 186)", () => {
  it("**بلا اختيار: لا خيار واحد محدَّد** — ولا «جاهز للإسكان» بينها", () => {
    renderPicker(null);
    const chips = screen.UNSAFE_getAllByType(Chip);
    expect(chips).toHaveLength(HOUSE_CREATABLE_STATUSES.length);
    expect(chips.map((chip) => propsOf(chip).selected)).toEqual([false, false, false]);
  });

  it("الخيارات تُقرأ من `HOUSE_CREATABLE_STATUSES` لا تُكتب نصًّا في الشاشة", () => {
    renderPicker(null);
    for (const status of HOUSE_CREATABLE_STATUSES) {
      expect(screen.getByText(status)).toBeTruthy();
    }
  });

  it("واحدٌ فقط يُحدَّد عند الاختيار — لا اثنان", () => {
    renderPicker("تحت الصيانة");
    const selected = screen.UNSAFE_getAllByType(Chip).filter((chip) => propsOf(chip).selected);
    expect(selected.map((chip) => propsOf(chip).label)).toEqual(["تحت الصيانة"]);
  });
});

describe("السبب — يظهر ويُلزَم عند الحالتين وحدهما (القرار 222)", () => {
  it("«جاهز للإسكان» ← لا حقل سبب إطلاقًا", () => {
    renderPicker("جاهز للإسكان");
    expect(screen.queryByTestId("house-status-reason")).toBeNull();
  });

  it.each(["تحت الصيانة", "معطّل"] as const)("«%s» ← حقل السبب يظهر", (status) => {
    renderPicker(status);
    expect(screen.getByTestId("house-status-reason")).toBeTruthy();
  });

  it("وبلا اختيار: لا حقل سبب — فلا يُسأل عن سببِ ما لم يُختر", () => {
    renderPicker(null);
    expect(screen.queryByTestId("house-status-reason")).toBeNull();
  });
});

describe("حجبُ الحفظ — السبب يظهر قبل الضغط لا بعده (§8.2)", () => {
  it("بلا اختيار ← محجوب بسببٍ يسمّي المطلوب", () => {
    expect(houseStatusBlockReason(null, "")).toBe("اختر حالة العنبر الابتدائية");
  });

  it("«جاهز للإسكان» بلا سبب ← غير محجوب", () => {
    expect(houseStatusBlockReason("جاهز للإسكان", "")).toBeNull();
  });

  it.each(["تحت الصيانة", "معطّل"] as const)("«%s» بلا سبب ← محجوب باسم الحالة", (status) => {
    expect(houseStatusBlockReason(status, "   ")).toContain(status);
  });

  it.each(["تحت الصيانة", "معطّل"] as const)("«%s» بسبب مكتوب ← يمرّ", (status) => {
    expect(houseStatusBlockReason(status, "سقفٌ يحتاج ترميمًا")).toBeNull();
  });

  it("`statusNeedsReason` تخصّ الخارجتين من الخدمة وحدهما", () => {
    expect(HOUSE_CREATABLE_STATUSES.filter(statusNeedsReason)).toEqual(["تحت الصيانة", "معطّل"]);
  });
});

describe("قواعد §10 — التسميات العربية تُعرض كاملة", () => {
  it("الخيارات تلتفّ ولا تُقصّ — `flexWrap` على صفّ الرقائق", () => {
    const { UNSAFE_root } = renderPicker(null);
    const rows = UNSAFE_root.findAll(
      (node) =>
        !Array.isArray(node.props.style) &&
        typeof node.props.style === "object" &&
        node.props.style !== null &&
        (node.props.style as { flexWrap?: string }).flexWrap === "wrap"
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("التسمية بالعربية وباتجاه rtl — لا نصّ نائب", () => {
    renderPicker(null);
    const label = propsOf(screen.getByTestId("house-status-label"));
    expect((label.style as { writingDirection?: string }).writingDirection).toBe("rtl");
    expect((label.style as { textAlign?: string }).textAlign).toBe("right");
  });
});
