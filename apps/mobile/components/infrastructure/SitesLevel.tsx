import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { LevelList } from "@/components/infrastructure/LevelList";
import { NameSheet } from "@/components/infrastructure/NameSheet";
import { SiteRow } from "@/components/infrastructure/SiteCards";
import type { InfrastructureCapabilities } from "@/lib/capabilities";
import { createSite, fetchSites, renameSite, type SiteCard } from "@/lib/infrastructureApi";
import { infrastructureErrorMessage } from "@/lib/infrastructureErrors";
import { useEntitySheet } from "@/lib/useEntitySheet";

/**
 * المستوى الأول — المواقع المرئية لهذا المستخدم.
 *
 * **التخطّي هنا لا في الشاشة الأم:** المستوى وحده يعرف عدد عناصره المرئية،
 * فيطلب النزول عند الواحد. **والصفر يبقى حالة فارغة — لا تخطٍّ.**
 */
export function SitesLevel({
  token,
  capabilities,
  onOpen,
}: {
  token: string;
  capabilities: InfrastructureCapabilities;
  onOpen: (site: SiteCard, automatic: boolean) => void;
}) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["sites"], queryFn: () => fetchSites(token) });

  const form = useEntitySheet<SiteCard>({
    save: (name, editing) =>
      editing === null ? createSite(token, name) : renameSite(token, editing.id, name),
    afterSave: () => client.invalidateQueries({ queryKey: ["sites"] }),
  });

  const only = query.data?.length === 1 ? query.data[0] : undefined;
  useEffect(() => {
    if (only !== undefined) onOpen(only, true);
  }, [only, onOpen]);

  return (
    <>
      <LevelList
        items={query.data}
        isLoading={query.isPending}
        error={query.isError ? infrastructureErrorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyMessage="لا مواقع مُسندة إليك بعد"
        {...(capabilities.canCreate
          ? { createLabel: "إضافة موقع", onCreate: form.openCreate }
          : {})}
        keyOf={(site) => site.id}
        renderItem={(site) => (
          <SiteRow
            site={site}
            onOpen={() => {
              onOpen(site, false);
            }}
            onEdit={
              capabilities.canEdit
                ? () => {
                    form.openEdit(site);
                  }
                : undefined
            }
          />
        )}
      />
      <NameSheet
        form={form}
        createTitle="موقع جديد"
        editTitle="تعديل الموقع"
        label="اسم الموقع"
        initialValue={form.editing?.name ?? ""}
      />
    </>
  );
}
