import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading library">
      <div className="flex min-h-[60vh] items-end px-4 pt-24 pb-12 sm:px-8 lg:px-12">
        <div className="w-full max-w-xl space-y-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-12 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <div className="flex gap-3">
            <Skeleton className="h-11 w-44" />
            <Skeleton className="h-11 w-32" />
          </div>
        </div>
      </div>
      <div className="space-y-10">
        {[0, 1].map((row) => (
          <div key={row} className="px-4 sm:px-8 lg:px-12">
            <Skeleton className="mb-3 h-5 w-40" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="w-[38vw] max-w-44 shrink-0 sm:w-40 lg:w-44">
                  <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                  <Skeleton className="mt-2 h-3.5 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
