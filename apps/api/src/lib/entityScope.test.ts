import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  ASSIGNMENT_SCOPED_ROLES,
  FULL_VISIBILITY_ROLES,
  visibleFarmCondition,
  visibleHouseCondition,
  visibleHouseScope,
  type Role,
  type Viewer,
} from "./entityScope";

/**
 * **الحارس مقلوب: من ليس في قائمة معلومة لا يرى شيئًا** (القرار 184، §7-ب
 * البند 32، والقرار #161).
 *
 * **والمخالفة المتعمَّدة هي شرط القبول لا زينة:** العطب صامت **ولا يكشفه
 * اختبار لدور لم يوجد بعد** — فيُصطنع دور خارج القائمتين ويُثبت أنه لا يرى
 * شيئًا. ولولا هذا لمرّ أي دور جديد بلا حارس.
 */

/**
 * دور غير مُدرَج في أي قائمة. **يُصطنع بـ`as` عمدًا**: النوع لا يسمح به اليوم،
 * والاختبار يفحص ما يحدث **حين يُضاف دور غدًا** — وهو بالضبط ما لا يكشفه
 * المترجم.
 */
const UNKNOWN_ROLE = "storekeeper" as Role;

function viewer(role: Role): Viewer {
  return { id: 7, role };
}

/**
 * نصّ الشرط كما تبنيه drizzle — يكفي لتمييز «امنع كل شيء» عن غيره.
 *
 * **يُقرأ من `StringChunk.value` لا بـ`JSON.stringify`**: أجزاء drizzle تحمل
 * مراجع للجداول فتصير البنية دائرية ويرمي التسلسل.
 */
function chunks(condition: SQL): string {
  const parts = (condition as unknown as { queryChunks: unknown[] }).queryChunks;
  return parts
    .map((chunk) => {
      if (typeof chunk === "string") return chunk;
      const value = (chunk as { value?: unknown }).value;
      return Array.isArray(value) ? value.join("") : "";
    })
    .join("");
}

describe("قائمتا الرؤية — موجبتان لا سالبتين", () => {
  it("المالك وحده في قائمة الرؤية الكاملة", () => {
    expect([...FULL_VISIBILITY_ROLES]).toEqual(["owner"]);
  });

  /**
   * **حُوِّل لا حُذف** (القرار 194): كان يُثبت أن `platform_admin` — **وهو دور
   * قائم وقتها** — خارج القائمتين. **والقيمة أُزيلت من `USER_ROLE`**، فصار
   * يُثبت ما هو أعمّ وأبقى: **أي قيمة دور غير معلومة لا ترث شيئًا بالسكوت**
   * (القرار 184)، **وهذا ما يلتقط ما خلّفه الحذف** — رمزٌ قديم يحمل الدور
   * المحذوف لا يرى شيئًا.
   */
  it("قيمة دور غير معلومة ليست في أي قائمة — فلا ترث رؤية بالسكوت", () => {
    const legacyRole = "platform_admin" as never;
    expect(FULL_VISIBILITY_ROLES.has(legacyRole)).toBe(false);
    expect(ASSIGNMENT_SCOPED_ROLES.has(legacyRole)).toBe(false);
  });

  it("القائمتان لا تتقاطعان", () => {
    for (const role of FULL_VISIBILITY_ROLES) {
      expect(ASSIGNMENT_SCOPED_ROLES.has(role)).toBe(false);
    }
  });
});

describe("المخالفة المتعمَّدة — دور خارج القائمتين لا يرى شيئًا", () => {
  it("`visibleFarmCondition` تمنع كل شيء", () => {
    expect(chunks(visibleFarmCondition(viewer(UNKNOWN_ROLE)))).toContain("false");
  });

  it("`visibleHouseCondition` تمنع كل شيء — لا تتّكئ على فلتر المزرعة", () => {
    expect(chunks(visibleHouseCondition(viewer(UNKNOWN_ROLE)))).toContain("false");
  });

  it("`visibleHouseScope` تمنع كل شيء — الثقب الثالث في housesService", () => {
    expect(chunks(visibleHouseScope(viewer(UNKNOWN_ROLE)))).toContain("false");
  });

  it("ولا واحدة منها تُرجع `undefined` — النوع نفسه يمنع النسيان", () => {
    expect(visibleFarmCondition(viewer(UNKNOWN_ROLE))).toBeDefined();
    expect(visibleHouseCondition(viewer(UNKNOWN_ROLE))).toBeDefined();
    expect(visibleHouseScope(viewer(UNKNOWN_ROLE))).toBeDefined();
  });
});

describe("الأدوار المعروفة لم يتغيّر سلوكها", () => {
  it("المالك يرى كل شيء في المستويين", () => {
    expect(chunks(visibleFarmCondition(viewer("owner")))).toContain("true");
    expect(chunks(visibleHouseCondition(viewer("owner")))).toContain("true");
    expect(chunks(visibleHouseScope(viewer("owner")))).toContain("true");
  });

  it("المربّي مقيَّد بالعنبر في الشرطين", () => {
    expect(chunks(visibleFarmCondition(viewer("farmer")))).toContain("EXISTS");
    expect(chunks(visibleHouseCondition(viewer("farmer")))).toContain("EXISTS");
  });

  it.each(["supervisor", "vet"] as const)(
    "%s: مقيَّد بالمزرعة، بلا قيد إضافي على العنبر",
    (role) => {
      expect(chunks(visibleFarmCondition(viewer(role)))).toContain("EXISTS");
      // كل عنابر مزارعه المُسندة — لا قيد ثانٍ، ولكنه شرط صريح لا `undefined`
      expect(chunks(visibleHouseCondition(viewer(role)))).toContain("true");
      expect(chunks(visibleHouseScope(viewer(role)))).toContain("EXISTS");
    }
  );
});
