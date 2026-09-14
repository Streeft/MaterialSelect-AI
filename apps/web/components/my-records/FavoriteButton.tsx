"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MyRecords, Universe } from "@/lib/types";
import { addFavorite, getMyRecords, removeFavorite } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { IconButton } from "@/components/ui";
import { IconStar } from "@/components/ui/icons";

const t = ptBR.myRecords;

/** The query key the user's own space is cached under, shared with its page. */
export const MY_RECORDS_KEY = ["my-records"] as const;

function isFavorited(data: MyRecords | undefined, universe: Universe, recordId: number): boolean {
  if (!data) return false;
  return data.favorites.some((bookmark) => {
    if (bookmark.universe !== universe) return false;
    const record = universe === "material" ? bookmark.material : bookmark.process;
    return record?.id === recordId;
  });
}

/**
 * The star on a datasheet (P1-4).
 *
 * It reads its state from the same `my-records` query the user's own space
 * renders, rather than from a prop the datasheet would have to fetch and keep
 * fresh. That is what makes the star and the page incapable of disagreeing:
 * both mutations write the server's whole answer back into this one cache
 * entry, so un-starring from the page updates the star on the sheet behind it.
 *
 * Disabled while the write is in flight — not hidden and not optimistic. An
 * optimistic star that the server then refused would tell the reader they had
 * bookmarked something they had not.
 */
export function FavoriteButton({
  universe,
  recordId,
}: {
  universe: Universe;
  recordId: number;
}) {
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: MY_RECORDS_KEY, queryFn: getMyRecords });
  const favorited = isFavorited(data, universe, recordId);

  const mutation = useMutation({
    mutationFn: () =>
      favorited ? removeFavorite(universe, recordId) : addFavorite(universe, recordId),
    onSuccess: (fresh) => client.setQueryData(MY_RECORDS_KEY, fresh),
  });

  return (
    <IconButton
      // A real toggle, not a button whose label happens to change: the state
      // has to be announced, and `md-icon-button`'s own `toggle`/`selected` is
      // what puts `aria-pressed` on the button inside the shadow root — an
      // `aria-pressed` written on the host would name an element no screen
      // reader reads.
      toggle
      selected={favorited}
      // The name says what the click will do, and `aria-pressed` (rendered by
      // the element itself) says what the state is. Both, because a name alone
      // makes a listener infer the state from a verb.
      label={favorited ? t.removeFavorite : t.addFavorite}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      className={favorited ? "text-accent" : undefined}
      icon={<IconStar filled={favorited} />}
    />
  );
}
