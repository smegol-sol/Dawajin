import { randomUUID } from "node:crypto";

import type { Request, Response, NextFunction } from "express";

import { runWithRequestContext } from "../lib/requestContext";

const HEADER = "x-request-id";

/**
 * يولّد معرّفًا فريدًا لكل طلب (أو يقرأ X-Request-Id إن ورد من العميل/موازن
 * الحمل) قبل أي middleware آخر — يجب أن يُركَّب أولًا في app.ts، قبل
 * pino-http، ليتشارك الاثنان (والتدقيق لاحقًا) نفس المعرّف حرفيًا.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers[HEADER];
  const id = typeof incoming === "string" && incoming.trim() !== "" ? incoming : randomUUID();

  req.requestId = id;
  res.setHeader("X-Request-Id", id);

  runWithRequestContext({ requestId: id }, () => {
    next();
  });
}
