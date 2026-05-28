"use client";

import { Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
  value,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between border-[#b43c39]/20 bg-white px-3 text-left text-sm font-normal text-[#2b1418] hover:bg-[#fff6f8] hover:text-[#2b1418]",
            className,
          )}
        >
          <span className={cn("flex min-w-0 items-center gap-2 truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption?.icon}
            <span className="truncate">{selectedOption?.label ?? placeholder}</span>
          </span>
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] border-[#982E41]/20 p-0" align="start">
        <Command
          filter={(itemValue, search, keywords) => {
            const normalizedSearch = search.trim().toLowerCase();
            if (!normalizedSearch) return 1;
            const haystack = [itemValue, ...(keywords ?? [])].join(" ").toLowerCase();
            return haystack.includes(normalizedSearch) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  keywords={option.keywords}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className="justify-between"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {option.value === value && <Check className="size-4 text-[#982E41]" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
