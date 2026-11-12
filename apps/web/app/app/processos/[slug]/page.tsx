"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProcess } from "@/lib/api";
import type { ProcessAttributeValue } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { FavoriteButton } from "@/components/my-records/FavoriteButton";
import { useRecordVisit } from "@/components/my-records/useRecordVisit";
import { AttributeValueText } from "@/components/process/AttributeValueText";
import {
  Breadcrumb,
  Card,
  CardBody,
  DataQualityBadge,
  DataQualityLegend,
  EmptyState,
  ErrorState,
  LoadingState,
  MissingValue,
  PageDoc,
  PropertyList,
  ProvenancePopover,
  provenanceOfProcessAttribute,
  qualityState,
  type PropertyItem,
} from "@/components/ui";
import { IconGear } from "@/components/ui/icons";
import { fichaText } from "@/lib/i18n-ficha";
import { CollapsibleSection } from "@/components/material/CollapsibleSection";
import { usePageTitle } from "@/lib/pageTitle";

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

  useRecordVisit("process", process.data?.id);
  // D-215: the sheets' folding section (D-215), open: it is what the page is for.
  const [attributesOpen, setAttributesOpen] = useState(true);

  // D-207: the tab and the menu's "Recentes" carry the record's own name.
  usePageTitle(process.data?.name);

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

      {/* D-215: the process sheet in the material sheet's mould — a document
          page whose properties sit in one aligned list, with the attributes
          below in a section that folds. */}
      <PageDoc
        icon={<IconGear className="h-5 w-5" />}
        title={data.name}
        primaryAction={<FavoriteButton universe="process" recordId={data.id} />}
        properties={
          <PropertyList
            items={[
              {
                id: "familia",
                label: t.family,
                value: (
                  <Link
                    href={`/app/processos/familia/${data.class_slug}`}
                    className="rounded-control font-medium text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {data.class_name}
                  </Link>
                ),
              },
              {
                id: "materiais",
                label: fichaText.doc.materialsLabel,
                value:
                  data.material_count === 0
                    ? t.noMaterialsServed
                    : t.materialsServed(data.material_count),
              },
            ]}
          />
        }
      >
        {data.description ? (
          <p className="max-w-prose text-body text-ink">{data.description}</p>
        ) : null}

        <CollapsibleSection
          id="atributos"
          title={t.attributes}
          description={t.attributesHint}
          open={attributesOpen}
          onOpenChange={setAttributesOpen}
        >
          {data.attributes.length === 0 ? (
            <EmptyState title={t.noAttributes} />
          ) : (
            <PropertyList
              items={data.attributes.map((value) => attributeItem(value))}
            />
          )}
          <Card>
            <CardBody>
              <DataQualityLegend />
            </CardBody>
          </Card>
        </CollapsibleSection>
      </PageDoc>
    </div>
  );
}

/**
 * One attribute as a row of the property list, with the rule it is compared
 * by stated under it.
 *
 * The kind is not decoration: an envelope is compared by **reach** and a scalar
 * by its own value (D-59), so a reader who cannot see which rule applies cannot
 * check the selection that used it. That obligation is the same one the report's
 * provenance sheet took on, carried to the screen.
 */
function attributeItem(value: ProcessAttributeValue): PropertyItem {
  const provenance = provenanceOfProcessAttribute(value);
  const hint = kindHint(value);
  return {
    id: value.attribute_slug,
    label: value.attribute_name,
    value: (
      <ProvenancePopover provenance={provenance}>
        {value.is_missing ? <MissingValue /> : <AttributeValueText value={value} />}
      </ProvenancePopover>
    ),
    hint: (
      <>
        <span className="block">{kindLabel(value)}</span>
        {hint ? <span className="block">{hint}</span> : null}
      </>
    ),
    aside: value.is_missing ? undefined : <DataQualityBadge state={qualityState(provenance)} />,
  };
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
