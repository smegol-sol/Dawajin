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
 * **وبلا حقول تحقّق بخطوتين اليوم:** تأتي مع دفعتها (القرار 188) — **وإضافة
 * عمود حينها أرخص من حمل أعمدة ميتة الآن**.
 */
export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: serial("id").primaryKey(),
    fullName: varchar("full_name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    phoneE164: varchar("phone_e164", { length: 20 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // فريد شاملًا المعطَّلين — نفس علّة `users_tenant_phone_uq` (#23): يمنع
  // «أوقف الحساب وأنشئ آخر بنفس الرقم».
  (table) => [uniqueIndex("platform_admins_phone_uq").on(table.phoneE164)]
);
