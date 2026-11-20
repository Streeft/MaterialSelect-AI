"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addAssemblyPart,
  deleteAssembly,
  deleteAssemblyPart,
  getAssembly,
  listMaterials,
  listStudies,
  updateAssembly,
  updateAssemblyPart,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import type {
  Assembly,
  AssemblyFigure,
  AssemblyPart,
  AssemblyPartInput,
  AssemblyPartPatch,
  AssemblyQuantity,
  AssemblyTotal,
  DataQuality,
  PartRole,
} from "@/lib/types";
import { useAnnounce } from "@/components/ui/Announcer";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import {
  Alert,
  Breadcrumb,
  Button,
  Combobox,
  ConfirmDialog,
  DataQualityBadge,
  ErrorState,
  Input,
  MenuButton,
  MenuItem,
  NumberInput,
  PageDoc,
  Section,
  Select,
  SelectOption,
  SheetSkeleton,
  Textarea,
  type ComboboxOption,
} from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import { trayDragProps, trayMaterials, useTray, useTrayDrop } from "@/lib/tray";
import type { TrayItem } from "@/lib/types";
import { ProjectTrial } from "./ProjectTrial";
import { ASSEMBLIES_KEY, assemblyKey } from "./keys";

const t = ptBR.projects;

const ROLES: readonly PartRole[] = ["estrutural", "fixacao", "acabamento", "outro"];
const QUANTITIES: readonly AssemblyQuantity[] = ["mass", "material_cost", "embodied_energy", "carbon"];
const QUALITIES: readonly string[] = ["MEDIDO", "IMPORTADO", "ESTIMADO"];

/** A figure of one part: the server's number with its unit, or the server's reason. Never a zero. */
/**
 * The unit printed after a number. A cost has none to print: the catalogue records cost per mass
 * without a currency (D-65), and the page says so once, in the server's words, under the totals.
 */
function shownUnit(quantity: AssemblyQuantity, unit: string): string {
  return quantity === "material_cost" ? "" : ` ${unit}`;
}

function FigureValue({ figure, unit }: { figure: AssemblyFigure; unit: string }) {
  if (figure.value === null) {
    return <span className="text-support italic text-ink-muted">{figure.reason}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-body font-medium tabular-nums text-ink">
        {formatNumber(figure.value)}
        {unit}
      </span>
      {figure.quality && QUALITIES.includes(figure.quality) ? (
        <DataQualityBadge state={figure.quality as DataQuality} showLabel={false} />
      ) : null}
    </span>
  );
}

/** One total: the sum, or its refusal with the partial sum named as partial (D-257). */
function TotalValue({ total, quantity }: { total: AssemblyTotal; quantity: AssemblyQuantity }) {
  const unit = shownUnit(quantity, total.unit);
  if (total.value !== null) {
    return (
      <span className="text-heading font-semibold tabular-nums text-ink">
        {formatNumber(total.value)}
        {unit}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1 text-support text-ink-muted">
      <span>{t.noTotal(total.missing_parts.length, total.missing_parts.join(", "))}</span>
      <span>
        {total.known_parts > 0
          ? t.partialSum(`${formatNumber(total.known_sum)}${unit}`, total.known_parts)
          : t.noPartial}
      </span>
    </span>
  );
}

/**
 * One part, edited in place. Text and numbers are drafts committed when the field is left;
 * a choice (role, material, study) is committed at once. Every commit is a PATCH that answers
 * the whole project, so the figures below the fields are always the server's.
 */
function PartCard({
  part,
  units,
  materialOptions,
  studies,
  busy,
  onPatch,
  onRemove,
  carried,
  onUseCarried,
}: {
  part: AssemblyPart;
  units: Record<AssemblyQuantity, string>;
  materialOptions: ComboboxOption[];
  studies: { id: number; name: string }[];
  busy: boolean;
  onPatch: (patch: AssemblyPartPatch) => void;
  onRemove: () => void;
  /** D-258: the tray's materials, offered in the part's menu and accepted when dropped here. */
  carried: TrayItem[];
  onUseCarried: (materialId: number, materialName: string) => void;
}) {
  const [name, setName] = useState(part.name);
  const drop = useTrayDrop(onUseCarried);
  const [quantity, setQuantity] = useState(String(part.quantity));
  const [mass, setMass] = useState(part.unit_mass === null ? "" : String(part.unit_mass));

  const commitName = () => {
    const next = name.trim();
    if (!next) setName(part.name);
    else if (next !== part.name) onPatch({ name: next });
  };
  const commitQuantity = () => {
    const next = Number(quantity);
    if (!Number.isInteger(next) || next < 1) setQuantity(String(part.quantity));
    else if (next !== part.quantity) onPatch({ quantity: next });
  };
  const commitMass = () => {
    if (mass.trim() === "") {
      if (part.unit_mass !== null) onPatch({ unit_mass: null });
      return;
    }
    const next = Number(mass);
    if (!Number.isFinite(next) || next <= 0) setMass(part.unit_mass === null ? "" : String(part.unit_mass));
    else if (next !== part.unit_mass) onPatch({ unit_mass: next });
  };

  // The chosen material is always an option, even while the catalogue list is loading.
  const options = useMemo(() => {
    if (!part.material || materialOptions.some((o) => o.value === String(part.material?.id))) {
      return materialOptions;
    }
    return [
      { value: String(part.material.id), label: part.material.name, description: part.material.class_name },
      ...materialOptions,
    ];
  }, [materialOptions, part.material]);

  return (
    <li>
      <section
        aria-label={t.partRegion(part.name)}
        className="flex flex-col gap-4 rounded-card border border-line bg-panel p-4"
        // D-258: a material dragged from the tray's strip lands here. The outline says where.
        {...drop}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Input
            className="min-w-0 flex-1 basis-48"
            label={t.partName}
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
          />
          <Select
            className="basis-36"
            label={t.role}
            value={part.role}
            onChange={(event) => onPatch({ role: (event.target as HTMLSelectElement).value as PartRole })}
          >
            {ROLES.map((role) => (
              <SelectOption key={role} value={role}>
                {t.roles[role]}
              </SelectOption>
            ))}
          </Select>
          <NumberInput
            className="basis-28"
            label={t.quantity}
            min={1}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onBlur={commitQuantity}
          />
          <NumberInput
            className="basis-36"
            label={t.unitMass}
            unit="kg"
            min={0}
            step="any"
            value={mass}
            onChange={(event) => setMass(event.target.value)}
            onBlur={commitMass}
          />
          <MenuButton label={t.partMenu(part.name)} iconOnly icon={<span aria-hidden>⋯</span>}>
            <MenuItem href={`/app/selecao?funcao=${encodeURIComponent(part.name)}`}>{t.newStudy}</MenuItem>
            {part.material || part.material_unavailable ? (
              <MenuItem onSelect={() => onPatch({ material_id: null })}>{t.clearMaterial}</MenuItem>
            ) : null}
            {carried
              .filter((item) => item.record_id !== part.material?.id)
              .map((item) => (
                <MenuItem key={item.id} onSelect={() => onUseCarried(item.record_id!, item.name)}>
                  {ptBR.tray.useInPart(item.name)}
                </MenuItem>
              ))}
            <MenuItem onSelect={onRemove} disabled={busy}>
              {t.removePart}
            </MenuItem>
          </MenuButton>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <Combobox
              label={t.material}
              hint={part.material ? undefined : t.materialHint}
              options={options}
              value={part.material ? String(part.material.id) : ""}
              onChange={(value) => {
                const id = Number(value);
                if (value && Number.isInteger(id) && id !== part.material?.id) onPatch({ material_id: id });
              }}
            />
            {part.material_unavailable ? (
              <Alert tone="warning">{t.materialGone}</Alert>
            ) : part.material ? (
              <Link
                href={`/app/materiais/${part.material.id}`}
                className="touch-target self-start text-support font-medium text-brand-700 underline"
              >
                {t.materialSheet(part.material.name)}
              </Link>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Select
              label={t.study}
              hint={part.study ? undefined : t.studyHint}
              value={part.study ? String(part.study.id) : ""}
              onChange={(event) => {
                const value = (event.target as HTMLSelectElement).value;
                onPatch({ study_id: value ? Number(value) : null });
              }}
            >
              <SelectOption value="">{t.studyNone}</SelectOption>
              {studies.map((study) => (
                <SelectOption key={study.id} value={String(study.id)}>
                  {study.name}
                </SelectOption>
              ))}
            </Select>
            {part.study ? (
              <Link
                href={`/app/selecao?estudo=${part.study.id}`}
                className="touch-target self-start text-support font-medium text-brand-700 underline"
              >
                {t.openStudy(part.study.name)}
              </Link>
            ) : null}
          </div>
        </div>

        <dl aria-label={t.figures(part.name)} className="well grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUANTITIES.map((quantity) => (
            <div key={quantity} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-ink-muted">{t.quantities[quantity]}</dt>
              <dd>
                <FigureValue figure={part[quantity]} unit={shownUnit(quantity, units[quantity])} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </li>
  );
}

/**
 * One project (D-257): its name and description, its parts and what they add up to.
 *
 * Nothing here adds, multiplies or defaults a number. A part's mass, cost, energy and CO₂ and
 * every total come from `GET /api/assemblies/{id}`, and each write answers the project again
 * with the sums redone; an absent figure arrives with its reason and is shown as that reason.
 */
export function ProjectWorkspace({ id }: { id: number }) {
  const client = useQueryClient();
  const router = useRouter();
  const announce = useAnnounce();
  const snackbar = useOptionalSnackbar();
  const key = assemblyKey(id);

  const project = useQuery({ queryKey: key, queryFn: () => getAssembly(id), retry: false });
  const materials = useQuery({ queryKey: ["materials"], queryFn: () => listMaterials() });
  const studies = useQuery({ queryKey: ["studies"], queryFn: listStudies });
  // D-258: what the reader carried here. Materials and fixings both can be a part's material.
  const tray = useTray();
  const carried = trayMaterials(tray.data);

  const materialOptions = useMemo<ComboboxOption[]>(
    () =>
      (materials.data ?? []).map((material) => ({
        value: String(material.id),
        label: material.name,
        description: material.class_name,
        keywords: [material.class_name, material.subclass ?? ""],
      })),
    [materials.data],
  );
  const materialStudies = useMemo(
    () => (studies.data ?? []).filter((study) => study.universe === "material"),
    [studies.data],
  );

  // Every write answers the whole project: put the answer in the cache and refresh the list.
  const write = useMutation({
    mutationFn: (run: () => Promise<Assembly>) => run(),
    onSuccess: (next) => {
      client.setQueryData(key, next);
      void client.invalidateQueries({ queryKey: ASSEMBLIES_KEY, exact: true });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteAssembly(id),
    onSuccess: async () => {
      const name = project.data?.name ?? "";
      client.removeQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: ASSEMBLIES_KEY, exact: true });
      snackbar?.notify({ message: t.deleted(name) });
      router.push("/app/projetos");
    },
  });

  const [confirming, setConfirming] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<PartRole>("estrutural");

  if (project.isPending) return <SheetSkeleton label={t.loadingOne} />;
  if (project.isError) {
    const missing = (project.error as { status?: number }).status === 404;
    return missing ? (
      <ErrorState title={t.notFound} description={t.notFoundHint} />
    ) : (
      <ErrorState title={t.errorOne} error={project.error} onRetry={() => void project.refetch()} />
    );
  }

  const data = project.data;
  const units = Object.fromEntries(
    QUANTITIES.map((quantity) => [quantity, data.totals[quantity].unit]),
  ) as Record<AssemblyQuantity, string>;

  const addPart = () => {
    const name = newName.trim();
    if (!name) return;
    write.mutate(() => addAssemblyPart(id, { name, role: newRole }), {
      onSuccess: () => {
        setNewName("");
        announce(t.partAdded(name));
      },
    });
  };

  /** Removes at once, so the sums are right at once; "Desfazer" writes the same part back. */
  const removePart = (part: AssemblyPart) => {
    const again: AssemblyPartInput = {
      name: part.name,
      role: part.role,
      quantity: part.quantity,
      unit_mass: part.unit_mass,
      material_id: part.material?.id ?? null,
      study_id: part.study?.id ?? null,
      notes: part.notes,
    };
    write.mutate(() => deleteAssemblyPart(id, part.id), {
      onSuccess: () => {
        const message = t.partRemoved(part.name);
        if (!snackbar) {
          announce(message);
          return;
        }
        snackbar.notify({
          message,
          action: {
            label: ptBR.snackbar.undo,
            onAction: () =>
              write.mutate(async () => {
                const restored = await addAssemblyPart(id, again);
                const added = restored.parts[restored.parts.length - 1];
                return added ? updateAssemblyPart(id, added.id, { position: part.position }) : restored;
              }),
          },
        });
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: t.back, href: "/app/projetos" }, { label: data.name }]} />
      <PageDoc
        title={data.name}
        titleLabel={t.titleLabel}
        onTitleChange={(name) => {
          if (name.trim() && name.trim() !== data.name) write.mutate(() => updateAssembly(id, { name: name.trim() }));
        }}
        properties={
          <p className="text-support text-ink-muted">{t.progress(data.chosen_count, data.part_count)}</p>
        }
        menu={<MenuItem onSelect={() => setConfirming(true)}>{t.delete}</MenuItem>}
      >
        {write.isError ? (
          <Alert tone="danger" role="alert">
            {describeApiError(write.error, t.saveError)}
          </Alert>
        ) : null}

        <Textarea
          // Keyed by the saved text: a description normalised by the server remounts the draft.
          key={data.description ?? ""}
          label={t.descriptionLabel}
          placeholder={t.descriptionPlaceholder}
          maxLength={1000}
          rows={2}
          defaultValue={data.description ?? ""}
          onBlur={(event) => {
            const next = event.target.value.trim() || null;
            if (next !== data.description) write.mutate(() => updateAssembly(id, { description: next }));
          }}
        />

        <Section id="pecas" title={t.parts} description={t.partsHint}>
          <div className="flex flex-col gap-4">
            {carried.length > 0 && data.parts.length > 0 ? (
              // D-258: the tray's materials on the bench, to drag onto a part. The same choice
              // is in each part's menu, so dragging is never the only way.
              <div role="group" aria-label={ptBR.tray.stripTitle} className="well flex flex-col gap-2">
                <p className="text-support text-ink-muted">
                  <span className="font-semibold text-ink">{ptBR.tray.stripTitle}.</span> {ptBR.tray.stripHint}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {carried.map((item) => (
                    <li
                      key={item.id}
                      className="ds-tray-chip"
                      data-tray-carry
                      {...trayDragProps({ kind: "material", id: item.record_id!, name: item.name })}
                    >
                      {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.parts.length === 0 ? (
              <p className="text-support text-ink-muted">{t.partsEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.parts.map((part) => (
                  <PartCard
                    // Keyed by what the drafts mirror: a value the server changed remounts them.
                    key={`${part.id}:${part.name}:${part.quantity}:${part.unit_mass}`}
                    part={part}
                    units={units}
                    materialOptions={materialOptions}
                    studies={materialStudies}
                    busy={write.isPending}
                    onPatch={(patch) => write.mutate(() => updateAssemblyPart(id, part.id, patch))}
                    onRemove={() => removePart(part)}
                    carried={carried}
                    onUseCarried={(materialId, materialName) =>
                      write.mutate(() => updateAssemblyPart(id, part.id, { material_id: materialId }), {
                        onSuccess: () => announce(ptBR.tray.usedInPart(materialName, part.name)),
                      })
                    }
                  />
                ))}
              </ul>
            )}

            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                addPart();
              }}
            >
              <Input
                className="min-w-0 flex-1 basis-56"
                label={t.partName}
                placeholder={t.partNamePlaceholder}
                maxLength={120}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <Select
                className="basis-40"
                label={t.role}
                value={newRole}
                onChange={(event) => setNewRole((event.target as HTMLSelectElement).value as PartRole)}
              >
                {ROLES.map((role) => (
                  <SelectOption key={role} value={role}>
                    {t.roles[role]}
                  </SelectOption>
                ))}
              </Select>
              <Button
                type="submit"
                variant="primary"
                icon={<IconPlus />}
                loading={write.isPending}
                disabled={!newName.trim()}
              >
                {write.isPending ? t.adding : t.addPart}
              </Button>
            </form>
          </div>
        </Section>

        <Section id="soma" title={t.totals} description={data.scope_note}>
          {data.parts.length === 0 ? (
            <p className="text-support text-ink-muted">{t.totalsEmpty}</p>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              {QUANTITIES.map((quantity) => (
                <div key={quantity} className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-panel p-4">
                  <dt className="text-support text-ink-muted">{t.quantities[quantity]}</dt>
                  <dd>
                    <TotalValue total={data.totals[quantity]} quantity={quantity} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-caption text-ink-muted">{data.monetary_unit_note}</p>
        </Section>

        <Section id="ensaio" title={t.trial.title}>
          <ProjectTrial assemblyId={id} stamp={data.updated_at} hasParts={data.parts.length > 0} />
        </Section>
      </PageDoc>

      <ConfirmDialog
        open={confirming}
        title={t.deleteTitle(data.name)}
        message={t.deleteBody}
        confirmLabel={t.delete}
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
