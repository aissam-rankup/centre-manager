import { Skeleton } from "@/components/ui/skeleton";

export default function CallLoading() {
  return (
    <div className="flex h-dvh flex-col bg-background" aria-busy="true">
      <div className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <Skeleton className="size-[200px] rounded-full" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 border-t bg-card p-4">
        <Skeleton className="h-16 rounded-[10px]" />
        <Skeleton className="h-16 rounded-[10px]" />
      </div>
    </div>
  );
}
