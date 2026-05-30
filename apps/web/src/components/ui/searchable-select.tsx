"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
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

  function selectOption(option: SearchableSelectOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    setInputValue("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(disabled ? false : nextOpen);
        if (!nextOpen) setInputValue("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between border-[#b43c39]/20 bg-white px-3 text-sm font-normal text-[#2b1418] hover:bg-[#fff6f8] hover:text-[#2b1418] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate text-left">
          {selectedOption?.icon && (
            <span className="shrink-0 text-[#982E41]">
              {selectedOption.icon}
            </span>
          )}
            <span className={cn("truncate", !selectedOption && "text-[#A16A75]")}>
              {selectedOption?.label ?? placeholder}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {showClear && value ? (
              <span
                role="button"
                tabIndex={0}
                className="inline-flex size-6 items-center justify-center text-muted-foreground hover:text-[#982E41]"
                aria-label="Hapus pilihan"
                onClick={(event) => {
                  event.stopPropagation();
                  onValueChange("");
                  setInputValue("");
                  setOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onValueChange("");
                  setInputValue("");
                  setOpen(false);
                }}
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            <ChevronDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] border-[#982E41]/20 p-0" align="start" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="border-b border-[#982E41]/15 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#982E41]/60" />
            <Input
              autoFocus
              className="h-9 border-[#b43c39]/20 bg-white pl-9 text-sm text-[#2b1418] placeholder:text-[#A16A75] focus-visible:border-[#B43C39] focus-visible:ring-[#B43C39]/15"
              placeholder={searchPlaceholder}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filteredOptions[0]) {
                  event.preventDefault();
                  selectOption(filteredOptions[0]);
                }
                if (event.key === "Escape") setOpen(false);
              }}
            />
          </div>
        </div>
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
