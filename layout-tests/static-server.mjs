import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

/**
 * خادم ملفات ثابت لا تبعية له — يخدم مخرَج `expo export --platform web`
 * لتأكيدات التخطيط. `serve`/`http-server` كتبعية إضافية لا تضيف شيئًا هنا:
 * المطلوب ملفات ثابتة وارتداد SPA لا أكثر.
 *
 * الارتداد إلى index.html إلزامي: تصدير expo-router بصيغة "single" ينتج
 * صفحة واحدة، فمسار مثل /auth/select-account لا ملف له على القرص.
 */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * يشغّل خادمًا ثابتًا على منفذ محدَّد.
 * @param {string} root مجلد المخرَج المبني
 * @param {number} port المنفذ
 * @returns {import("node:http").Server} الخادم بعد بدء الاستماع
 */
export function startStaticServer(root, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // normalize + إزالة أي ".." يمنع الخروج من مجلد المخرَج
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(root, relative);

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(root, "index.html");
    }

    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
      // بلا تخزين مؤقت: كل تشغيل يقرأ المخرَج الحالي لا نسخة سابقة
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  });

  server.listen(port);
  return server;
}

const port = Number(process.env.LAYOUT_TEST_PORT ?? "8787");
const root = process.env.LAYOUT_TEST_ROOT;
if (!root) throw new Error("LAYOUT_TEST_ROOT غير معرَّف — مجلد مخرَج expo export مطلوب");
startStaticServer(root, port);
