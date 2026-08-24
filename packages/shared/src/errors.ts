import { z } from "zod";

/** عقد الخطأ الموحّد لكل استجابات الـ API (backend-technical-spec.md §18). */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(), // عربية جاهزة للعرض دائمًا
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON(): ApiError {
    return { code: this.code, message: this.message, details: this.details };
  }
}
