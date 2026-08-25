import { houseStatusTone } from "@/lib/houseStatusTone";

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
