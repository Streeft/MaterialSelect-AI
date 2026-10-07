"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ApiError,
  downloadCaeCard,
  type CaeFormat,
  type CaeUnitSystem,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  Dialog,
  MenuButton,
  MenuItem,
  Select,
  SelectOption,
} from "@/components/ui";
import { IconDownload } from "@/components/ui/icons";

const t = ptBR.cae;

const FORMATS: CaeFormat[] = ["mapdl", "abaqus", "nastran", "lsdyna", "matml"];
const SYSTEMS: CaeUnitSystem[] = ["m-kg-s", "mm-t-s", "in-lbf-s"];

/** Hands a blob to the browser's own save dialog, under the server's filename. */
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * The CAE material card (D-104): format and unit system, then the file.
 *
 * Both choices are explicit and the unit system has no "automatic" option: a
 * solver multiplies the numbers it is given, so the system has to be the one
 * the model uses, and only the person building the model knows which that is.
 *
 * A refusal (422) is shown in the dialog with the server's own sentence — it
 * names what the record lacks — and the dialog stays open so another format
 * (MatML accepts any registered property) can be tried at once.
 */
export function CaeExportDialog({
  materialId,
  open,
  onClose,
  download = downloadCaeCard,
  saveFile = save,
}: {
  materialId: number;
  open: boolean;
  onClose: () => void;
  /** Injected in tests; the real one fetches the card. */
  download?: typeof downloadCaeCard;
  saveFile?: (blob: Blob, filename: string) => void;
}) {
  const [format, setFormat] = useState<CaeFormat>("mapdl");
  const [units, setUnits] = useState<CaeUnitSystem>("mm-t-s");

  const card = useMutation({
    mutationFn: () => download(materialId, format, units),
    onSuccess: ({ blob, filename }) => {
      saveFile(blob, filename);
      onClose();
    },
  });

  const refused = card.error instanceof ApiError && card.error.status === 422;

  function close() {
    card.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t.title}
      description={t.description}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t.cancel}
          </Button>
          <Button variant="primary" loading={card.isPending} onClick={() => card.mutate()}>
            {t.download}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select
          label={t.formatLabel}
          value={format}
          onChange={(event) => {
            setFormat(event.target.value as CaeFormat);
            card.reset();
          }}
        >
          {FORMATS.map((key) => (
            <SelectOption key={key} value={key}>
              {t.formats[key]}
            </SelectOption>
          ))}
        </Select>
        <Select
          label={t.unitsLabel}
          hint={t.unitsHint}
          value={units}
          onChange={(event) => {
            setUnits(event.target.value as CaeUnitSystem);
            card.reset();
          }}
        >
          {SYSTEMS.map((key) => (
            <SelectOption key={key} value={key}>
              {t.units[key]}
            </SelectOption>
          ))}
        </Select>
        <p className="text-support text-ink-muted">{t.requirements}</p>
        <p className="text-caption text-ink-subtle">{t.notice}</p>
        {card.error ? (
          <Alert
            tone={refused ? "warning" : "danger"}
            role="alert"
            title={refused ? t.refusedTitle : t.errorTitle}
          >
            {card.error.message}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * The datasheet's "Exportar ▾" (D-91): one menu button, never a row of
 * buttons, whose entry opens the CAE dialog.
 */
export function MaterialExportMenu({
  materialId,
  download,
  saveFile,
}: {
  materialId: number;
  download?: typeof downloadCaeCard;
  saveFile?: (blob: Blob, filename: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuButton label={ptBR.exports.title} icon={<IconDownload className="h-4 w-4" />}>
        <MenuItem onSelect={() => setOpen(true)} hint={t.menuHint}>
          {t.menuItem}
        </MenuItem>
      </MenuButton>
      <CaeExportDialog
        materialId={materialId}
        open={open}
        onClose={() => setOpen(false)}
        {...(download ? { download } : {})}
        {...(saveFile ? { saveFile } : {})}
      />
    </>
  );
}
