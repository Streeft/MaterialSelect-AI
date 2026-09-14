"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getProcess } from "@/lib/api";
import type { ProcessAttributeValue } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  DataQualityBadge,
  DataQualityLegend,
  EmptyState,
  ErrorState,
  LoadingState,
  MissingValue,
  PageHeader,
  ProvenancePopover,
  Section,
  provenanceOfProcessAttribute,
  qualityState,
} from "@/components/ui";

const t = ptBR.processes;

/**
 * The process datasheet (P1-4).
 *
 * `GET /api/processes/{slug}` has returned all of this since P0-4 — the
 * attributes with the whole provenance trail — and nothing rendered it. This is
 * the missing half, and it is deliberately the *same* reading experience as a
 * material's datasheet: the value is the trigger, the quality is a badge next to
 * it, and absence is a written state rather than a blank.
 */
export default function ProcessDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const process = useQuery({
    queryKey: ["process", slug],
    queryFn: () => getProcess(slug),
    enabled: Boolean(slug),
  });

  if (process.isLoading) return <LoadingState label={t.loading} />;
  if (process.isError) {
    return <ErrorState title={t.notFound} onRetry={() => void process.refetch()} />;
  }
  if (!process.data) return null;

  const data = process.data;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: t.backToProcesses, href: "/app/processos" },
          { label: data.class_name, href: `/app/processos/familia/${data.class_slug}` },
          { label: data.name },
        ]}
      />

      <PageHeader
        title={data.name}
        description={data.description ?? undefined}
        group="dados"
        actions={data.is_demo ? <Badge tone="warning">{ptBR.demoBadge}</Badge> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Section id="atributos" title={t.attributes} description={t.attributesHint}>
          {data.attributes.length === 0 ? (
            <EmptyState title={t.noAttributes} />
          ) : (
            <Card>
              <CardBody className="flex flex-col gap-4">
                {data.attributes.map((value) => (
                  <AttributeRow key={value.attribute_slug} value={value} />
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <DataQualityLegend />
            </CardBody>
          </Card>
        </Section>

        <div className="flex min-w-0 flex-col gap-3">
          <Section id="materiais" title={t.family}>
            <Card>
              <CardBody className="flex flex-col gap-2 text-sm">
                <Link
                  href={`/app/processos/familia/${data.class_slug}`}
                  className="rounded-control font-medium text-ink underline-offset-2 hover:text-brand-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {data.class_name}
                </Link>
                <p className="text-ink-muted">
                  {data.material_count === 0
                    ? t.noMaterialsServed
                    : t.materialsServed(data.material_count)}
                </p>
              </CardBody>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}

/**
 * One attribute, with the rule it is compared by stated next to it.
 *
 * The kind is not decoration: an envelope is compared by **reach** and a scalar
 * by its own value (D-59), so a reader who cannot see which rule applies cannot
 * check the selection that used it. That obligation is the same one the report's
 * provenance sheet took on, carried to the screen.
 */
function AttributeRow({ value }: { value: ProcessAttributeValue }) {
  const provenance = provenanceOfProcessAttribute(value);
  const state = qualityState(provenance);

  return (
    <div className="flex flex-col gap-1 border-b border-edge pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-ink">{value.attribute_name}</span>
        <span className="text-xs text-ink-subtle">{kindLabel(value)}</span>
      </div>

      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {value.is_missing ? (
          <ProvenancePopover provenance={provenance}>
            <MissingValue />
          </ProvenancePopover>
        ) : (
          <>
            <ProvenancePopover provenance={provenance}>
              <AttributeValueText value={value} />
            </ProvenancePopover>
            <DataQualityBadge state={state} />
          </>
        )}
      </span>

      {kindHint(value) ? (
        <p className="text-xs text-ink-muted">{kindHint(value)}</p>
      ) : null}
    </div>
  );
}

function kindLabel(value: ProcessAttributeValue): string {
  // A table, not a ternary: with three kinds a ternary maps the third to
  // whichever branch is the fallback, and the row would be labelled wrong.
  const labels: Record<ProcessAttributeValue["kind"], string> = {
    ESCALAR: t.kindESCALAR,
    ENVELOPE: t.kindENVELOPE,
    DISCRETO: t.kindDISCRETO,
  };
  return labels[value.kind];
}

function kindHint(value: ProcessAttributeValue): string | null {
  if (value.is_missing) return null;
  if (value.kind === "ENVELOPE") return t.kindEnvelopeHint;
  if (value.kind === "DISCRETO") return t.kindDiscretoHint;
  return null;
}

function AttributeValueText({ value }: { value: ProcessAttributeValue }) {
  const unit = prettyUnit(value.original_unit);

  if (value.kind === "DISCRETO") {
    if (value.labels.length === 0) return <MissingValue />;
    return (
      <span className="flex flex-wrap gap-1">
        {value.labels.map((label) => (
          <Badge key={label} tone="neutral">
            {label}
          </Badge>
        ))}
      </span>
    );
  }

  if (value.value_min !== null && value.value_max !== null) {
    return (
      <span>
        <span className="font-medium tabular-nums">
          {formatNumber(value.value_min)} – {formatNumber(value.value_max)}
        </span>{" "}
        {unit}
      </span>
    );
  }

  if (value.value_scalar !== null) {
    return (
      <span>
        <span className="font-medium tabular-nums">{formatNumber(value.value_scalar)}</span> {unit}
      </span>
    );
  }

  // Carrying no value without being flagged missing is still absence, and
  // absence has exactly one rendering in this system.
  return <MissingValue />;
}
