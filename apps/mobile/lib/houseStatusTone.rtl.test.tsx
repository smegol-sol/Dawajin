import { houseStatusIcon, houseStatusTone } from "@/lib/houseStatusTone";

/**
 * فئة حالة العنبر على **محور الإنتاج** لا الإنذار (القرار رقم 178) — الحالات
 * السبع، وحالةٌ لا يعرفها التطبيق.
 */
describe("فئة حالة العنبر", () => {
  it.each([
    ["مشغول", "producing"],
    ["تحت الإخلاء", "preparing"],
    ["تحت التنظيف والتطهير", "preparing"],
    ["في فترة الراحة", "idle"],
    ["جاهز للإسكان", "idle"],
    ["تحت الصيانة", "outOfService"],
    ["معطّل", "outOfService"],
  ])("%s ← %s", (status, tone) => {
    expect(houseStatusTone(status)).toBe(tone);
  });

  it("حالة غير معروفة ← فئة تلفت لا «يُنتج»", () => {
    expect(houseStatusTone("حالة لم تُبنَ بعد")).toBe("preparing");
  });

  it("الأحمر خارج الشبكة — لا فئة تعني خطرًا", () => {
    // الأحمر محجوز لما يستدعي تدخّلًا فعليًّا، لا لعنبر خارج الإنتاج مؤقتًا
    const tones = ["مشغول", "تحت الإخلاء", "في فترة الراحة", "تحت الصيانة", "معطّل"].map(
      houseStatusTone
    );
    expect(tones).not.toContain("critical");
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
