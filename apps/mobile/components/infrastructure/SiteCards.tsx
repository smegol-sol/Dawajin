import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { StatusDistributionBar } from "@/components/ui/StatusDistributionBar";
import { houseStatusIcon, houseStatusTone } from "@/lib/houseStatusTone";
import type { FarmCard, HouseCard, SiteCard } from "@/lib/infrastructureApi";

/**
 * بطاقات المستويات الثلاثة.
 *
 * **العدّادات تُعرض كما جاءت من الخادم** (القرار #131): محسوبة تحت فلتر
 * الإسناد، فما يراه المستخدم هو ما يُعدّ. لا حساب هنا ولا جلب إضافي للعدّ.
 */

export function SiteRow({
  site,
  onOpen,
  onEdit,
}: {
  site: SiteCard;
  onOpen: () => void;
  onEdit?: (() => void) | undefined;
}) {
  return (
    <Card
      title={site.name}
      primaryActionLabel="عرض المزارع"
      onPrimaryAction={onOpen}
      testID={`site-card-${String(site.id)}`}
      {...(onEdit ? { onMorePress: onEdit } : {})}
    >
      <StatTile label="المزارع" value={site.farmCount} />
      <StatTile label="العنابر" value={site.houseCount} />
    </Card>
  );
}

export function FarmRow({
  farm,
  onOpen,
  onEdit,
}: {
  farm: FarmCard;
  onOpen: () => void;
  onEdit?: (() => void) | undefined;
}) {
  const { occupied, ready, other } = farm.houseStatusCounts;
  return (
    <Card
      title={farm.name}
      subtitle={farm.powerSources.join(" · ")}
      primaryActionLabel="عرض العنابر"
      onPrimaryAction={onOpen}
      testID={`farm-card-${String(farm.id)}`}
      {...(onEdit ? { onMorePress: onEdit } : {})}
    >
      <StatusDistributionBar
        counts={{ occupied, ready, other }}
        emptyLabel="لا عنابر في هذه المزرعة بعد"
        testID={`farm-status-${String(farm.id)}`}
      />
    </Card>
  );
}

export function HouseRow({
  house,
  onEdit,
}: {
  house: HouseCard;
  onEdit?: (() => void) | undefined;
}) {
  return (
    <Card
      title={house.name}
      subtitle={house.type ?? "النوع غير محدَّد"}
      edgeTone={houseStatusTone(house.status)}
      testID={`house-card-${String(house.id)}`}
      {...(onEdit ? { onMorePress: onEdit } : {})}
    >
      <Badge
        tone={houseStatusTone(house.status)}
        icon={houseStatusIcon(house.status)}
        label={house.status}
      />
    </Card>
  );
}
