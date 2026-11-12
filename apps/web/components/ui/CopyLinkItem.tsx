"use client";

import { copyText } from "@/lib/clipboard";
import { ptBR } from "@/lib/i18n";
import { useAnnounce } from "./Announcer";
import { MenuItem } from "./Menu";

/**
 * "Copiar o link desta configuração", for the "⋯" of a page whose inputs live
 * in the URL (D-212): the address already is the link, this only puts it on the
 * clipboard and says, through the app's live region, whether that worked.
 */
export function CopyLinkItem() {
  const announce = useAnnounce();
  return (
    <MenuItem
      hint={ptBR.ui.copyLinkHint}
      onSelect={async () => {
        const ok = await copyText(window.location.href);
        announce(ok ? ptBR.ui.copyLinkDone : ptBR.ui.copyLinkFailed);
      }}
    >
      {ptBR.ui.copyLink}
    </MenuItem>
  );
}
