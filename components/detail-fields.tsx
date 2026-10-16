"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DETAIL_FIELDS, DETAIL_FIELD_GROUPS } from "@/lib/bead-fields";
import { useDetailFields } from "@/hooks/use-detail-fields";

/** Drawer-header menu for toggling fields without leaving the bead. */
export function DetailFieldsMenu() {
  const { visible, setVisible, reset, customized } = useDetailFields();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Choose which fields to show"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus:outline-none"
      >
        <Icon name="settings" size={15} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-[220px] overflow-y-auto">
        {DETAIL_FIELD_GROUPS.map((g, i) => (
          <DropdownMenuGroup key={g.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
            {DETAIL_FIELDS.filter((f) => f.group === g.id).map((f) => (
              <DropdownMenuCheckboxItem
                key={f.key}
                checked={visible[f.key]}
                onCheckedChange={(on) => setVisible(f.key, on)}
                closeOnClick={false}
              >
                {f.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        ))}
        {customized && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={reset}>Reset to defaults</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Settings-page body: every field as a checkbox, grouped like the menu. */
export function DetailFieldsSetting() {
  const { visible, setVisible, reset, customized } = useDetailFields();
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="text-[11.5px] text-[var(--text-3)]">
        Choose what the bead detail drawer shows. Title, ID, type and origin always show; empty
        text sections stay hidden either way. Per-device — stored in this browser.
      </div>
      {DETAIL_FIELD_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="mb-[7px] text-[11px] font-[550] uppercase tracking-[.03em] text-[var(--text-3)]">
            {g.label}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-[7px] sm:grid-cols-3">
            {DETAIL_FIELDS.filter((f) => f.group === g.id).map((f) => (
              <label key={f.key} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={visible[f.key]}
                  onChange={(e) => setVisible(f.key, e.target.checked)}
                  className="h-[14px] w-[14px] cursor-pointer accent-[var(--brand)]"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          disabled={!customized}
          onClick={reset}
          className="h-8 rounded-lg border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
