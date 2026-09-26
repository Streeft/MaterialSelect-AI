"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addNotebookAppSource,
  addNotebookText,
  listMaterials,
  listStudies,
  uploadNotebookSource,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Combobox,
  Dialog,
  FileDrop,
  Input,
  Select,
  SelectOption,
  Tabs,
  Textarea,
  UploadList,
  type UploadItem,
} from "@/components/ui";
import { notebookKey } from "./keys";
import { LinkTab } from "./LinkTab";

const t = ptBR.notebooks;

type Tab = "upload" | "text" | "link" | "app";

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown";

/**
 * "Adicionar fontes": a file, a pasted text, a link (a page or a YouTube
 * video, D-97), or a record of this app. Every path ends on the server, which
 * reads the text and answers with the source or with the reason it could not
 * — the reason is shown as the server wrote it.
 */
export function AddSourcesDialog({
  notebookId,
  open,
  onClose,
}: {
  notebookId: number;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("upload");
  return (
    <Dialog open={open} onClose={onClose} title={t.addTitle} description={t.addDescription}>
      <Tabs
        label={t.addTitle}
        value={tab}
        onChange={setTab}
        items={[
          { id: "upload", label: t.tabUpload },
          { id: "text", label: t.tabText },
          { id: "link", label: t.link.tab },
          { id: "app", label: t.tabApp },
        ]}
      >
        {tab === "upload" ? (
          <UploadTab notebookId={notebookId} />
        ) : tab === "text" ? (
          <TextTab notebookId={notebookId} onDone={onClose} />
        ) : tab === "link" ? (
          <LinkTab notebookId={notebookId} onDone={onClose} />
        ) : (
          <AppTab notebookId={notebookId} />
        )}
      </Tabs>
    </Dialog>
  );
}

function UploadTab({ notebookId }: { notebookId: number }) {
  const client = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  const patch = (key: string, change: Partial<UploadItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  // One at a time: a class uploading together shares one small API machine,
  // and a failure then names exactly one file.
  const send = async (files: File[]) => {
    const batch = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      progress: 0,
      status: "sending" as const,
      file,
    }));
    setItems((current) => [...batch.map(({ file: _file, ...item }) => item), ...current]);
    setBusy(true);
    for (const item of batch) {
      try {
        await uploadNotebookSource(notebookId, item.file, (fraction) =>
          patch(item.key, { progress: fraction >= 1 ? null : fraction }),
        );
        patch(item.key, { status: "done", progress: 1 });
        await client.invalidateQueries({ queryKey: notebookKey(notebookId) });
      } catch (error) {
        patch(item.key, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <FileDrop
        title={t.dropTitle}
        hint={t.dropHint}
        buttonLabel={t.chooseFiles}
        accept={ACCEPT}
        disabled={busy}
        onFiles={(files) => void send(files)}
      />
      <UploadList
        label={t.uploads}
        items={items}
        statusLabels={{
          sending: t.uploading,
          reading: t.reading,
          done: t.uploaded,
          failed: t.uploadFailed,
        }}
      />
    </div>
  );
}

function TextTab({ notebookId, onDone }: { notebookId: number; onDone: () => void }) {
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: () => addNotebookText(notebookId, title.trim() || t.textTitleDefault, text),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: notebookKey(notebookId) });
      setTitle("");
      setText("");
      onDone();
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) add.mutate();
      }}
    >
      <Input
        label={t.textTitle}
        value={title}
        placeholder={t.textTitleDefault}
        maxLength={300}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea
        label={t.textBody}
        required
        rows={8}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {add.error ? (
        <Alert tone="danger" role="alert">
          {add.error.message}
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={add.isPending} disabled={!text.trim()}>
          {t.addText}
        </Button>
      </div>
    </form>
  );
}

function AppTab({ notebookId }: { notebookId: number }) {
  const client = useQueryClient();
  const [kind, setKind] = useState<"ficha" | "estudo">("ficha");
  const [record, setRecord] = useState("");
  const materials = useQuery({ queryKey: ["materials", ""], queryFn: () => listMaterials() });
  const studies = useQuery({ queryKey: ["studies"], queryFn: listStudies, enabled: kind === "estudo" });
  const add = useMutation({
    mutationFn: () => addNotebookAppSource(notebookId, kind, Number(record)),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: notebookKey(notebookId) });
      setRecord("");
    },
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (record) add.mutate();
      }}
    >
      <ButtonGroup label={t.appKind}>
        <ButtonGroupItem
          selected={kind === "ficha"}
          label={t.appMaterial}
          onClick={() => {
            setKind("ficha");
            setRecord("");
          }}
        />
        <ButtonGroupItem
          selected={kind === "estudo"}
          label={t.appStudy}
          onClick={() => {
            setKind("estudo");
            setRecord("");
          }}
        />
      </ButtonGroup>
      {kind === "ficha" ? (
        <Combobox
          label={t.appMaterial}
          value={record}
          onChange={setRecord}
          options={(materials.data ?? []).map((m) => ({
            value: String(m.id),
            label: m.name,
            description: m.class_name,
            keywords: m.keywords,
          }))}
        />
      ) : (studies.data ?? []).length === 0 && studies.isSuccess ? (
        <p className="text-sm text-ink-muted">{t.noStudies}</p>
      ) : (
        <Select
          label={t.appStudy}
          value={record}
          onChange={(event) => setRecord(event.target.value)}
        >
          <SelectOption value="">—</SelectOption>
          {(studies.data ?? []).map((study) => (
            <SelectOption key={study.id} value={String(study.id)}>
              {study.name}
            </SelectOption>
          ))}
        </Select>
      )}
      {add.error ? (
        <Alert tone="danger" role="alert">
          {add.error.message}
        </Alert>
      ) : null}
      {add.isSuccess ? (
        <p role="status" className="text-sm text-success-fg">
          {t.added(add.data.title)}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={add.isPending} disabled={!record}>
          {t.addApp}
        </Button>
      </div>
    </form>
  );
}
