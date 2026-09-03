import { HttpError } from "@dawajin/shared";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { enforceEntityAccess } from "./entityAccess";

/**
 * فروع دفاعية بحتة داخل enforceEntityAccess (لا مسار تنفيذ متوقَّع عبر
 * السلسلة الحقيقية requireAuth→requireTenant→enforceEntityAccess، لأن
 * requireTenant يرفض الحالتين قبل الوصول هنا) — لكنها موجودة فعليًا في الكود
 * ويجب تغطيتها. قاعدة بيانات وهمية تفشل فورًا لو استُدعيت، لإثبات أن هذه
 * الفروع تُقصِّر الدائرة (short-circuit) قبل أي استعلام.
 */
function throwingDb() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("لا يجب استدعاء db في هذا الفرع الدفاعي");
      },
    }
  );
}

function fakeRequest(
  user: Request["user"],
  params: Record<string, string> = {},
  query: Record<string, string> = {}
): Request {
  return { user, params, query, body: {} } as unknown as Request;
}

describe("enforceEntityAccess — فروع دفاعية", () => {
  it("401 بلا req.user (المفروض أصلًا ألا يُصادَف بعد requireAuth)", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(fakeRequest(undefined, { houseId: "1" }), {} as Response, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  /** **المدخل الخامس — `userId`** (القرار 251): نفس الفرع الدفاعيّ في موضعه الجديد. */
  it("401 عندما tenantId يساوي null على مسار **المستخدم المستهدَف**", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: null, role: "supervisor" }, { userId: "1" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  it("401 عندما tenantId يساوي null على مسار **الموقع** (المدخل الثالث)", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: null, role: "vet" }, { siteId: "1" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  it("401 عندما tenantId يساوي null على مسار **المزرعة** (نفس الفرع الدفاعي، مدخل آخر)", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: null, role: "supervisor" }, { farmId: "1" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  it("401 عندما tenantId يساوي null لدور غير مالك/مدير منصة (المفروض ألا يُصادَف بعد requireTenant)", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: null, role: "farmer" }, { houseId: "1" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });
});

describe("enforceEntityAccess — المسحُ العميق (القرار 275)", () => {
  /**
   * **حدُّ العمق يمسك فعلًا** — عنبرٌ أعمقُ من `BODY_SCAN_MAX_DEPTH` **لا
   * يُرى**، فيمضي الطلب بلا استعلامٍ واحد (**والقاعدة الوهمية تفشل لو
   * استُدعيت**).
   *
   * **وهو شاهدُ حدٍّ لا شاهدُ حراسة:** يُثبت أين يقف المسح، **ويسقط يوم
   * يُبنى جسمٌ أعمق منه** — وعندها يُرفع الحدُّ بقرار لا بالسكوت.
   */
  it("عنبرٌ أعمقُ من حدّ المسح لا يُرى — والحدُّ مُعلَنٌ لا خفيّ", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();
    const req = {
      user: { id: 1, tenantId: 1, role: "supervisor" },
      params: {},
      query: {},
      body: { a: { b: { c: { d: { e: { houseId: 7 } } } } } },
    } as unknown as Request;

    await middleware(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toBeUndefined();
  });
});

describe("enforceEntityAccess — شحنةُ الكتاكيت (القرار 275)", () => {
  it("401 عندما tenantId يساوي null على مسار **الشحنة** (مدخل سادس)", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: null, role: "supervisor" }, { shipmentId: "1" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  /**
   * **معرّفٌ ليس رقمًا ← 404 بلا استعلام** — **والقاعدة الوهمية تفشل فورًا لو
   * استُدعيت**، فهي شاهدُ أن الدائرة قُصّرت.
   *
   * **و404 لا 403 هنا خلافًا للمخزن:** الشحنةُ لا نطاقَ إسنادٍ لها، **وما
   * يفحصه الحارس وجودُها** — **ومعرّفٌ لا يشير إلى صفٍّ غيرُ موجود**
   * (المبدأ السادس).
   */
  it("404 لمعرّف شحنة ليس رقمًا — بلا استعلام قاعدة — الرادُّ `assertChickShipmentExists`", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: 1, role: "supervisor" }, { shipmentId: "شحنة" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(404);
  });
});

describe("enforceEntityAccess — عنونة المخزن (القراران 193 و199)", () => {
  /**
   * **الفرع الدفاعي نفسه من مدخل رابع** (القرار 193) — الفرع الدفاعي نفسه من مدخل رابع، ومصدرا
   * قراءة لا يمرّان في اختبارات التكامل: `params` و`query`. اختبارات الموقع
   * هناك تبعث الأزواج في **الجسم** لأن مسارات المخزون تُبنى `POST`، **والحارس
   * يقرأ الثلاثة** فلا يُترك مصدران بلا شاهد.
   */
  it("401 عندما tenantId يساوي null على مسار **المخزن** (مدخل رابع)", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: null, role: "owner" }, {}, { warehouseId: "1" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  it("403 لمعرّف مخزن غير معلوم يصل من الرابط — بلا استعلام قاعدة — الرادُّ الفرض المركزي", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest(
        { id: 1, tenantId: 1, role: "farmer" },
        // **قيمة ليست معرّفًا** — نظير `locationType='silo'` في القرار 193:
        // تُرفض ولا تُمرَّر صامتة (القرار 199).
        { warehouseId: "silo" }
      ),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(403);
  });

  /**
   * **ومسارُ التحويل كأخواته** (القرار 229): المحلِّل يقصّر الدائرة قبل أي
   * استعلام — **والقاعدة الوهمية تفشل فورًا لو استُدعيت**.
   */
  it("401 عندما tenantId يساوي null على مسار **التحويل**", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: null, role: "farmer" }, { transferId: "1" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });
});
