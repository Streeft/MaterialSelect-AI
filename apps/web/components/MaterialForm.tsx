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
  Field,
  Input,
  Select,
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
      router.push(`/materiais/${savedId}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : ptBR.form.genericError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader title={ptBR.form.identification} headingLevel={2} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={ptBR.form.name} required error={errors.name?.message}>
            <Input {...register("name")} />
          </Field>

          <Field label={ptBR.form.class} required error={errors.class_id?.message}>
            <Select {...register("class_id")}>
              <option value="">{ptBR.form.selectClass}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={ptBR.form.subclass}>
            <Input {...register("subclass")} />
          </Field>

          <Field label={ptBR.form.keywords}>
            <Input {...register("keywords")} />
          </Field>

          <Field label={ptBR.form.description} className="sm:col-span-2">
            <Textarea {...register("description")} rows={2} />
          </Field>
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
                  <Field
                    label={ptBR.form.property}
                    className="sm:col-span-2"
                    error={rowErrors?.property_slug?.message}
                  >
                    <Select {...register(`values.${index}.property_slug`)}>
                      <option value="">{ptBR.form.selectProperty}</option>
                      {properties.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label={ptBR.form.kind}>
                    <Select {...register(`values.${index}.kind`)}>
                      <option value="scalar">{ptBR.form.kindScalar}</option>
                      <option value="interval">{ptBR.form.kindInterval}</option>
                      <option value="missing">{ptBR.form.kindMissing}</option>
                    </Select>
                  </Field>

                  <Field label={ptBR.form.quality}>
                    <Select {...register(`values.${index}.data_quality`)}>
                      <option value="MEDIDO">{ptBR.quality.MEDIDO}</option>
                      <option value="IMPORTADO">{ptBR.quality.IMPORTADO}</option>
                      <option value="ESTIMADO">{ptBR.quality.ESTIMADO}</option>
                    </Select>
                  </Field>
                </div>

                {/* "Ausente" is a state the author declares on purpose, so the
                    value fields disappear instead of standing there empty and
                    inviting a plausible guess (D-21). */}
                {kind !== "missing" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    {kind === "scalar" ? (
                      <Field label={ptBR.form.value} error={rowErrors?.value?.message}>
                        <Input {...register(`values.${index}.value`)} inputMode="decimal" />
                      </Field>
                    ) : (
                      <>
                        <Field label={ptBR.form.valueMin} error={rowErrors?.value_min?.message}>
                          <Input {...register(`values.${index}.value_min`)} inputMode="decimal" />
                        </Field>
                        <Field label={ptBR.form.valueMax} error={rowErrors?.value_max?.message}>
                          <Input {...register(`values.${index}.value_max`)} inputMode="decimal" />
                        </Field>
                        <Field label={ptBR.form.valueTypical}>
                          <Input
                            {...register(`values.${index}.value_typical`)}
                            inputMode="decimal"
                          />
                        </Field>
                      </>
                    )}

                    <Field label={ptBR.form.unit} error={rowErrors?.unit?.message}>
                      {unitOptions.length > 0 ? (
                        <Select {...register(`values.${index}.unit`)}>
                          <option value="">{ptBR.form.selectUnit}</option>
                          {unitOptions.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input {...register(`values.${index}.unit`)} placeholder="ex.: GPa" />
                      )}
                    </Field>
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
