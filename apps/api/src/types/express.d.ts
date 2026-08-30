import type { UserRole } from "@dawajin/shared";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        tenantId: number | null;
        role: UserRole;
      };
      requestId?: string;
      /**
       * مدير المنصة الحالي — **حقل منفصل عن `user` عمدًا** (القرار 195):
       * الطبقتان لا تلتقيان حتى في سياق الطلب، **فلا مسار يقرأ `user` ويجد
       * مدير منصة** ولا العكس.
       */
      platformAdmin?: { id: number };
    }
  }
}

export {};
