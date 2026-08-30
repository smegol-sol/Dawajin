import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createDbClient } from "@dawajin/db";

/**
 * فاحص قاعدة المفتاح المركَّب — **بوابة إنفاذ لقاعدة كانت مكتوبة ولا يفرضها
 * شيء** (القرار 206، على القاعدة الملزمة في `CLAUDE.md` والقرارين #120 و#122).
 *
 * > **كل مفتاح أجنبي بين جدولين يحملان `tenant_id` يجب أن يكون مركَّبًا:**
 * > `(fk_column, tenant_id) → target(id, tenant_id)`.
 *
 * **ولماذا فحصٌ لا نصّ:** القاعدة مكتوبة منذ #120 و«ملزمة بلا استثناء»،
 * **ومرّت تحتها أربع مخالفات**، **وسُمّيت ثلاثة منها بأسمائها في تقرير
 * PR #69 ثم مرّت دفعتان فوقها بلا أن يعترض شيء** — حتى وجدها مسحٌ عن
 * المحاسبة (204) وسُدّت في 205. **فالعطب لم يكن في نصّها بل في أن مخالفتها
 * لا تكلّف شيئًا.**
 *
 * ## المصدر: `pg_constraint` لا تعريفات drizzle — وبحجّة
 *
 * **يقيس ما هو مطبَّق لا ما هو مكتوب.** **والترحيلات في هذا المستودع مكتوبة
 * ومعدَّلة يدويًّا** (0016–0019 كلها)، **فالمخطط والقاعدة قد يفترقان** —
 * **ومفتاحٌ مركَّب يعيش في `schema/*.ts` ولم يصل القاعدة يحمي صفرًا من
 * الصفوف**. والقاعدة تحمي الصفوف لا الملفات.
 *
 * **و CI يهجّر قاعدة الاختبار قبل `check:all` مباشرة** (`ci.yml`)، فما يُقرأ
 * هو رأس الترحيلات بالضبط. **ويُتحقَّق من ذلك هنا لا يُفترض:** فحصٌ مسبق
 * يقارن الترحيلات المطبَّقة بسجلّ `_journal.json`، **فقاعدةٌ متأخرة تُسقط
 * البناء ولا تُنتج خضرةً كاذبة**.
 *
 * **وقراءةُ القيود من الكتالوج تعطي عدد أعمدة المفتاح يقينًا** (`conkey`)
 * بلا تحليل شجرة TypeScript ولا تخمين بين `foreignKey({...})` و
 * `.references()`.
 *
 * **وما يفوته الاختيار — يُسمَّى ولا يُسكَت:** جدولٌ يُضاف إلى
 * `packages/db/src/schema` **بلا ترحيل مولَّد** لا وجود له في القاعدة،
 * **فلا يراه هذا الفحص**. حراسةُ ذلك فحصُ انحرافٍ بين المخطط والترحيلات
 * (`drizzle-kit generate` لا يُنتج شيئًا) — **عملٌ آخر لم يُبنَ بعد**.
 */

/**
 * **قائمة موجبة بعلّتها لا شرط سالب** (القرار 184): **جدولٌ جديد لا يُستثنى
 * بالسكوت**. وكل بند علّته مكتوبة بجانبه، مقروءةً من القرار 205 لا مكتشَفةً
 * من جديد.
 */
const TENANTLESS_BY_RIGHT: Record<string, string> = {
  tenants: "هو المستأجر نفسه — و`id` هو المفتاح، فلا عمود مستأجر فيه أصلًا",
  platform_admins:
    "مدير المنصة **عابرٌ للمستأجرين** (القرار 194) — و`CLAUDE.md` تنصّ على أنه «جدول بلا `tenant_id` إطلاقًا»، وبه زال آخر استثناء من قاعدة المفتاح المركَّب",
};

/**
 * **`tenant_id` قابل للعدم بحقّ** — والعدم فيها **معنًى لا نقص**. وتُدرَج
 * هنا لا لتُعفى، بل لأن **المفتاح المركَّب من جدولٍ عموده قابل للعدم يُرضيه
 * العدم** (`MATCH SIMPLE`): صفٌّ بـ`tenant_id = NULL` **يمرّ من المفتاح بلا
 * فحص**. **فثغرةٌ متنكّرة في هيئة قيد سليم** — وهي أخطر من المفرد لأنها
 * تبدو صحيحة. ولا واحد منها اليوم يحمل مفتاحًا إلى جدول مستأجر.
 */
const NULLABLE_TENANT_BY_RIGHT: Record<string, string> = {
  breed_standards: "`NULL` تعني **منحنًى عامًّا مشتركًا** بين المستأجرين، ويحرس وحدته فهرس جزئي",
  admin_audit_log: "`NULL` تعني **فعلًا غير مخصوص بمستأجر** من مدير المنصة",
};

interface FkRow {
  conname: string;
  src: string;
  tgt: string;
  cols: string;
  has_tenant: boolean;
  src_tenant_nullable: boolean;
}

interface MissingRefRow {
  relname: string;
}

interface CheckResult {
  ok: boolean;
  message: string;
}

const FK_QUERY = `
WITH tenant_tables AS (
  SELECT c.oid, c.relname, NOT a.attnotnull AS tenant_nullable
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
  WHERE c.relkind = 'r'
)
SELECT con.conname,
       src.relname AS src,
       tgt.relname AS tgt,
       srct.tenant_nullable AS src_tenant_nullable,
       (SELECT string_agg(att.attname, ', ' ORDER BY k.ord)
          FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum) AS cols,
       EXISTS (
         SELECT 1 FROM unnest(con.conkey) AS k(attnum)
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
         WHERE att.attname = 'tenant_id'
       ) AS has_tenant
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_class tgt ON tgt.oid = con.confrelid
JOIN tenant_tables srct ON srct.oid = con.conrelid
JOIN tenant_tables ON tenant_tables.oid = con.confrelid
WHERE con.contype = 'f'
ORDER BY src.relname, con.conname;
`;

/** جداول المستأجر التي لا تحمل مرجعًا فريدًا `(id, tenant_id)`. */
const MISSING_REF_QUERY = `
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
WHERE c.relkind = 'r'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.oid AND i.indisunique AND i.indnatts = 2
      AND (SELECT array_agg(att.attname ORDER BY att.attname)
             FROM unnest(i.indkey::int[]) AS k(attnum)
             JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum = k.attnum)
          = ARRAY['id', 'tenant_id']::name[]
  )
ORDER BY c.relname;
`;

function appliedMigrationsBehind(applied: number): string | null {
  const journalPath = join(process.cwd(), "packages/db/migrations/meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
  const expected = journal.entries.length;
  if (applied < expected) {
    return `القاعدة متأخرة عن الترحيلات: ${String(applied)} مطبَّقًا مقابل ${String(expected)} في السجلّ — شغّل \`pnpm --filter @dawajin/db run migrate\` على قاعدة الاختبار. **ولا يُقرأ حكمٌ من قاعدة متأخرة.**`;
  }
  return null;
}

/**
 * يفحص أن كل مفتاح أجنبي بين جدولين يحملان `tenant_id` مركَّبٌ ويشمل
 * `tenant_id` — قراءةً من `pg_constraint` على قاعدة الاختبار.
 * @returns نتيجة الفحص برسالة تسمّي الجدول والمفتاح والهدف عند السقوط
 */
export async function checkCompositeFk(): Promise<CheckResult> {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url === "") {
    return {
      ok: false,
      message:
        "`TEST_DATABASE_URL` غير معرَّف — والفحص يقرأ القيود المطبَّقة من القاعدة لا من المخطط.\n" +
        "صدّره أولًا (`set -a && source .env && set +a`)، فبوابةٌ تُتخطّى بمتغيّر ناقص ليست بوابة.",
    };
  }

  // **عميل المستودع نفسه لا اتصال ثانٍ** — فلا تبعية جديدة في جذر المستودع.
  const { pool } = createDbClient(url);
  try {
    const migrations = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations"
    );
    const behind = appliedMigrationsBehind(Number(migrations.rows[0]?.n ?? 0));
    if (behind !== null) return { ok: false, message: behind };

    const fkRows = (await pool.query<FkRow>(FK_QUERY)).rows;
    const missingRows = (await pool.query<MissingRefRow>(MISSING_REF_QUERY)).rows;

    const singles = fkRows.filter((r) => !r.has_tenant);
    const nullableTenant = fkRows.filter((r) => r.has_tenant && r.src_tenant_nullable);

    const problems: string[] = [];
    for (const row of singles) {
      problems.push(
        `مفتاح مفرد: \`${row.src}.${row.conname}\` على (${row.cols}) ← \`${row.tgt}\`` +
          ` — والجدولان يحملان \`tenant_id\`، فالمفتاح يتحقق من وجود الصفّ لا من مالكه.`
      );
    }
    for (const row of nullableTenant) {
      problems.push(
        `مفتاح مركَّب من جدول \`tenant_id\` فيه قابل للعدم: \`${row.src}.${row.conname}\`` +
          ` على (${row.cols}) ← \`${row.tgt}\` — و\`MATCH SIMPLE\` يُرضيه العدم،` +
          ` فصفٌّ بـ\`tenant_id = NULL\` يمرّ بلا فحص.`
      );
    }

    const exceptions =
      `والمستثنَون بقائمة موجبة (${String(Object.keys(TENANTLESS_BY_RIGHT).length)} بلا عمود مستأجر · ` +
      `${String(Object.keys(NULLABLE_TENANT_BY_RIGHT).length)} بعمود قابل للعدم بحقّ): ` +
      [...Object.keys(TENANTLESS_BY_RIGHT), ...Object.keys(NULLABLE_TENANT_BY_RIGHT)].join(" · ");
    const refsNote =
      missingRows.length === 0
        ? ""
        : `\nوجداول مستأجرٍ بلا مرجع فريد \`(id, tenant_id)\` — **لا مخالفة بل عقبة**: ` +
          `مفتاحٌ مركَّب إليها مرفوضٌ من Postgres حتى يُضاف المرجع (القرار 205 اصطدم بها في ` +
          `\`health_tasks\` و\`health_observations\`): ${missingRows.map((r) => `\`${r.relname}\``).join(" · ")}`;

    if (problems.length > 0) {
      return {
        ok: false,
        message: `${String(problems.length)} مخالفة لقاعدة المفتاح المركَّب:\n- ${problems.join("\n- ")}\n\n${exceptions}${refsNote}`,
      };
    }

    return {
      ok: true,
      message:
        `${String(fkRows.length)} مفتاحًا بين جداول تحمل \`tenant_id\` — كلها مركَّبة وتشمل \`tenant_id\`` +
        ` (مقروءة من \`pg_constraint\` لا من المخطط).\n${exceptions}${refsNote}`,
    };
  } finally {
    await pool.end();
  }
}
