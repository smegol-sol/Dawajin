import { pgTable, serial, varchar, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * **مديرو المنصة — جدول مستقل تمامًا عن `users`** (القراران #146 و#147، والقرار
 * 194).
 *
 * **ولا عمود `tenant_id` فيه أصلًا** — لا فارغًا ولا مملوءًا: مدير المنصة **فوق
 * المستأجرين لا داخل أحدهم**، **والفصل بنيوي لا قيمة في عمود** (#146). فما كان
 * يفصل «صاحب مزرعة» عن «من يرى كل العملاء» مقارنةً نصّية في سطر واحد، **صار
 * جدولين لا يلتقيان**.
 *
 * **ولا مسار API يكتب فيه** (#147 حرفيًّا): «الحساب الوحيد في النظام الذي لا
 * يُنشئه أحد من داخل التطبيق» — يُنشأ بإجراء مباشر مقيَّد، **وخارج قاعدة البذر
 * عبر الـAPI (#27) لأنه ليس بيانات مستأجر**.
 *
 * **وحقول التحقّق بخطوتين أُضيفت في دفعتها** (القرار 195): `totp_secret` سرّ
 * واحد يُمسح على **جهازين** عند الإنشاء (القرار 188 — **الجهازان توافرٌ لا
 * سرّان**)، و`must_change_password` يقيّد الجلسة كما يقيّدها في `users`.
 */
export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: serial("id").primaryKey(),
    fullName: varchar("full_name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    phoneE164: varchar("phone_e164", { length: 20 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    /**
     * **سرّ TOTP بصيغة Base32** — يُولَّد عند الإنشاء ويُطبع مرة واحدة في
     * `otpauth://`، **ولا يُقرأ بعدها في أي مسار قراءة** (لا `me` ولا لوحة).
     */
    totpSecret: varchar("totp_secret", { length: 64 }).notNull(),
    /** كلمة مؤقتة لم تُبدَّل — تقيّد الجلسة إلى مسار التغيير وحده. */
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // فريد شاملًا المعطَّلين — نفس علّة `users_tenant_phone_uq` (#23): يمنع
  // «أوقف الحساب وأنشئ آخر بنفس الرقم».
  (table) => [uniqueIndex("platform_admins_phone_uq").on(table.phoneE164)]
);
