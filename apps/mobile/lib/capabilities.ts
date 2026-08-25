/**
 * قدرات المستخدم على البنية التحتية — **موضع واحد، والشاشة تسأل عن القدرة
 * لا عن الدور.**
 *
 * `if (role === "owner")` منثورًا في الشاشات يعني أن إضافة دور يُسمح له
 * بالإنشاء لاحقًا تحتاج تتبّع كل موضع — ونسيان واحد يترك زرًّا مخفيًا أو
 * ظاهرًا بلا سبب.
 *
 * **والإخفاء تهذيب واجهة لا حراسة:** الخادم يفرض `requireRole("owner")` على
 * الإنشاء والتعديل بأي حال (القرار #123). لا يُبنى أمن على هذه الدالة.
 */
export interface InfrastructureCapabilities {
  canCreate: boolean;
  canEdit: boolean;
}

/**
 * @param role الدور كما أرجعه الخادم
 * @returns ما يحقّ لهذا الدور فعله في شجرة المواقع والمزارع والعنابر
 */
export function infrastructureCapabilitiesFor(role: string): InfrastructureCapabilities {
  const manages = role === "owner";
  return { canCreate: manages, canEdit: manages };
}
