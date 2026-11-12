"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { Popover } from "./Popover";
import { IconCheck, IconChevronDown, IconClose, IconPlus } from "./icons";

const t = ptBR.ds;

export interface FilterOption {
  value: string;
  label: string;
  /**
   * D-215: how many results choosing this option would leave, as the server
   * counted them (the other filters applied). Omitted, no number is shown.
   */
  count?: number;
}

export interface FilterField {
  id: string;
  /** The field's name, as the chip writes it before the colon. */
  label: string;
  options: readonly FilterOption[];
  /** The chosen value, or `null` when the field does not filter. */
  value: string | null;
  /** Always on the bar, even unset ("Classe: Qualquer"). Others wait in "+ Filtro". */
  pinned?: boolean;
}

/**
 * D-206: filters as a row of chips, Linear's and Notion's bar in M3 terms
 * (filter chips + a menu). Each chip reads "Campo: valor ▾" and opens its
 * options; "+ Filtro" lists the fields not on the bar yet; "Limpar" resets.
 *
 * On a phone each panel is the bottom sheet `Popover` already becomes there
 * (D-197), so the "FilterSheet" of the plan is this same bar — one component,
 * the window decides the surface. Nothing here filters: the bar reports a
 * choice, the screen asks the server, and the server answers (no ranking or
 * counting moves to the client).
 */
export function FilterBar({
  fields,
  onChange,
  onClear,
  label = t.filters,
  className,
}: {
  fields: readonly FilterField[];
  onChange: (id: string, value: string | null) => void;
  onClear?: () => void;
  /** The bar's accessible name; "Filtros" by default. */
  label?: string;
  className?: string;
}) {
  // A field picked from "+ Filtro" joins the bar unset, and its chip is where
  // the value is chosen: one panel at a time, never a menu inside a menu.
  const [added, setAdded] = useState<string[]>([]);
  const onBar = (field: FilterField) =>
    field.pinned || field.value !== null || added.includes(field.id);
  const visible = fields.filter(onBar);
  const waiting = fields.filter((field) => !onBar(field));
  const active = fields.some((field) => field.value !== null);

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      {visible.map((field) => (
        <FilterChip
          key={field.id}
          field={field}
          onChange={(value) => onChange(field.id, value)}
          onRemove={
            field.pinned
              ? undefined
              : () => {
                  setAdded((ids) => ids.filter((id) => id !== field.id));
                  onChange(field.id, null);
                }
          }
        />
      ))}

      {waiting.length > 0 ? (
        <Popover
          label={t.addFilterMenu}
          title={t.addFilterMenu}
          trigger={
            <>
              <IconPlus className="h-4 w-4" aria-hidden />
              <span>{t.addFilter}</span>
            </>
          }
          triggerClassName="msds-chip msds-ripple-host ds-filter-add"
        >
          {(close) => (
            <ul className="flex flex-col">
              {waiting.map((field) => (
                <li key={field.id}>
                  <button
                    type="button"
                    className="ds-option m3-state"
                    onClick={() => {
                      setAdded((ids) => [...ids, field.id]);
                      close();
                    }}
                  >
                    {field.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      ) : null}

      {active && onClear ? (
        <button
          type="button"
          className="msds-btn msds-btn-ghost msds-btn-sm msds-ripple-host"
          onClick={() => {
            setAdded([]);
            onClear();
          }}
        >
          {t.clearFilters}
        </button>
      ) : null}
    </div>
  );
}

function FilterChip({
  field,
  onChange,
  onRemove,
}: {
  field: FilterField;
  onChange: (value: string | null) => void;
  /** Takes an unpinned field off the bar; a pinned one only goes back to "Qualquer". */
  onRemove?: () => void;
}) {
  const chosen = field.options.find((option) => option.value === field.value);
  const text = t.filterChip(field.label, chosen?.label ?? t.anyValue);
  return (
    <span className="inline-flex items-center">
      <Popover
        label={text}
        title={field.label}
        trigger={
          <>
            <span className="truncate">{text}</span>
            <IconChevronDown className="h-4 w-4 shrink-0" aria-hidden />
          </>
        }
        triggerClassName={cn("msds-chip msds-ripple-host", chosen && "ds-filter-on")}
      >
        {(close) => (
          <OptionList
            field={field}
            onPick={(value) => {
              onChange(value);
              close();
            }}
          />
        )}
      </Popover>
      {chosen || onRemove ? (
        <button
          type="button"
          className="msds-icon-btn msds-icon-btn-standard msds-icon-btn-sm msds-ripple-host -ml-1"
          aria-label={t.removeFilter(field.label)}
          title={t.removeFilter(field.label)}
          onClick={() => (onRemove ? onRemove() : onChange(null))}
        >
          <IconClose aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

function OptionList({
  field,
  onPick,
}: {
  field: FilterField;
  onPick: (value: string | null) => void;
}) {
  const options: { value: string | null; label: string; count?: number }[] = [
    { value: null, label: t.anyValue },
    ...field.options,
  ];
  return (
    <ul className="flex flex-col" aria-label={field.label}>
      {options.map((option) => {
        const selected = option.value === field.value;
        return (
          <li key={option.value ?? "__any"}>
            <button
              type="button"
              aria-pressed={selected}
              aria-label={
                "count" in option && typeof option.count === "number"
                  ? t.optionCount(option.label, option.count)
                  : undefined
              }
              className="ds-option m3-state"
              onClick={() => onPick(option.value)}
            >
              <span className="min-w-0 flex-1 break-words text-left">{option.label}</span>
              {"count" in option && typeof option.count === "number" ? (
                <span aria-hidden className="shrink-0 text-caption tabular-nums text-ink-muted">
                  {option.count.toLocaleString("pt-BR")}
                </span>
              ) : null}
              {selected ? <IconCheck className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
