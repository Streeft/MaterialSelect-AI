import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountAppearance } from "./api";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  adoptAppearance,
  readAppearance,
  sameAppearance,
  setAppearance,
  setAppearanceChangeHandler,
} from "./appearance";
import {
  resetSyncStateForTests,
  startAppearanceSync,
  subscribeSyncState,
  syncState,
} from "./appearanceSync";

const root = document.documentElement;
const stored = (): Record<string, string> =>
  JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}");

const account = (over: Partial<AccountAppearance> = {}): AccountAppearance => ({
  color: "violeta",
  contrast: "high",
  motion: "reduced",
  rail: "light",
  saved: true,
  updated_at: "2026-11-19T10:00:00Z",
  ...over,
});

/** Lets the promise chain of `startAppearanceSync` settle. */
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

let stop: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetSyncStateForTests();
});

afterEach(() => {
  stop();
  stop = () => undefined;
  setAppearanceChangeHandler(null);
  vi.useRealTimers();
  window.localStorage.clear();
  for (const key of ["contrast", "motion", "section", "rail"]) delete root.dataset[key];
  setAppearance({ ...DEFAULT_APPEARANCE });
  window.localStorage.clear();
});

describe("appearance on the account (D-249)", () => {
  it("wears the account's choice on a device that has none, and keeps it for the next paint", async () => {
    const get = vi.fn().mockResolvedValue(account());
    const put = vi.fn();
    stop = startAppearanceSync({ get, put, debounceMs: 10 });
    await settle();

    expect(readAppearance()).toEqual({ color: "violeta", contrast: "high", motion: "reduced", rail: "light" });
    expect(root.dataset.contrast).toBe("high");
    expect(root.dataset.motion).toBe("reduced");
    expect(root.dataset.rail).toBe("light");
    // The head script reads this on the next load: no flash.
    expect(stored()).toMatchObject({ color: "violeta", contrast: "high" });
    expect(put).not.toHaveBeenCalled();
    expect(syncState()).toBe("saved");
  });

  it("the account wins over a different local choice", async () => {
    setAppearance({ color: "rosa", contrast: "medium" });
    stop = startAppearanceSync({ get: vi.fn().mockResolvedValue(account()), put: vi.fn(), debounceMs: 10 });
    await settle();
    expect(readAppearance().color).toBe("violeta");
    expect(readAppearance().contrast).toBe("high");
  });

  it("offers a choice made before the account kept one, once", async () => {
    setAppearance({ color: "verde", motion: "reduced" });
    const put = vi.fn().mockResolvedValue({});
    const get = vi.fn().mockResolvedValue(account({ saved: false, color: "route", contrast: "standard", motion: "standard", rail: "dark" }));
    stop = startAppearanceSync({ get, put, debounceMs: 10 });
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith({ color: "verde", contrast: "standard", motion: "reduced", rail: "dark" });
    // This device keeps what it chose: the account's empty defaults did not overwrite it.
    expect(readAppearance().color).toBe("verde");
    expect(syncState()).toBe("saved");
  });

  it("sends nothing when neither side has a choice", async () => {
    const put = vi.fn();
    stop = startAppearanceSync({ get: vi.fn().mockResolvedValue(account({ saved: false })), put, debounceMs: 10 });
    await settle();
    expect(put).not.toHaveBeenCalled();
    expect(sameAppearance(readAppearance(), DEFAULT_APPEARANCE)).toBe(true);
    expect(syncState()).toBe("idle");
  });

  it("a burst of changes is one write, with the latest choice, after the pause", async () => {
    const put = vi.fn().mockResolvedValue({});
    stop = startAppearanceSync({ get: vi.fn().mockResolvedValue(account({ saved: false })), put, debounceMs: 400 });
    await settle();

    setAppearance({ contrast: "medium" });
    setAppearance({ contrast: "high" });
    setAppearance({ color: "rosa" });
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(399);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith({ color: "rosa", contrast: "high", motion: "standard", rail: "dark" });
    await settle();
    expect(syncState()).toBe("saved");
  });

  it("says 'saving' while a write is out", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const put = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    stop = startAppearanceSync({ get: vi.fn().mockResolvedValue(account({ saved: false })), put, debounceMs: 10 });
    await settle();
    const seen: string[] = [];
    const unsubscribe = subscribeSyncState(() => seen.push(syncState()));
    setAppearance({ rail: "light" });
    await vi.advanceTimersByTimeAsync(11);
    expect(syncState()).toBe("saving");
    finish({});
    await settle();
    expect(syncState()).toBe("saved");
    expect(seen).toEqual(["saving", "saved"]);
    unsubscribe();
  });

  it("falls back to this device, and says so, when the account cannot be read", async () => {
    setAppearance({ color: "terracota" });
    stop = startAppearanceSync({ get: vi.fn().mockRejectedValue(new Error("offline")), put: vi.fn(), debounceMs: 10 });
    await settle();
    expect(syncState()).toBe("local");
    expect(readAppearance().color).toBe("terracota");
  });

  it("keeps the choice on the device, and says so, when a write fails; the next change tries again", async () => {
    const put = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({});
    stop = startAppearanceSync({ get: vi.fn().mockResolvedValue(account({ saved: false })), put, debounceMs: 10 });
    await settle();
    setAppearance({ contrast: "high" });
    await vi.advanceTimersByTimeAsync(11);
    await settle();
    expect(syncState()).toBe("local");
    expect(readAppearance().contrast).toBe("high");

    setAppearance({ contrast: "medium" });
    await vi.advanceTimersByTimeAsync(11);
    await settle();
    expect(put).toHaveBeenCalledTimes(2);
    expect(syncState()).toBe("saved");
  });

  it("a change made while the account's answer was in flight is not overwritten by it", async () => {
    let answer: (value: AccountAppearance) => void = () => undefined;
    const get = vi.fn(() => new Promise<AccountAppearance>((resolve) => (answer = resolve)));
    const put = vi.fn().mockResolvedValue({});
    stop = startAppearanceSync({ get, put, debounceMs: 10 });
    setAppearance({ color: "rosa" });
    answer(account());
    await settle();
    expect(readAppearance().color).toBe("rosa");
    await vi.advanceTimersByTimeAsync(11);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ color: "rosa" }));
  });

  it("adopting what came from the account does not send it back", async () => {
    const put = vi.fn();
    stop = startAppearanceSync({ get: vi.fn().mockResolvedValue(account({ saved: false })), put, debounceMs: 10 });
    await settle();
    adoptAppearance({ color: "azul", contrast: "medium", motion: "standard", rail: "dark" });
    await vi.advanceTimersByTimeAsync(50);
    expect(put).not.toHaveBeenCalled();
  });

  it("an unknown value from the account falls back to the default, like a stored one", () => {
    adoptAppearance({ color: "magenta", contrast: "extreme", motion: "reduced", rail: "dark" });
    expect(readAppearance()).toEqual({ ...DEFAULT_APPEARANCE, motion: "reduced" });
  });

  it("stopping the sync stops the writes", async () => {
    const put = vi.fn().mockResolvedValue({});
    const stopSync = startAppearanceSync({ get: vi.fn().mockResolvedValue(account({ saved: false })), put, debounceMs: 10 });
    await settle();
    stopSync();
    setAppearance({ contrast: "high" });
    await vi.advanceTimersByTimeAsync(50);
    expect(put).not.toHaveBeenCalled();
  });
});
