"use client";
import * as React from "react";
import {
  type DetailFieldKey,
  type DetailFieldOverrides,
  parseDetailFieldOverrides,
  resolveDetailFields,
} from "@/lib/bead-fields";

const PREFS_KEY = "bmus.detailFields";
const EVENT = "bmus.detailFields.changed";

function snapshot() {
  try { return globalThis.localStorage?.getItem(PREFS_KEY) || ""; } catch { return ""; }
}
function parse(raw: string): DetailFieldOverrides {
  try { return parseDetailFieldOverrides(JSON.parse(raw || "{}")); } catch { return {}; }
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback); window.addEventListener("storage", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}
let sessionValue: string | undefined;
function clientSnapshot() { return sessionValue ?? snapshot(); }
function serverSnapshot() { return ""; }

/**
 * Which fields the bead detail drawer shows. Global per browser (not per
 * project), shared between the drawer's Fields menu and Settings so a toggle
 * in one is reflected in the other immediately.
 */
export function useDetailFields() {
  const raw = React.useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const overrides = React.useMemo(() => parse(raw), [raw]);
  const visible = React.useMemo(() => resolveDetailFields(overrides), [overrides]);
  const write = React.useCallback((next: DetailFieldOverrides) => {
    const value = JSON.stringify(next);
    try { localStorage.setItem(PREFS_KEY, value); sessionValue = undefined; }
    catch { sessionValue = value; }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const setVisible = React.useCallback(
    (key: DetailFieldKey, on: boolean) => write(parseDetailFieldOverrides({ ...overrides, [key]: on })),
    [overrides, write],
  );
  const reset = React.useCallback(() => write({}), [write]);
  return { visible, setVisible, reset, customized: Object.keys(overrides).length > 0 };
}
