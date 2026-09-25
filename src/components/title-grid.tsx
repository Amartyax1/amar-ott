import { TitleCard } from "@/components/title-card";
import type { TitleCard as TitleCardData } from "@/lib/catalog";

export function TitleGrid({ titles }: { titles: TitleCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 min-[480px]:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {titles.map((t) => (
        <TitleCard key={t.id} title={t} />
      ))}
    </div>
  );
}
