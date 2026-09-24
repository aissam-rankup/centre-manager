import { StatCardSkeleton } from "@/components/shared/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function StyleguideLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    </div>
  );
}
