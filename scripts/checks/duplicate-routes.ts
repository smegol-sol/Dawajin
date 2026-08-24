import { introspectRoutes } from "../lib/introspectRoutes";

/**
 * فاحص المسارات المكررة — يمنع تسجيل نفس (method, path) مرتين
 * (backend-technical-spec.md §21). يعتمد على شجرة توجيه Express الحقيقية
 * (introspectRoutes) لا مطابقة نصية — راجع scripts/lib/introspectRoutes.ts
 * للسبب: ماسح نصي سابق كان يفوّت مسارًا مسجَّلًا بمتغيّر باسم غير "router".
 */
export async function checkDuplicateRoutes(): Promise<{ ok: boolean; message: string }> {
  const routes = await introspectRoutes();
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const { method, path } of routes) {
    const key = `${method} ${path}`;
    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.add(key);
    }
  }

  if (duplicates.length > 0) {
    return { ok: false, message: `مسارات مكررة:\n  - ${duplicates.join("\n  - ")}` };
  }
  return {
    ok: true,
    message: `لا تكرار — ${seen.size} مسار مفحوص (فحص برمجي لشجرة Express الفعلية)`,
  };
}
