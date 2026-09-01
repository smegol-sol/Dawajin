import { describe, expect, it } from "vitest";

import { HOUSE_STATUS, type HouseStatus } from "./enums";
import {
  classifyHouseTransition,
  HOUSE_STATUS_TRANSITIONS,
  IN_SERVICE_STATUSES,
  isOutOfService,
  OUT_OF_SERVICE_STATUSES,
  transitionKey,
  TRANSITIONS_OWNED_ELSEWHERE,
} from "./houseStatusMachine";

/**
 * آلة الحالة — **الجدول يُختبَر بأسماء الانتقالات لا بعددها** (القرار 220).
 *
 * **والمخالفات المتعمَّدة هنا كلّ ما لا يسمح به الجدول**، مسمًّى واحدًا واحدًا:
 * الثلاثة التي يملكها غير هذا المسار، والقفزات داخل الدورة، والرجوع للخلف.
 */

/** الانتقالات المسموحة كاملة — تُكتب بأسمائها لا تُشتق من الجدول المفحوص. */
const ALLOWED: readonly (readonly [HouseStatus, HouseStatus])[] = [
  ["تحت الإخلاء", "تحت التنظيف والتطهير"],
  // في الجدول منذ القرار 221 — **وصنفه `prep-approval` فلا يُطلب يدويًّا** (القرار 239)
  ["تحت التنظيف والتطهير", "في فترة الراحة"],
  ["في فترة الراحة", "جاهز للإسكان"],
  // من أي حالة إلى الخارجتين (§3.3)
  ...HOUSE_STATUS.flatMap((from) =>
    OUT_OF_SERVICE_STATUSES.filter((to) => to !== from).map(
      (to) => [from, to] as readonly [HouseStatus, HouseStatus]
    )
  ),
  // العودة منهما باختيار صريح (قرار المالك)
  ...OUT_OF_SERVICE_STATUSES.flatMap((from) =>
    IN_SERVICE_STATUSES.map((to) => [from, to] as readonly [HouseStatus, HouseStatus])
  ),
];

function isAllowed(from: HouseStatus, to: HouseStatus): boolean {
  return ALLOWED.some(([f, t]) => f === from && t === to);
}

describe("جدول انتقالات حالة العنبر", () => {
  it("الانتقالات الخمسة المسموحة تُصنَّف بأصنافها", () => {
    expect(classifyHouseTransition("تحت الإخلاء", "تحت التنظيف والتطهير")?.kind).toBe(
      "prep-advance"
    );
    expect(classifyHouseTransition("تحت التنظيف والتطهير", "في فترة الراحة")?.kind).toBe(
      "prep-complete"
    );
    expect(classifyHouseTransition("في فترة الراحة", "جاهز للإسكان")?.kind).toBe("rest-confirm");
    expect(classifyHouseTransition("مشغول", "تحت الصيانة")?.kind).toBe("out-of-service");
    expect(classifyHouseTransition("تحت الصيانة", "مشغول")?.kind).toBe("return-to-service");
  });

  it("«تنظيف ← راحة» وحده تلقائيّ لا يُجريه مسار الحالة — والبقية له", () => {
    for (const rule of HOUSE_STATUS_TRANSITIONS) {
      expect(rule.performedBy).toBe(
        rule.kind === "prep-complete" ? "prep-approval" : "status-route"
      );
    }
  });

  it("الخروج من الخدمة وحده يوجب سببًا", () => {
    for (const rule of HOUSE_STATUS_TRANSITIONS) {
      expect(rule.reasonRequired).toBe(rule.kind === "out-of-service");
    }
  });

  it("الدخول إلى «تحت الصيانة» و«معطّل» من كل حالة أخرى — بنصّ §3.3", () => {
    for (const from of HOUSE_STATUS) {
      for (const to of OUT_OF_SERVICE_STATUSES) {
        if (from === to) continue;
        expect(classifyHouseTransition(from, to)?.kind).toBe("out-of-service");
      }
    }
  });

  it("العودة من الخارجتين إلى كل حالة خدمة — اختيارٌ صريح لا وجهة واحدة", () => {
    for (const from of OUT_OF_SERVICE_STATUSES) {
      for (const to of IN_SERVICE_STATUSES) {
        expect(classifyHouseTransition(from, to)?.kind).toBe("return-to-service");
      }
    }
  });
});

describe("جدول الانتقالات — مخالفات متعمَّدة بأسمائها", () => {
  it.each([
    ["مشغول", "تحت الإخلاء", "أثرُ تصفية الدفعة — المالك وحده"],
    ["جاهز للإسكان", "مشغول", "أثرُ إسكان الدفعة"],
  ] as const)("«%s ← %s» يملكه غيرُ الآلة كلّها (%s)", (from, to, _why) => {
    expect(classifyHouseTransition(from, to)).toBeNull();
    expect(TRANSITIONS_OWNED_ELSEWHERE[transitionKey(from, to)]).toBeDefined();
  });

  it.each([
    ["مشغول", "تحت التنظيف والتطهير"],
    ["مشغول", "في فترة الراحة"],
    ["مشغول", "جاهز للإسكان"],
    ["تحت الإخلاء", "في فترة الراحة"],
    ["تحت الإخلاء", "جاهز للإسكان"],
    ["تحت الإخلاء", "مشغول"],
    ["تحت التنظيف والتطهير", "جاهز للإسكان"],
    // «تنظيف ← راحة» لم يعد هنا: في الجدول بصنفه التلقائي منذ القرار 221
    ["تحت التنظيف والتطهير", "مشغول"],
    ["تحت التنظيف والتطهير", "تحت الإخلاء"],
    ["في فترة الراحة", "مشغول"],
    ["في فترة الراحة", "تحت الإخلاء"],
    ["في فترة الراحة", "تحت التنظيف والتطهير"],
    ["جاهز للإسكان", "تحت الإخلاء"],
    ["جاهز للإسكان", "تحت التنظيف والتطهير"],
    ["جاهز للإسكان", "في فترة الراحة"],
  ] as const)("قفزةٌ أو رجوعٌ ممنوع: «%s ← %s»", (from, to) => {
    expect(classifyHouseTransition(from, to)).toBeNull();
  });

  it.each(HOUSE_STATUS)("«%s» إلى نفسها ليس انتقالًا", (status) => {
    expect(classifyHouseTransition(status, status)).toBeNull();
  });

  it("لا انتقال خارج القائمة المكتوبة بأسمائها — مسحُ الأزواج التسعة والأربعين", () => {
    for (const from of HOUSE_STATUS) {
      for (const to of HOUSE_STATUS) {
        expect([from, to, classifyHouseTransition(from, to) !== null]).toEqual([
          from,
          to,
          isAllowed(from, to),
        ]);
      }
    }
  });

  it("قسمة الخدمة تغطّي الحالات السبع بلا تداخل", () => {
    expect([...OUT_OF_SERVICE_STATUSES, ...IN_SERVICE_STATUSES].sort()).toEqual(
      [...HOUSE_STATUS].sort()
    );
    expect(IN_SERVICE_STATUSES.some(isOutOfService)).toBe(false);
  });
});
