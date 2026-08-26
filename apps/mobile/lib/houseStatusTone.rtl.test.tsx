import { houseStatusIcon, houseStatusTone } from "@/lib/houseStatusTone";

/** لون حالة العنبر — الحالات السبع، وحالةٌ لا يعرفها التطبيق. */
describe("لون حالة العنبر", () => {
  it.each([
    ["مشغول", "info"],
    ["تحت الإخلاء", "warning"],
    ["تحت التنظيف والتطهير", "warning"],
    ["في فترة الراحة", "warning"],
    ["جاهز للإسكان", "success"],
    ["تحت الصيانة", "critical"],
    ["معطّل", "critical"],
  ])("%s ← %s", (status, tone) => {
    expect(houseStatusTone(status)).toBe(tone);
  });

  it("حالة غير معروفة ← تنبيه لا لون سليم", () => {
    expect(houseStatusTone("حالة لم تُبنَ بعد")).toBe("warning");
  });
});

describe("أيقونة حالة العنبر", () => {
  it("لكل حالة من السبع أيقونتها", () => {
    const statuses = [
      "مشغول",
      "تحت الإخلاء",
      "تحت التنظيف والتطهير",
      "في فترة الراحة",
      "جاهز للإسكان",
      "تحت الصيانة",
      "معطّل",
    ];
    const icons = statuses.map((status) => houseStatusIcon(status));
    expect(new Set(icons).size).toBe(statuses.length);
  });

  it("حالة غير معروفة تأخذ أيقونة استفهام لا أيقونة سليمة", () => {
    expect(houseStatusIcon("حالة لا يعرفها التطبيق")).toBe(houseStatusIcon("قيمة أخرى"));
    expect(houseStatusIcon("حالة لا يعرفها التطبيق")).not.toBe(houseStatusIcon("جاهز للإسكان"));
  });
});
