"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { MaterialClass, MaterialDetail, PropertyDefinition } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  ApiError,
  createMaterial,
  replaceMaterialValues,
  updateMaterial,
} from "@/lib/api";
import {
  emptyValueRow,
  formSchema,
  initialValuesFromDetail,
  parseKeywords,
  toApiValues,
  type FormValues,
} from "@/lib/materialForm";

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
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{ptBR.form.name}</span>
          <input {...register("name")} className="rounded border border-slate-300 px-3 py-2" />
          {errors.name && <span className="text-xs text-red-600">{errors.name.message}</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{ptBR.form.class}</span>
          <select {...register("class_id")} className="rounded border border-slate-300 px-3 py-2">
            <option value="">{ptBR.form.selectClass}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.class_id && (
            <span className="text-xs text-red-600">{errors.class_id.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{ptBR.form.subclass}</span>
          <input {...register("subclass")} className="rounded border border-slate-300 px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{ptBR.form.keywords}</span>
          <input {...register("keywords")} className="rounded border border-slate-300 px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">{ptBR.form.description}</span>
          <textarea
            {...register("description")}
            rows={2}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{ptBR.form.values}</h2>
          <button
            type="button"
            onClick={() => append(emptyValueRow())}
            className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            + {ptBR.form.addValue}
          </button>
        </div>

        {fields.length === 0 && (
          <p className="text-sm text-slate-500">{ptBR.form.noValues}</p>
        )}

        <div className="space-y-3">
          {fields.map((field, index) => {
            const kind = watchedValues?.[index]?.kind ?? "scalar";
            const slug = watchedValues?.[index]?.property_slug ?? "";
            const selectedProp = properties.find((p) => p.slug === slug);
            const unitOptions = selectedProp?.accepted_units ?? [];
            const rowErrors = errors.values?.[index];

            return (
              <div key={field.id} className="rounded border border-slate-200 p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                    <span className="text-slate-500">{ptBR.form.property}</span>
                    <select
                      {...register(`values.${index}.property_slug`)}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {properties.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {rowErrors?.property_slug && (
                      <span className="text-red-600">{rowErrors.property_slug.message}</span>
                    )}
                  </label>

                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-500">{ptBR.form.kind}</span>
                    <select
                      {...register(`values.${index}.kind`)}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="scalar">{ptBR.form.kindScalar}</option>
                      <option value="interval">{ptBR.form.kindInterval}</option>
                      <option value="missing">{ptBR.form.kindMissing}</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-500">{ptBR.form.quality}</span>
                    <select
                      {...register(`values.${index}.data_quality`)}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="MEDIDO">{ptBR.quality.MEDIDO}</option>
                      <option value="IMPORTADO">{ptBR.quality.IMPORTADO}</option>
                      <option value="ESTIMADO">{ptBR.quality.ESTIMADO}</option>
                    </select>
                  </label>
                </div>

                {kind !== "missing" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    {kind === "scalar" ? (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-slate-500">{ptBR.form.value}</span>
                        <input
                          {...register(`values.${index}.value`)}
                          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        {rowErrors?.value && (
                          <span className="text-red-600">{rowErrors.value.message}</span>
                        )}
                      </label>
                    ) : (
                      <>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-slate-500">{ptBR.form.valueMin}</span>
                          <input
                            {...register(`values.${index}.value_min`)}
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                          />
                          {rowErrors?.value_min && (
                            <span className="text-red-600">{rowErrors.value_min.message}</span>
                          )}
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-slate-500">{ptBR.form.valueMax}</span>
                          <input
                            {...register(`values.${index}.value_max`)}
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                          />
                          {rowErrors?.value_max && (
                            <span className="text-red-600">{rowErrors.value_max.message}</span>
                          )}
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-slate-500">{ptBR.form.valueTypical}</span>
                          <input
                            {...register(`values.${index}.value_typical`)}
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                      </>
                    )}

                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-slate-500">{ptBR.form.unit}</span>
                      {unitOptions.length > 0 ? (
                        <select
                          {...register(`values.${index}.unit`)}
                          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">—</option>
                          {unitOptions.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...register(`values.${index}.unit`)}
                          placeholder="ex.: GPa"
                          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      )}
                      {rowErrors?.unit && (
                        <span className="text-red-600">{rowErrors.unit.message}</span>
                      )}
                    </label>
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400">#{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {ptBR.actions.remove}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {submitError && (
        <p className="rounded bg-red-50 px-4 py-2 text-sm text-red-700">{submitError}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {isSubmitting ? ptBR.actions.saving : ptBR.actions.save}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          {ptBR.actions.cancel}
        </button>
      </div>
    </form>
  );
}
