import { ListSkeleton, Skeleton } from "@/components/ui";

/**
 * What every `/app/*` route shows while its code arrives (D-130): the shape of
 * a page — a title and some content — instead of a blank column. Routes that
 * know their own shape (a list of cards, a form) draw it themselves once they
 * are mounted; this is only the gap before that.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </div>
      <ListSkeleton />
    </div>
  );
}
