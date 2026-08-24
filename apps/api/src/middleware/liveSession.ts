import { users, type Database } from "@dawajin/db";
import { HttpError } from "@dawajin/shared";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

/**
 * requireLiveSession — يعيد قراءة حالة المستخدم من القاعدة تحت كل طلب،
 * ويفرض قيدين أمنيين **بقراءة واحدة**:
 *
 * 1. **الحساب معطَّل** (`is_active = false`) ← 401 فورًا. قبل هذا الحارس كان
 *    الرمز الصادر قبل التعطيل يبقى مقبولًا حتى انتهائه (`work-plan.md` §7-ب
 *    البند 9) — تعطيل الحساب لم يكن يقطع الجلسة القائمة.
 * 2. **كلمة مؤقتة لم تُغيَّر** (`must_change_password = true`) ← 403 على كل
 *    مسار عدا المسموح أدناه. قبل هذا الحارس كان `must_change_password` مجرد
 *    **إشارة للواجهة لا قيدًا**: `requireAuth` لا يقرأ القاعدة إطلاقًا، فمن
 *    يخاطب الـAPI مباشرة يبقى بكلمته المؤقتة إلى الأبد (القرار #99).
 *
 * **لماذا حارس واحد لا اثنان:** كلا القيدين يحتاج نفس الصف بنفس المفتاح
 * (`users.id` من الرمز). فصلهما يعني استعلامين متطابقين على كل طلب، ونافذة
 * تعارض بينهما لو تغيّر الصف بين القراءتين.
 *
 * **الكلفة:** استعلام واحد بمفتاح أساسي لكل طلب محمي — الثمن المقبول لجعل
 * التعطيل وإجبار التغيير فوريَّين بدل انتظار انتهاء الرمز.
 */

/**
 * المسارات المسموحة تحت كلمة مؤقتة. لا مسار "تسجيل خروج" في الخادم — الخروج
 * يمحو الرمز من `expo-secure-store` عميلًا بلا طلب.
 *
 * `/api/auth/me` مسموح عمدًا: التطبيق يستدعيه عند الإقلاع ليعرف **لماذا**
 * الجلسة مقيَّدة فيوجّه لشاشة التغيير؛ ومنعه يجعل العميل يمحو الرمز ويعود
 * لشاشة الدخول في حلقة لا تنتهي. ولا يكشف شيئًا جديدًا: استجابة تسجيل الدخول
 * نفسها تُرجع هذه الحقول بعينها قبل أي حارس.
 */
const ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED = new Set([
  "/api/auth/change-password",
  "/api/auth/me",
]);

export function requireLiveSession(db: Database) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      next(new HttpError(401, "unauthorized", "الرجاء تسجيل الدخول"));
      return;
    }

    try {
      const [row] = await db
        .select({
          isActive: users.isActive,
          mustChangePassword: users.mustChangePassword,
        })
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!row) {
        next(new HttpError(401, "unauthorized", "رمز الدخول غير صالح أو منتهٍ"));
        return;
      }

      if (!row.isActive) {
        next(new HttpError(401, "account_disabled", "هذا الحساب معطَّل — راجع المشرف"));
        return;
      }

      if (row.mustChangePassword && !ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED.has(req.path)) {
        next(
          new HttpError(
            403,
            "password_change_required",
            "يجب تغيير كلمة المرور المؤقتة قبل استخدام التطبيق"
          )
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
