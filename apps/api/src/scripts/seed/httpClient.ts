import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { Express } from "express";

/**
 * عميل HTTP حقيقي فوق خادم مؤقّت — **لا استدعاء دوال الخدمة مباشرة**.
 *
 * البذر يمرّ بالـAPI حصريًا (القاعدة #27)، و«الـAPI» تعني **الطلب الكامل**:
 * `requireAuth` → `requireLiveSession` → `requireTenant` → `enforceEntityAccess`
 * → `requireRole` → التحقق من الجسم → الخدمة. واستدعاء الخدمة رأسًا يتخطّى
 * السلسلة كلها **فيبذر بيانات لا يستطيع مستخدم حقيقي إنشاءها** — وهو بالضبط
 * ما يخفي الأخطاء التي وُضعت القاعدة لكشفها.
 *
 * والمنفذ `0` — يختاره النظام، فلا تصادم مع خادم تطوير يعمل بالتوازي.
 */

export class SeedHttpError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string
  ) {
    super(`[seed:demo] ${method} ${path} ← ${status.toString()}: ${body}`);
    this.name = "SeedHttpError";
  }
}

export interface SeedHttpClient {
  post<T>(path: string, body: unknown, token?: string): Promise<T>;
  close(): Promise<void>;
}

/** يفتح الخادم على منفذ يختاره النظام ويُعيد عميلًا يخاطبه بـ`fetch`. */
export async function startSeedClient(app: Express): Promise<SeedHttpClient> {
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, () => {
      resolve(listening);
    });
  });
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port.toString()}`;

  return {
    async post<T>(path: string, body: unknown, token?: string): Promise<T> {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) throw new SeedHttpError(response.status, "POST", path, text);
      return JSON.parse(text) as T;
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
