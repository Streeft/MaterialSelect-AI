"use client";

import { useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addExternalSource, getSourceCapabilities, searchSources } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import type {
  Notebook,
  NotebookSearch,
  NotebookSearchProvider,
  NotebookSearchResult,
  NotebookSourceCapability,
} from "@/lib/types";
import { Alert, Button, ButtonGroup, ButtonGroupItem, Checkbox, Input } from "@/components/ui";
import { IconSearch } from "@/components/ui/icons";
import { SOURCE_CAPABILITIES_KEY, notebookKey } from "./keys";
import { webLink } from "./SourceReader";

const t = ptBR.notebooks;
const s = t.search;

const PROVIDERS: NotebookSearchProvider[] = ["openalex", "wikipedia", "web"];

type ItemState =
  | { state: "adding" }
  | { state: "added" }
  | { state: "failed"; message: string };

/** What a search answered, and for which question — the empty state names it. */
interface Answer {
  provider: NotebookSearchProvider;
  query: string;
  data: NotebookSearch;
}

/**
 * Google's Search Suggestions, wrapped for a sandboxed frame.
 *
 * The HTML is Google's (`searchEntryPoint.renderedContent`): a `<style>`, a
 * headline and a row of `<a class="chip">` links — no script, so the frame
 * gets none (`sandbox` without `allow-scripts`, and never `allow-same-origin`).
 * Two lines go in front of it and none of Google's is touched: a `<base>` so a
 * chip opens in a new tab — the frame cannot navigate the page, and
 * google.com refuses to be framed, so a chip that stayed in the frame would
 * open a blank box — and a policy that lets the markup style itself and
 * nothing else load or run, a second wall behind the sandbox.
 */
export function suggestionsDocument(html: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
    "style-src 'unsafe-inline'; img-src https: data:\">" +
    '<meta name="referrer" content="no-referrer">' +
    '<base target="_blank">' +
    "</head><body style=\"margin:0\">" +
    html +
    "</body></html>"
  );
}

/**
 * Searching for new sources, inside the sources panel (D-97): scholarly works
 * (OpenAlex), Wikipédia articles or the web (Google, through the Gemini free
 * tier). A search shows what exists; nothing enters the notebook until the
 * student ticks it and adds — and then the server fetches it again by its
 * key, never from anything this screen holds.
 */
export function SourceSearch({ notebook }: { notebook: Notebook }) {
  const client = useQueryClient();
  const [chosen, setChosen] = useState<NotebookSearchProvider | null>(null);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const reasonId = useId();
  const refresh = () => client.invalidateQueries({ queryKey: notebookKey(notebook.id) });

  const capabilities = useQuery({
    queryKey: SOURCE_CAPABILITIES_KEY,
    queryFn: getSourceCapabilities,
    staleTime: Infinity,
  });
  const capability = (provider: NotebookSearchProvider): NotebookSourceCapability | undefined =>
    capabilities.data?.[provider];
  // Until the student picks, the first one switched on; while the capabilities
  // load (or if they fail to), nothing is blocked — the server refuses a
  // switched-off provider with its own reason.
  const provider: NotebookSearchProvider =
    chosen ?? PROVIDERS.find((p) => capability(p)?.enabled !== false) ?? "openalex";
  const active = capability(provider);
  const blocked = active ? !active.enabled : false;

  const search = useMutation<Answer, Error, { provider: NotebookSearchProvider; query: string }>({
    mutationFn: async (asked) => ({ ...asked, data: await searchSources(notebook.id, asked) }),
    onSuccess: (found) => {
      setAnswer(found);
      setSelected([]);
      setItems({});
    },
    // A search that left the server counts against the day, found or failed.
    onSettled: () => void refresh(),
  });

  const add = useMutation<void, Error, NotebookSearchResult[]>({
    // One at a time, each with its own status: a failure in the middle says
    // which result failed and why, and the ones before it stay added.
    mutationFn: async (results) => {
      for (const result of results) {
        setItems((now) => ({ ...now, [result.key]: { state: "adding" } }));
        try {
          await addExternalSource(notebook.id, { provider: result.provider, key: result.key });
          setItems((now) => ({ ...now, [result.key]: { state: "added" } }));
          setSelected((now) => now.filter((key) => key !== result.key));
          await refresh();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setItems((now) => ({ ...now, [result.key]: { state: "failed", message } }));
          // A failed fetch still left the server and counted.
          void refresh();
        }
      }
    },
  });

  const results = answer?.data.results ?? [];
  const selectable = (result: NotebookSearchResult) =>
    result.has_text && !result.already_added && items[result.key]?.state !== "added";
  const chosenResults = results.filter((r) => selected.includes(r.key) && selectable(r));

  const submit = () => {
    const text = query.trim();
    if (!text || blocked || search.isPending) return;
    search.mutate({ provider, query: text });
  };

  const usage = notebook.fetch_usage;

  return (
    <section aria-labelledby={`${reasonId}-titulo`} className="well flex flex-col gap-3">
      <h3
        id={`${reasonId}-titulo`}
        className="flex items-center gap-2 text-sm font-semibold text-ink"
      >
        <IconSearch className="text-brand-700" />
        {s.label}
      </h3>

      <ButtonGroup label={s.providersLabel} className="self-start">
        {PROVIDERS.map((p) => {
          const cap = capability(p);
          const off = cap ? !cap.enabled : false;
          return (
            <ButtonGroupItem
              key={p}
              selected={p === provider}
              label={s.providers[p] ?? p}
              // Switched off stays focusable and pickable: picking it is how
              // the student reads why it is off.
              aria-disabled={off || undefined}
              aria-describedby={off && cap?.reason ? `${reasonId}-${p}` : undefined}
              onClick={() => {
                setChosen(p);
                search.reset();
              }}
            />
          );
        })}
      </ButtonGroup>
      {PROVIDERS.map((p) => {
        const cap = capability(p);
        return cap && !cap.enabled && cap.reason && p !== provider ? (
          <span key={p} id={`${reasonId}-${p}`} className="sr-only">
            {cap.reason}
          </span>
        ) : null;
      })}

      {blocked ? (
        <div id={`${reasonId}-${provider}`}>
          <Alert tone="info" title={s.providerOff(s.providers[provider] ?? provider)}>
            {active?.reason}
          </Alert>
        </div>
      ) : null}

      {provider === "web" ? <Alert tone="warning">{s.webPrivacy}</Alert> : null}

      <form
        role="search"
        aria-label={s.label}
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          label={s.queryLabel}
          type="search"
          autoComplete="off"
          maxLength={300}
          value={query}
          placeholder={s.queryPlaceholder[provider]}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {usage ? (
            <span className="text-caption text-ink-muted">{s.usage(usage.used, usage.limit)}</span>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            variant="secondary"
            icon={<IconSearch />}
            loading={search.isPending}
            disabled={!query.trim()}
            // The ToolTile convention: focusable, and says why it does nothing.
            aria-disabled={blocked || undefined}
            aria-describedby={blocked && active?.reason ? `${reasonId}-${provider}` : undefined}
            className={blocked ? "cursor-not-allowed opacity-70" : undefined}
          >
            {search.isPending ? s.searching : s.submit}
          </Button>
        </div>
      </form>

      {search.error ? (
        <Alert tone="danger" role="alert">
          {search.error.message}
        </Alert>
      ) : null}

      {answer && !search.isPending ? (
        <SearchResults
          answer={answer}
          results={results}
          selected={selected}
          items={items}
          selectable={selectable}
          onToggle={(key, on) =>
            setSelected((now) => (on ? [...now, key] : now.filter((k) => k !== key)))
          }
        />
      ) : null}

      {chosenResults.length > 0 || add.isPending ? (
        <Button
          variant="secondary"
          loading={add.isPending}
          onClick={() => {
            if (!add.isPending && chosenResults.length > 0) add.mutate(chosenResults);
          }}
          className="w-full justify-center"
        >
          {add.isPending ? s.itemStatus.adding : s.add(chosenResults.length)}
        </Button>
      ) : null}
    </section>
  );
}

function SearchResults({
  answer,
  results,
  selected,
  items,
  selectable,
  onToggle,
}: {
  answer: Answer;
  results: NotebookSearchResult[];
  selected: string[];
  items: Record<string, ItemState>;
  selectable: (result: NotebookSearchResult) => boolean;
  onToggle: (key: string, on: boolean) => void;
}) {
  const { data } = answer;
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-caption text-ink-muted">
        {results.length === 0 ? s.empty(answer.query) : s.resultsCount(results.length)}
      </p>
      {data.notice ? <p className="text-caption text-ink-muted">{data.notice}</p> : null}

      {data.search_entry_point_html ? (
        // Google's terms: its suggestions are shown with grounded results.
        // Third-party HTML, so only ever inside a sandboxed frame — never
        // injected into this page.
        <iframe
          title={s.suggestionsLabel}
          srcDoc={suggestionsDocument(data.search_entry_point_html)}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-20 w-full rounded-control border-0 bg-panel"
        />
      ) : null}

      {results.length > 0 ? (
        <ul aria-label={s.results} className="flex flex-col gap-2">
          {results.map((result) => (
            <ResultItem
              key={result.key}
              result={result}
              checked={selected.includes(result.key)}
              item={items[result.key]}
              selectable={selectable(result)}
              onToggle={(on) => onToggle(result.key, on)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ResultItem({
  result,
  checked,
  item,
  selectable,
  onToggle,
}: {
  result: NotebookSearchResult;
  checked: boolean;
  item: ItemState | undefined;
  selectable: boolean;
  onToggle: (on: boolean) => void;
}) {
  const title = result.title.trim() || s.noTitle;
  const link = result.url ? webLink(result.url) : null;
  // Why a result cannot be ticked, written — never a silently greyed box.
  const why =
    item?.state === "added"
      ? null
      : result.already_added
        ? s.alreadyAdded
        : !result.has_text
          ? s.noText
          : null;

  return (
    <li className="flex flex-col gap-1 border-t border-line-divider pt-2 first:border-t-0 first:pt-0">
      <Checkbox
        label={<span className="font-medium text-ink">{title}</span>}
        aria-label={s.select(title)}
        checked={selectable ? checked : false}
        disabled={!selectable}
        hint={why ? <Absent>{why}</Absent> : undefined}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <div className="ml-[26px] flex flex-col gap-1 text-support">
        <Subtitle result={result} />
        {result.snippet ? (
          <p className="text-ink-muted">{result.snippet}</p>
        ) : result.has_text ? (
          <Absent>{s.noSnippet}</Absent>
        ) : null}
        <p className="flex flex-wrap gap-x-2 text-caption text-ink-muted">
          {link ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="break-all font-medium text-accent underline underline-offset-2"
            >
              {result.provider === "web" ? s.searchLink : link.host}
              <span className="sr-only"> — {s.openResult(title)}</span>
            </a>
          ) : result.url ? (
            <span className="break-all">{result.url}</span>
          ) : null}
          <span>{result.license ?? <Absent>{t.reader.noLicense}</Absent>}</span>
        </p>
        {item ? <ItemStatus item={item} /> : null}
      </div>
    </li>
  );
}

/** Authors · year · venue of a work, or the edition of an encyclopedia. The
 * server composes it; when it has nothing, the absence is written (D-24). */
function Subtitle({ result }: { result: NotebookSearchResult }) {
  if (result.subtitle && result.subtitle.trim()) {
    return <p className="text-ink">{result.subtitle}</p>;
  }
  if (result.provider === "openalex") {
    return (
      <p>
        <Absent>
          {s.noAuthors} · {s.noYear} · {t.reader.noVenue}
        </Absent>
      </p>
    );
  }
  return null;
}

function ItemStatus({ item }: { item: ItemState }) {
  if (item.state === "failed") {
    return (
      <p role="alert" className="text-caption text-danger-fg">
        {s.itemStatus.failed}: {item.message}
      </p>
    );
  }
  return (
    <p
      role="status"
      className={cn("text-caption", item.state === "added" ? "text-success-fg" : "text-ink-muted")}
    >
      {s.itemStatus[item.state]}
    </p>
  );
}

/** A written absence (D-24): never a blank cell, a zero or a dash. */
function Absent({ children }: { children: ReactNode }) {
  return <span className="italic text-ink-muted">{children}</span>;
}
