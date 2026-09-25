"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StudioChoice, StudioRequest, StudioToolSpec } from "@/lib/types";
import { createStudioArtifact } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Dialog,
  IconButton,
  Input,
  RadioCard,
  Textarea,
} from "@/components/ui";
import { IconPencil, IconPlus, IconTrash } from "@/components/ui/icons";
import { studioKey } from "../keys";

const t = ptBR.notebooks.studio;

const CUSTOM = "personalizado";

/**
 * "Criar …": the modal a Studio tile opens, as NotebookLM draws it — cards of
 * **Formato**, cards of **Modelo** with a pencil that opens the template's own
 * instruction, the options the tool has, and one primary button, **Gerar**.
 *
 * Everything offered comes from the catalogue the API serves (`tool`), so the
 * instruction under the pencil is exactly the text the model will receive. A
 * choice the tool does not have is never sent: the API would refuse it.
 */
export function CreateArtifactDialog({
  notebookId,
  tool,
  maxColumns,
  onClose,
  onCreated,
}: {
  notebookId: number;
  /** The tool being created; `null` closes the dialog. */
  tool: StudioToolSpec | null;
  maxColumns: number;
  onClose: () => void;
  onCreated?: () => void;
}) {
  return (
    <Dialog
      open={tool !== null}
      onClose={onClose}
      title={tool ? (t.createTitle[tool.slug] ?? t.create(tool.label)) : ""}
      description={tool?.description}
    >
      {tool ? (
        <CreateForm
          key={tool.slug}
          notebookId={notebookId}
          tool={tool}
          maxColumns={maxColumns}
          onClose={onClose}
          onCreated={onCreated}
        />
      ) : null}
    </Dialog>
  );
}

function CreateForm({
  notebookId,
  tool,
  maxColumns,
  onClose,
  onCreated,
}: {
  notebookId: number;
  tool: StudioToolSpec;
  maxColumns: number;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const client = useQueryClient();
  const [format, setFormat] = useState(tool.formats[0]?.slug ?? null);
  const [template, setTemplate] = useState(tool.templates[0]?.slug ?? null);
  // One draft per template, so switching back does not lose an edit.
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(tool.templates.map((c) => [c.slug, c.instructions])),
  );
  const [columnDrafts, setColumnDrafts] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(tool.templates.map((c) => [c.slug, c.columns])),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [count, setCount] = useState(defaultOf(tool.counts, "padrao"));
  const [difficulty, setDifficulty] = useState(defaultOf(tool.difficulties, "medio"));
  const [topic, setTopic] = useState("");

  const chosen = tool.templates.find((c) => c.slug === template) ?? null;
  const instructions = template ? (drafts[template] ?? "") : "";
  const columns = template ? (columnDrafts[template] ?? []) : [];
  // The report's custom template is nothing without the student's words; the
  // table's may leave the columns to the model.
  const editorOpen = template !== null && (editing === template || template === CUSTOM);
  const missingInstructions =
    tool.slug === "report" && template === CUSTOM && !instructions.trim();

  const create = useMutation({
    mutationFn: () => createStudioArtifact(notebookId, buildRequest()),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: studioKey(notebookId) });
      onCreated?.();
      onClose();
    },
  });

  function buildRequest(): StudioRequest {
    const request: StudioRequest = { tool: tool.slug };
    if (format) request.format = format;
    if (template) request.template = template;
    if (tool.slug === "report" && chosen && instructions.trim() !== chosen.instructions) {
      request.instructions = instructions.trim();
    }
    if (tool.columns) request.columns = columns.map((c) => c.trim()).filter(Boolean);
    if (count) request.count = count;
    if (difficulty) request.difficulty = difficulty;
    if (topic.trim()) request.topic = topic.trim();
    return request;
  }

  const setColumns = (next: string[]) => {
    if (template) setColumnDrafts((all) => ({ ...all, [template]: next }));
  };

  return (
    <form
      className="dialog-wide flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!missingInstructions) create.mutate();
      }}
    >
      {tool.formats.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-ink">{t.format}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {tool.formats.map((choice) => (
              <RadioCard
                key={choice.slug}
                name="studio-format"
                value={choice.slug}
                checked={format === choice.slug}
                onChange={setFormat}
                title={choice.label}
              >
                <p className="text-support text-ink-muted">{choice.description}</p>
              </RadioCard>
            ))}
          </div>
        </fieldset>
      ) : null}

      {tool.templates.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-ink">{t.template}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {tool.templates.map((choice) => (
              <RadioCard
                key={choice.slug}
                name="studio-template"
                value={choice.slug}
                checked={template === choice.slug}
                onChange={(value) => {
                  setTemplate(value);
                  setEditing(null);
                }}
                title={choice.label}
                action={
                  choice.slug === CUSTOM ? null : (
                    <IconButton
                      size="sm"
                      label={t.editTemplate(choice.label)}
                      icon={<IconPencil />}
                      onClick={() => {
                        setTemplate(choice.slug);
                        setEditing(editing === choice.slug ? null : choice.slug);
                      }}
                    />
                  )
                }
              >
                <p className="text-support text-ink-muted">{choice.description}</p>
              </RadioCard>
            ))}
          </div>
          {editorOpen && tool.columns ? (
            <ColumnsEditor columns={columns} max={maxColumns} onChange={setColumns} />
          ) : null}
          {editorOpen && !tool.columns ? (
            <div className="well flex flex-col gap-2">
              <Textarea
                label={t.templateInstructions}
                hint={t.templateInstructionsHint}
                rows={4}
                maxLength={2000}
                placeholder={template === CUSTOM ? t.customPlaceholder : undefined}
                value={instructions}
                onChange={(event) =>
                  template && setDrafts((all) => ({ ...all, [template]: event.target.value }))
                }
              />
              {chosen && chosen.slug !== CUSTOM && instructions !== chosen.instructions ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setDrafts((all) => ({ ...all, [chosen.slug]: chosen.instructions }))}
                >
                  {t.restore}
                </Button>
              ) : null}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {tool.counts.length > 0 ? (
        <Segmented
          label={t.count[tool.slug] ?? ""}
          choices={tool.counts}
          value={count}
          onChange={setCount}
        />
      ) : null}
      {tool.difficulties.length > 0 ? (
        <Segmented
          label={t.difficulty}
          choices={tool.difficulties}
          value={difficulty}
          onChange={setDifficulty}
        />
      ) : null}

      <Textarea
        label={t.topic}
        rows={2}
        maxLength={500}
        placeholder={t.topicPlaceholder[tool.slug]}
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
      />

      {create.error ? (
        <Alert tone="danger" role="alert">
          {create.error.message}
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {ptBR.notebooks.cancel}
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={create.isPending}
          disabled={missingInstructions}
        >
          {t.generate}
        </Button>
      </div>
    </form>
  );
}

function defaultOf(choices: StudioChoice[], preferred: string): string | null {
  if (choices.length === 0) return null;
  return choices.some((c) => c.slug === preferred) ? preferred : (choices[0]?.slug ?? null);
}

/** A mutually exclusive row (count, difficulty), with the chosen one's
 * description said below it — "15 cartões" is what "Padrão" means. */
function Segmented({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: StudioChoice[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  const selected = choices.find((c) => c.slug === value);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <ButtonGroup label={label} className="self-start">
        {choices.map((choice) => (
          <ButtonGroupItem
            key={choice.slug}
            selected={value === choice.slug}
            label={choice.label}
            onClick={() => onChange(choice.slug)}
          />
        ))}
      </ButtonGroup>
      {selected ? <span className="text-caption text-ink-muted">{selected.description}</span> : null}
    </div>
  );
}

function ColumnsEditor({
  columns,
  max,
  onChange,
}: {
  columns: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="well flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink">{t.columns}</span>
      {columns.length === 0 ? <p className="text-support text-ink-muted">{t.columnsHint}</p> : null}
      <ol className="flex flex-col gap-2">
        {columns.map((column, index) => (
          <li key={index} className="flex items-end gap-2">
            <Input
              label={t.columnLabel(index + 1)}
              className="flex-1"
              maxLength={60}
              value={column}
              onChange={(event) =>
                onChange(columns.map((c, i) => (i === index ? event.target.value : c)))
              }
            />
            <IconButton
              size="sm"
              label={t.removeColumn(column || t.columnLabel(index + 1))}
              icon={<IconTrash />}
              onClick={() => onChange(columns.filter((_, i) => i !== index))}
            />
          </li>
        ))}
      </ol>
      {columns.length < max ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<IconPlus />}
          className="self-start"
          onClick={() => onChange([...columns, ""])}
        >
          {t.addColumn}
        </Button>
      ) : null}
    </div>
  );
}
