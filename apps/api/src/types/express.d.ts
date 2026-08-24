import type { UserRole } from "@dawajin/shared";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        tenantId: number | null;
        role: UserRole;
      };
    }
  }
}

export {};
