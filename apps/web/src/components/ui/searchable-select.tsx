"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SearchableSelectOption = {
  disabled?: boolean;
  icon?: ReactNode;
  keywords?: string[];
  label: string;
  value: string;
};

type SearchableSelectProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  showClear?: boolean;
  value: string;
};

export function SearchableSelect({
  ariaLabel,
  className,
  disabled,
  emptyLabel = "Tidak ada pilihan.",
  onValueChange,
  options,
  placeholder,
  searchPlaceholder = "Cari...",
  showClear = false,
  value,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const filteredOptions = useMemo(() => {
    const normalizedSearch = inputValue.trim().toLowerCase();
    if (!normalizedSearch) return options;

    return options.filter((option) => {
      const haystack = [option.label, option.value, ...(option.keywords ?? [])].join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [inputValue, options]);

  useEffect(() => {
    if (!open) {
      setInputValue(selectedOption?.label ?? "");
    }
  }, [open, selectedOption]);

  function selectOption(option: SearchableSelectOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    setInputValue(option.label);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(disabled ? false : nextOpen)}>
      <PopoverTrigger asChild>
        <div className={cn("relative", disabled && "pointer-events-none opacity-60")} aria-disabled={disabled}>
          {selectedOption?.icon && (
            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#982E41]">
              {selectedOption.icon}
            </span>
          )}
          <Input
            aria-label={ariaLabel}
            aria-expanded={open}
            role="combobox"
            disabled={disabled}
            className={cn(
              "h-10 w-full border-[#b43c39]/20 bg-white pr-16 text-sm font-normal text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15",
              selectedOption?.icon && "pl-9",
              className,
            )}
            placeholder={open ? searchPlaceholder : placeholder}
            value={open ? inputValue : selectedOption?.label ?? ""}
            onChange={(event) => {
              setInputValue(event.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => {
              setInputValue(selectedOption?.label ?? "");
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
              }
              if (event.key === "Enter" && open && filteredOptions[0]) {
                event.preventDefault();
                selectOption(filteredOptions[0]);
              }
              if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1">
            {showClear && value ? (
              <button
                type="button"
                className="inline-flex size-6 items-center justify-center text-muted-foreground hover:text-[#982E41]"
                aria-label="Hapus pilihan"
                onClick={() => {
                  onValueChange("");
                  setInputValue("");
                  setOpen(false);
                }}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
            <ChevronDown className="size-4 opacity-50" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] border-[#982E41]/20 p-0" align="start" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="max-h-72 overflow-y-auto p-1">
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-sm text-[#2b1418] hover:bg-[#fff6f8] disabled:pointer-events-none disabled:opacity-50",
                  option.value === value && "bg-[#fff3d8]",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </span>
                {option.value === value && <Check className="size-4 shrink-0 text-[#982E41]" />}
              </button>
            ))
          ) : (
            <div className="px-2 py-3 text-sm text-muted-foreground">{emptyLabel}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
