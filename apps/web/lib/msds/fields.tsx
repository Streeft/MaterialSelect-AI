// @ts-nocheck
/* eslint-disable react-hooks/refs -- D-76: the
   duplicate-declaration fix below let ESLint's React Compiler rules fully
   analyze this vendored, straight-ported bundle for the first time (they
   previously aborted silently on the parse-level duplicate identifier, the
   same reason `tsc` stayed quiet — see the note above the barrel re-export
   at the bottom of this file). The 34 errors that surfaced are all inside
   demo-only components (`ContainerTransformDemo`, `ScreenTransitionDemo`,
   the Dialog/BottomSheet/Popover/Menu/SideSheet/DatePicker family's own
   internal ref usage) that read a ref's `.current` during render — patterns
   the source Artifact bundle already used before this port and that this
   task's scope is a mechanical module-wiring port of, not a behavioral
   rewrite (D-74). Disabled here, at the same file granularity `@ts-nocheck`
   already uses, rather than rewritten line by line. */
"use client";
/**
 * MSDS — fields. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { useUid } from "./runtime";

const h = React.createElement;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // Form controls — HTML/React puro, mesmo contorno edge-control (D-34)
  // e o mesmo :focus-visible do resto do sistema.
  // ---------------------------------------------------------------------
  // FieldShell — Rodada 8, item 5: prop nova "counter" (nó já pronto, de
  // Input/Textarea) para o contador de caracteres. Sem "counter", a saída é
  // idêntica a antes — o rodapé continua sendo só o <p> de hint/error, sem
  // wrapper novo no caminho (mesma disciplina do fieldIconClass, Rodada 7).
  function FieldShell(props) {
    var uid = useUid("field");
    var hintId = props.hint || props.error || props.counter ? uid + "-hint" : undefined;
    var hintNode = props.error ? h("p", { id: hintId, className: "msds-field-hint msds-field-hint-error", role: "alert" }, props.error)
      : props.hint ? h("p", { id: hintId, className: "msds-field-hint" }, props.hint) : null;
    var footer = props.counter
      ? h("div", { className: "msds-field-footer" }, hintNode, props.counter)
      : hintNode;
    return h("div", { className: "msds-field" },
      h("label", { htmlFor: uid, className: "msds-field-label" }, props.label),
      props.render(uid, hintId),
      footer
    );
  }

  // fieldCounter — "120/280", tom muda conforme se aproxima/ultrapassa o
  // limite: ink-subtle < 90% do limite, warning de 90% até o limite,
  // danger acima dele (nunca escondido — o quarto estado de dado ausente do
  // sistema é sobre valor de propriedade, não sobre isto; aqui é só
  // feedback de campo, mesma disciplina de cor-com-significado do resto).
  function fieldCounter(value, maxLength) {
    if (maxLength === undefined || maxLength === null) return null;
    var len = (value || "").length;
    var tone = "subtle";
    if (len > maxLength) tone = "danger";
    else if (len >= maxLength * 0.9) tone = "warning";
    return h("span", { className: "msds-field-counter msds-field-counter-" + tone }, len + "/" + maxLength);
  }

  // controlClass — "outlined" (default, borda inteira, sem mudar aparência
  // existente) ou "filled" (fundo tonal, sem borda, régua só embaixo).
  function controlClass(base, variant) {
    return [base, "msds-control-" + (variant || "outlined")].join(" ");
  }

  // fieldIconClass — Rodada 7, item 5: acrescenta as classes de recuo de
  // padding só quando há ícone de verdade, para o caso sem ícone continuar
  // produzindo a MESMA string de classe de antes da Rodada 7.
  function fieldIconClass(base, hasLeading, hasTrailing) {
    var cls = base;
    if (hasLeading) cls += " msds-control-has-leading";
    if (hasTrailing) cls += " msds-control-has-trailing";
    return cls;
  }

  function Input(props) {
    var variant = props.variant || "outlined";
    var hasLeading = !!props.leadingIcon;
    var hasTrailing = !!props.trailingIcon || !!props.trailingAction;
    return h(FieldShell, {
      label: props.label, hint: props.hint, error: props.error,
      counter: props.showCount ? fieldCounter(props.value, props.maxLength) : null,
      render: function (uid, hintId) {
        var input = h("input", {
          id: uid, className: fieldIconClass(controlClass("msds-control", variant), hasLeading, hasTrailing), type: props.type || "text",
          value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); },
          placeholder: props.placeholder, "aria-invalid": !!props.error || undefined,
          maxLength: props.maxLength,
          "aria-describedby": hintId, disabled: props.disabled
        });
        // Sem leadingIcon/trailingIcon/trailingAction, devolve o <input> puro —
        // a mesma árvore de antes da Rodada 7, nenhum wrapper novo no caminho.
        if (!hasLeading && !hasTrailing) return input;
        return h("div", { className: "msds-control-wrap" },
          hasLeading ? h("span", { className: "msds-control-icon msds-control-icon-leading", "aria-hidden": "true" }, msdsIcon(props.leadingIcon)) : null,
          input,
          props.trailingAction
            ? h("button", { type: "button", className: "msds-control-icon msds-control-icon-trailing msds-control-action", "aria-label": props.trailingAction.label || "Ação", onClick: props.trailingAction.onClick }, msdsIcon(props.trailingAction.icon))
            : (props.trailingIcon ? h("span", { className: "msds-control-icon msds-control-icon-trailing", "aria-hidden": "true" }, msdsIcon(props.trailingIcon)) : null)
        );
      }
    });
  }

  function NumberInput(props) {
    var variant = props.variant || "outlined";
    return h(FieldShell, {
      label: props.label, hint: props.hint, error: props.error,
      render: function (uid, hintId) {
        return h("div", { className: "msds-row", style: { gap: "6px" } },
          h("input", {
            id: uid, className: controlClass("msds-control", variant), type: "number", inputMode: "decimal",
            value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); },
            min: props.min, max: props.max, step: props.step, "aria-invalid": !!props.error || undefined,
            "aria-describedby": hintId, disabled: props.disabled, style: { maxWidth: "140px" }
          }),
          props.unit ? h("span", { className: "msds-field-unit" }, props.unit) : null
        );
      }
    });
  }

  function Textarea(props) {
    var variant = props.variant || "outlined";
    var hasLeading = !!props.leadingIcon;
    var hasTrailing = !!props.trailingIcon || !!props.trailingAction;
    return h(FieldShell, {
      label: props.label, hint: props.hint, error: props.error,
      counter: props.showCount ? fieldCounter(props.value, props.maxLength) : null,
      render: function (uid, hintId) {
        var textarea = h("textarea", {
          id: uid, className: fieldIconClass(controlClass("msds-control msds-textarea", variant), hasLeading, hasTrailing), rows: props.rows || 3,
          value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); },
          placeholder: props.placeholder, maxLength: props.maxLength, "aria-describedby": hintId, disabled: props.disabled
        });
        if (!hasLeading && !hasTrailing) return textarea;
        // Ícone ancorado ao topo (msds-control-icon-top), nunca ao centro
        // vertical — um <textarea> de várias linhas não tem um "meio" fixo
        // como o <input> de uma linha.
        return h("div", { className: "msds-control-wrap" },
          hasLeading ? h("span", { className: "msds-control-icon msds-control-icon-leading msds-control-icon-top", "aria-hidden": "true" }, msdsIcon(props.leadingIcon)) : null,
          textarea,
          props.trailingAction
            ? h("button", { type: "button", className: "msds-control-icon msds-control-icon-trailing msds-control-icon-top msds-control-action", "aria-label": props.trailingAction.label || "Ação", onClick: props.trailingAction.onClick }, msdsIcon(props.trailingAction.icon))
            : (props.trailingIcon ? h("span", { className: "msds-control-icon msds-control-icon-trailing msds-control-icon-top", "aria-hidden": "true" }, msdsIcon(props.trailingIcon)) : null)
        );
      }
    });
  }

  function Select(props) {
    var variant = props.variant || "outlined";
    var hasLeading = !!props.leadingIcon;
    var hasTrailingAction = !!props.trailingIcon || !!props.trailingAction;
    return h(FieldShell, {
      label: props.label, hint: props.hint, error: props.error,
      render: function (uid, hintId) {
        var selectCls = controlClass("msds-control msds-select", variant);
        if (hasLeading) selectCls += " msds-control-has-leading";
        if (hasTrailingAction) selectCls += " msds-control-has-trailing-action";
        return h("div", { className: hasLeading ? "msds-select-wrap msds-select-wrap-has-leading" : "msds-select-wrap" },
          hasLeading ? h("span", { className: "msds-control-icon msds-control-icon-leading", "aria-hidden": "true" }, msdsIcon(props.leadingIcon)) : null,
          h("select", {
            id: uid, className: selectCls,
            value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); },
            "aria-describedby": hintId, disabled: props.disabled
          }, (props.options || []).map(function (o) { return h("option", { key: o.value, value: o.value }, o.label); })),
          props.trailingAction
            ? h("button", { type: "button", className: "msds-control-icon msds-control-action msds-select-trailing-action", "aria-label": props.trailingAction.label || "Ação", onClick: props.trailingAction.onClick }, msdsIcon(props.trailingAction.icon))
            : (props.trailingIcon ? h("span", { className: "msds-control-icon msds-select-trailing-icon", "aria-hidden": "true" }, msdsIcon(props.trailingIcon)) : null),
          h("span", { className: "msds-select-chevron", "aria-hidden": "true" }, msdsIcon("chevronDown"))
        );
      }
    });
  }

  function Checkbox(props) {
    var uid = useUid("check");
    var indeterminate = !!props.indeterminate;
    // "indeterminate" não é um atributo HTML de verdade — só existe como
    // propriedade DOM, então tem de ser imposta a cada render via ref, nunca
    // via prop JSX (React não a passa ao elemento nativo).
    var inputRef = React.useRef(null);
    useEffect(function () {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);
    return h("label", { className: "msds-checkbox", htmlFor: uid },
      h("input", {
        id: uid, ref: inputRef, type: "checkbox", checked: !!props.checked,
        "aria-checked": indeterminate ? "mixed" : !!props.checked,
        onChange: function (e) { props.onChange && props.onChange(e.target.checked); }, disabled: props.disabled
      }),
      h("span", { className: "msds-checkbox-box", "data-indeterminate": indeterminate ? "true" : "false", "aria-hidden": "true" }, msdsIcon(indeterminate ? "minus" : "check")),
      h("span", { className: "msds-checkbox-label" }, props.label)
    );
  }

  function RadioGroup(props) {
    var name = useUid("radio");
    return h("div", { role: "radiogroup", "aria-label": props.label, className: "msds-col", style: { gap: "6px" } },
      props.label ? h("div", { className: "msds-field-label" }, props.label) : null,
      (props.options || []).map(function (o) {
        var checked = o.value === props.value;
        return h("label", { key: o.value, className: "msds-radio" },
          h("input", { type: "radio", name: name, checked: checked, onChange: function () { props.onChange && props.onChange(o.value); } }),
          h("span", { className: "msds-radio-dot", "aria-hidden": "true" }),
          h("span", null, o.label)
        );
      })
    );
  }

export { Checkbox, FieldShell, Input, NumberInput, RadioGroup, Select, Textarea, controlClass, fieldCounter, fieldIconClass };
