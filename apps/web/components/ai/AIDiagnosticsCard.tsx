"use client";

import { useEffect, useState } from "react";
import { getAIStatus, runAIDiagnostico } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import type { AIDiagnostico, AIDiagnosticCheck, AIStatus } from "@/lib/types";
import { Alert, Badge, Button, type BadgeTone } from "@/components/ui";

const t = ptBR.aiDiagnostics;

const CHECK_TONE: Record<AIDiagnosticCheck["status"], BadgeTone> = {
  ok: "success",
  erro: "danger",
  nao_configurado: "neutral",
};

type StatusState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; status: AIStatus };

/**
 * "Diagnóstico da IA" (D-228): what this server has configured — model, host
 * (never the key) and the four capabilities — and a button that tries each
 * one live. The result arrives per capability, in the server's PT-BR, with the
 * latency; a 429 from Google reads as the free-quota notice.
 *
 * Plain state instead of a query cache on purpose: it lives on the Aparência
 * page, which is rendered outside the data provider in its own tests, and the
 * status is read once.
 */
export function AIDiagnosticsCard() {
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [result, setResult] = useState<AIDiagnostico | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAIStatus().then(
      (data) => alive && setStatus({ kind: "ready", status: data }),
      (error: unknown) =>
        alive && setStatus({ kind: "error", message: describeApiError(error, t.statusError) }),
    );
    return () => {
      alive = false;
    };
  }, []);

  async function run() {
    setRunning(true);
    setRunError(null);
    try {
      setResult(await runAIDiagnostico());
    } catch (error) {
      setRunError(describeApiError(error, t.runError));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {status.kind === "loading" ? (
        <p className="text-support text-ink-muted" role="status">
          {t.statusLoading}
        </p>
      ) : status.kind === "error" ? (
        <Alert tone="warning">{status.message}</Alert>
      ) : (
        <StatusSummary status={status.status} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={running} onClick={run}>
          {running ? t.running : t.run}
        </Button>
        {result ? (
          <span className="text-support text-ink-muted">{t.remaining(result.remaining)}</span>
        ) : null}
      </div>

      {runError ? (
        <p role="alert" className="text-caption text-danger-fg">
          {runError}
        </p>
      ) : null}

      {result ? (
        <section aria-label={t.resultTitle} className="flex flex-col gap-2">
          <h3 className="text-support font-semibold text-ink">{t.resultTitle}</h3>
          <p className="text-support text-ink-muted" role="status">
            {result.ok ? t.allOk : t.someFailed}
          </p>
          <ul className="flex flex-col gap-2">
            {result.checks.map((check) => (
              <li key={check.key} className="flex flex-col gap-1 rounded-card border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-support font-semibold text-ink">{check.label}</span>
                  <Badge tone={CHECK_TONE[check.status]}>{t.statusLabel[check.status]}</Badge>
                  {check.latency_ms !== null ? (
                    <span className="text-caption text-ink-subtle">{t.latency(check.latency_ms)}</span>
                  ) : null}
                </div>
                <p className="text-caption text-ink-muted">{check.message}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StatusSummary({ status }: { status: AIStatus }) {
  if (!status.enabled) {
    return <p className="text-support text-ink-muted">{status.disclaimer || t.off}</p>;
  }
  const line = status.simulated
    ? t.simulated
    : t.providerLine(status.provider, status.model ?? "", status.host ?? "");
  return (
    <div className="flex flex-col gap-2">
      <p className="text-support text-ink">{line}</p>
      {status.capabilities && status.capabilities.length > 0 ? (
        <ul aria-label={t.configuredTitle} className="flex flex-col gap-1">
          {status.capabilities.map((capability) => (
            <li key={capability.key} className="flex flex-wrap items-baseline gap-2">
              <Badge tone={capability.configured ? "success" : "neutral"}>
                {capability.configured ? t.configured : t.notConfigured}
              </Badge>
              <span className="text-caption font-medium text-ink">{capability.label}</span>
              <span className="text-caption text-ink-muted">{capability.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
