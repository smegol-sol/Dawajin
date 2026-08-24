import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import tokens from "../../apps/mobile/constants/tokens.json" with { type: "json" };

/**
 * فاحص رموز التصميم — يمنع لونًا حرفيًا · رماديًا أفتح من #4A4A4A · إيموجي ·
 * نصف قطر خارج المقياس (backend-technical-spec.md §21 · app-complete-spec.md §12).
 */

const MOBILE_DIR = join(process.cwd(), "apps/mobile");
const EXEMPT_FILES = new Set(["constants/tokens.json", "constants/theme.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".expo", "dist", "assets"]);

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
// نطاقات الإيموجي الشائعة (لا تلتقط علامات RTL أو رموز نصية عادية)
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;
const BORDER_RADIUS_LITERAL = /borderRadius:\s*(-?\d+(?:\.\d+)?)/g;

function collectAllowedHexColors(): Set<string> {
  const allowed = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node === "string" && /^#[0-9a-fA-F]{3,8}$/.test(node)) {
      allowed.add(node.toLowerCase());
    } else if (node && typeof node === "object") {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(tokens);
  return allowed;
}

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function isGrayscaleLighterThanBody(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6 && clean.length !== 3) return false;
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (r !== g || g !== b) return false; // ليس رماديًا محايدًا
  return r > 0x4a; // أفتح من #4A4A4A
}

export function checkDesignTokens(): { ok: boolean; message: string } {
  const allowedHex = collectAllowedHexColors();
  const allowedRadii = new Set(Object.values(tokens.radius as Record<string, number>));
  const violations: string[] = [];

  for (const file of walkFiles(MOBILE_DIR)) {
    const relPath = relative(MOBILE_DIR, file);
    if (EXEMPT_FILES.has(relPath)) continue;

    const content = readFileSync(file, "utf8");

    for (const match of content.matchAll(HEX_COLOR)) {
      const hex = match[0].toLowerCase();
      if (!allowedHex.has(hex)) {
        const reason = isGrayscaleLighterThanBody(hex)
          ? "رمادي أفتح من #4A4A4A"
          : "لون حرفي خارج ملف الرموز";
        violations.push(`${relPath}: "${hex}" — ${reason}`);
      }
    }

    for (const match of content.matchAll(EMOJI)) {
      violations.push(`${relPath}: إيموجي "${match[0]}" ممنوع — استخدم lucide-react-native`);
    }

    for (const match of content.matchAll(BORDER_RADIUS_LITERAL)) {
      const value = Number(match[1]);
      if (!allowedRadii.has(value)) {
        violations.push(`${relPath}: borderRadius=${value} خارج المقياس الخمسي`);
      }
    }
  }

  if (violations.length > 0) {
    return { ok: false, message: `مخالفات رموز التصميم:\n  - ${violations.join("\n  - ")}` };
  }
  return { ok: true, message: "لا مخالفات لرموز التصميم" };
}
