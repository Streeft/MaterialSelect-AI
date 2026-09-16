"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { MaterialClass, MaterialDetail, PropertyDefinition } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { ApiError, createMaterial, replaceMaterialValues, updateMaterial } from "@/lib/api";
import {
  emptyValueRow,
  formSchema,
  initialValuesFromDetail,
  parseKeywords,
  toApiValues,
  type FormValues,
} from "@/lib/materialForm";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectOption,
  Textarea,
} from "@/components/ui";

interface MaterialFormProps {
  classes: MaterialClass[];
  properties: PropertyDefinition[];
  initial?: MaterialDetail;
}

export function MaterialForm({ classes, properties, initial }: MaterialFormProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial
      ? {
          name: initial.name,
          class_id: String(initial.class_id),
          subclass: initial.subclass ?? "",
          description: initial.description ?? "",
          keywords: initial.keywords.join(", "),
          values: initialValuesFromDetail(initial),
        }
      : {
          name: "",
          class_id: "",
          subclass: "",
          description: "",
          keywords: "",
          values: [],
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "values" });
  const watchedValues = watch("values");

  async function onSubmit(data: FormValues) {
    setSubmitError(null);
    const apiValues = toApiValues(data.values);
    try {
      let savedId: number;
      if (initial) {
        await updateMaterial(initial.id, {
          name: data.name,
          class_id: Number(data.class_id),
          subclass: data.subclass || null,
          description: data.description || null,
          keywords: parseKeywords(data.keywords),
        });
        const fresh = await replaceMaterialValues(initial.id, apiValues);
        // Seed the detail cache with the fresh server response so the detail
        // page shows the saved data immediately (staleTime would otherwise
        // serve the pre-edit snapshot for up to 30s).
        qc.setQueryData(["material", initial.id], fresh);
        savedId = initial.id;
      } else {
        const created = await createMaterial({
          name: data.name,
          class_id: Number(data.class_id),
          subclass: data.subclass || null,
          description: data.description || null,
          keywords: parseKeywords(data.keywords),
          is_demo: false,
          values: apiValues,
        });
        qc.setQueryData(["material", created.id], created);
        savedId = created.id;
      }
      // Catalogue list and chart depend on this material's data.
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["chart"] });
      router.push(`/app/materiais/${savedId}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : ptBR.form.genericError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader title={ptBR.form.identification} headingLevel={2} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input
            label={ptBR.form.name}
            required
            error={errors.name?.message}
            {...register("name")}
          />

          <Select
            label={ptBR.form.class}
            required
            error={errors.class_id?.message}
            {...register("class_id")}
          >
            <SelectOption value="">{ptBR.form.selectClass}</SelectOption>
            {classes.map((c) => (
              <SelectOption key={c.id} value={String(c.id)}>
                {c.name}
              </SelectOption>
            ))}
          </Select>

          <Input label={ptBR.form.subclass} {...register("subclass")} />

          <Input label={ptBR.form.keywords} {...register("keywords")} />

          <Textarea
            label={ptBR.form.description}
            className="sm:col-span-2"
            rows={2}
            {...register("description")}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={ptBR.form.values}
          headingLevel={2}
          actions={
            <Button size="sm" variant="primary" onClick={() => append(emptyValueRow())}>
              {ptBR.form.addValue}
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {fields.length === 0 && <p className="text-sm text-ink-muted">{ptBR.form.noValues}</p>}

          {fields.map((field, index) => {
            const kind = watchedValues?.[index]?.kind ?? "scalar";
            const slug = watchedValues?.[index]?.property_slug ?? "";
            const selectedProp = properties.find((p) => p.slug === slug);
            const unitOptions = selectedProp?.accepted_units ?? [];
            const rowErrors = errors.values?.[index];
            // The row number is part of the remove button's accessible name.
            // Without it a screen reader hears "Remover" N times with nothing
            // to tell the buttons apart.
            const position = `${ptBR.form.property} ${index + 1}`;

            return (
              <div key={field.id} className="rounded-control border border-edge p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Select
                    label={ptBR.form.property}
                    className="sm:col-span-2"
                    error={rowErrors?.property_slug?.message}
                    {...register(`values.${index}.property_slug`)}
                  >
                    <SelectOption value="">{ptBR.form.selectProperty}</SelectOption>
                    {properties.map((p) => (
                      <SelectOption key={p.slug} value={p.slug}>
                        {p.name}
                      </SelectOption>
                    ))}
                  </Select>

                  <Select label={ptBR.form.kind} {...register(`values.${index}.kind`)}>
                    <SelectOption value="scalar">{ptBR.form.kindScalar}</SelectOption>
                    <SelectOption value="interval">{ptBR.form.kindInterval}</SelectOption>
                    <SelectOption value="missing">{ptBR.form.kindMissing}</SelectOption>
                  </Select>

                  <Select label={ptBR.form.quality} {...register(`values.${index}.data_quality`)}>
                    <SelectOption value="MEDIDO">{ptBR.quality.MEDIDO}</SelectOption>
                    <SelectOption value="IMPORTADO">{ptBR.quality.IMPORTADO}</SelectOption>
                    <SelectOption value="ESTIMADO">{ptBR.quality.ESTIMADO}</SelectOption>
                  </Select>
                </div>

                {/* "Ausente" is a state the author declares on purpose, so the
                    value fields disappear instead of standing there empty and
                    inviting a plausible guess (D-21). */}
                {kind !== "missing" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    {kind === "scalar" ? (
                      <Input
                        label={ptBR.form.value}
                        error={rowErrors?.value?.message}
                        inputMode="decimal"
                        {...register(`values.${index}.value`)}
                      />
                    ) : (
                      <>
                        <Input
                          label={ptBR.form.valueMin}
                          error={rowErrors?.value_min?.message}
                          inputMode="decimal"
                          {...register(`values.${index}.value_min`)}
                        />
                        <Input
                          label={ptBR.form.valueMax}
                          error={rowErrors?.value_max?.message}
                          inputMode="decimal"
                          {...register(`values.${index}.value_max`)}
                        />
                        <Input
                          label={ptBR.form.valueTypical}
                          inputMode="decimal"
                          {...register(`values.${index}.value_typical`)}
                        />
                      </>
                    )}

                    {unitOptions.length > 0 ? (
                      <Select
                        label={ptBR.form.unit}
                        error={rowErrors?.unit?.message}
                        {...register(`values.${index}.unit`)}
                      >
                        <SelectOption value="">{ptBR.form.selectUnit}</SelectOption>
                        {unitOptions.map((u) => (
                          <SelectOption key={u} value={u}>
                            {u}
                          </SelectOption>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        label={ptBR.form.unit}
                        error={rowErrors?.unit?.message}
                        placeholder="ex.: GPa"
                        {...register(`values.${index}.unit`)}
                      />
                    )}
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-2xs text-ink-subtle">{position}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(index)}
                    aria-label={`${ptBR.actions.remove}: ${position}`}
                  >
                    {ptBR.actions.remove}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {submitError && (
        <Alert tone="danger" role="alert">
          {submitError}
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {isSubmitting ? ptBR.actions.saving : ptBR.actions.save}
        </Button>
        <Button variant="secondary" onClick={() => router.back()}>
          {ptBR.actions.cancel}
        </Button>
      </div>
    </form>
  );
}
