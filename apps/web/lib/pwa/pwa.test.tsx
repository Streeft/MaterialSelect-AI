import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import manifest from "@/app/manifest";
import { RegisterServiceWorker } from "@/components/layout/RegisterServiceWorker";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("manifest (D-142)", () => {
  const m = manifest();

  it("opens the tool itself, standalone, in Portuguese", () => {
    expect(m.start_url).toBe("/app");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("pt-BR");
    expect(m.name).toBe("MaterialSelect AI");
  });

  it("has the icons an installable app needs, each one a real file", () => {
    const sizes = (m.icons ?? []).map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons ?? []) expect(existsSync(resolve(root, "public", icon.src.slice(1)))).toBe(true);
  });
});

describe("offline page (D-142)", () => {
  const html = read("public/offline.html");

  it("says what is missing and never shows material data", () => {
    expect(html).toContain("Sem conexão");
    expect(html).toContain("nunca é mostrada sem a fonte");
  });

  it("is self-contained: no external script, stylesheet or font", () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });
});

/** Run public/sw.js against a fake worker scope and collect what it registers. */
function loadWorker(cacheOf: Record<string, Map<string, unknown>> = {}) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const opened: string[] = [];
  const deleted: string[] = [];
  const added: string[] = [];
  const caches = {
    open: async (name: string) => {
      opened.push(name);
      return {
        add: async (url: string) => void added.push(url),
        match: async (url: string) => cacheOf[name]?.get(url),
      };
    },
    keys: async () => ["msai-offline-v0", "msai-offline-v1", "other-app"],
    delete: async (name: string) => void deleted.push(name),
  };
  const skipWaiting = vi.fn();
  const claim = vi.fn(async () => {});
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => void (listeners[type] = fn),
    skipWaiting,
    clients: { claim },
  };
  const Response = { error: () => "network-error" };
  let fetchImpl: (r: unknown) => Promise<unknown> = async () => "network";
  runInNewContext(read("public/sw.js"), { self, caches, Response, fetch: (r: unknown) => fetchImpl(r) });
  return { listeners, opened, deleted, added, skipWaiting, claim, setFetch: (f: typeof fetchImpl) => (fetchImpl = f) };
}

describe("service worker (D-142)", () => {
  it("caches the offline page on install and nothing else", async () => {
    const w = loadWorker();
    let waited: Promise<unknown> = Promise.resolve();
    w.listeners.install!({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
    expect(w.added).toEqual(["/offline.html"]);
    expect(w.skipWaiting).toHaveBeenCalled();
  });

  it("removes only its own older caches on activate", async () => {
    const w = loadWorker();
    let waited: Promise<unknown> = Promise.resolve();
    w.listeners.activate!({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
    expect(w.deleted).toEqual(["msai-offline-v0", "other-app"]);
    expect(w.claim).toHaveBeenCalled();
  });

  it("does not touch a request that is not a navigation (API, data, assets)", () => {
    const w = loadWorker();
    const respondWith = vi.fn();
    w.listeners.fetch!({ request: { mode: "cors", url: "/api/materials" }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("passes a navigation through when the network answers", async () => {
    const w = loadWorker();
    w.setFetch(async () => "the-page");
    let answered: Promise<unknown> = Promise.resolve();
    w.listeners.fetch!({ request: { mode: "navigate" }, respondWith: (p: Promise<unknown>) => (answered = p) });
    expect(await answered).toBe("the-page");
  });

  it("answers a failed navigation with the offline page", async () => {
    const w = loadWorker({ "msai-offline-v1": new Map([["/offline.html", "offline-page"]]) });
    w.setFetch(async () => {
      throw new TypeError("offline");
    });
    let answered: Promise<unknown> = Promise.resolve();
    w.listeners.fetch!({ request: { mode: "navigate" }, respondWith: (p: Promise<unknown>) => (answered = p) });
    expect(await answered).toBe("offline-page");
  });

  it("never stores a response: the only cache write is the offline page", () => {
    const sw = read("public/sw.js");
    expect(sw).not.toMatch(/cache\.put|\.addAll|cache\.add\((?!OFFLINE_URL)/);
  });
});

describe("RegisterServiceWorker (D-142)", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubWorker() {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    return register;
  }

  it("registers /sw.js in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = stubWorker();
    render(<RegisterServiceWorker />);
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing in development, where it would sit in front of hot reload", () => {
    vi.stubEnv("NODE_ENV", "development");
    const register = stubWorker();
    render(<RegisterServiceWorker />);
    expect(register).not.toHaveBeenCalled();
  });

  it("swallows a failed registration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn().mockRejectedValue(new Error("blocked"));
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    expect(() => render(<RegisterServiceWorker />)).not.toThrow();
    await Promise.resolve();
  });
});
