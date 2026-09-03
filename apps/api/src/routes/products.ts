import type { Database } from "@dawajin/db";
import { Router } from "express";

import { requireTenantUser } from "../lib/authContext";
import { listHouseWarehouseProducts } from "../services/productsService";

/**
 * `GET /api/products` — **أصنافُ مخزن العنبر** (حكم المالك، على القرار 231).
 *
 * **ولا حارسَ دورٍ عليه، وهو قرارٌ لا سكوت:** القراءة مفتوحة لكل دورٍ يبلغ
 * `/api` — **كما `GET /api/houses/:houseId` و`GET /api/farms/:farmId`** —
 * **والفرضُ المركزيّ يردّ كلَّ دورٍ خارج القائمتين المعلومتين بـ403** (القرار
 * 194)، **فدورٌ جديد لا يرث القراءة بالسكوت**.
 *
 * **وأربعةُ أدوارٍ تحتاجها فعلًا لا واحد:** المربّي يختار صنفَ العلف في السجلّ
 * اليوميّ (§14.1)، **والمشرف والطبيب وأمين المخزن يختارونه في الصرف إلى مخزن
 * العنبر** (§12.2) — **فحصرُها في المربّي كان سيحجبها عمّن يصرف إليه**.
 *
 * **ولا معرّفَ كيانٍ في الرابط ولا في الاستعلام، فلا نمطَ له في
 * `ENTITY_ID_PATH_PATTERNS`** — **ونمطٌ بلا معرّفٍ يقرؤه محلِّل فرضٌ صوريّ**
 * (القرار 229). **والصنف كيانُ مستأجرٍ لا موضعَ له**، **فالعزلُ بـ`tenant_id`
 * وحده** (المبدأ السابع).
 */

/**
 * يبني موجّه الأصناف.
 * @returns Router جاهز للتركيب داخل سلسلة requireAuth المحمية في app.ts
 */
export function productsRouter(db: Database): Router {
  const router = Router();

  router.get("/api/products", async (req, res, next) => {
    try {
      const user = requireTenantUser(req);
      res.json({ products: await listHouseWarehouseProducts(db, user.tenantId) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
