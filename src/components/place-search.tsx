import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { Meta } from "@/domain/schema";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { navigate, placePath, type PlaceKind } from "@/lib/router";

interface Entry {
  kind: PlaceKind;
  code: string;
  label: string;
  detail: string;
  key: string;
  /** Larger first among equally good matches. */
  weight: number;
}

const LIMIT = 8;

const normalise = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function buildIndex(meta: Meta): Entry[] {
  const departmentNames = new Map(meta.departments.map((d) => [d.code, d.name]));
  return [
    ...meta.regions.map((r) => ({ kind: "region" as const, code: r.code, label: r.name, detail: "", key: normalise(r.name), weight: 0 })),
    ...meta.departments.map((d) => ({
      kind: "department" as const,
      code: d.code,
      label: d.name,
      detail: d.code,
      key: normalise(`${d.name} ${d.code}`),
      weight: 0,
    })),
    ...meta.cities.map((c) => ({
      kind: "city" as const,
      code: c.code,
      label: c.name,
      detail: departmentNames.get(c.department) ?? c.department,
      key: normalise(c.name),
      weight: c.stations,
    })),
  ];
}

function search(index: Entry[], query: string): Record<PlaceKind, Entry[]> {
  const q = normalise(query);
  const groups: Record<PlaceKind, Entry[]> = { region: [], department: [], city: [] };
  if (!q) {
    groups.region = index.filter((e) => e.kind === "region");
    return groups;
  }
  const scored: { entry: Entry; score: number }[] = [];
  for (const entry of index) {
    const at = entry.key.indexOf(q);
    if (at < 0) continue;
    const score = (at === 0 ? 0 : entry.key[at - 1] === " " ? 1 : 2) * 1000 - Math.min(entry.weight, 999);
    scored.push({ entry, score });
  }
  scored.sort((a, b) => a.score - b.score || a.entry.label.localeCompare(b.entry.label));
  for (const { entry } of scored) if (groups[entry.kind].length < LIMIT) groups[entry.kind].push(entry);
  return groups;
}

export function PlaceSearch({ meta }: { meta: Meta }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const index = useMemo(() => buildIndex(meta), [meta]);
  const groups = useMemo(() => search(index, query), [index, query]);

  const select = (entry: Entry) => {
    setOpen(false);
    setQuery("");
    navigate(placePath(entry.kind, entry.code));
  };

  const sections: [PlaceKind, string][] = [
    ["city", t("searchCities")],
    ["department", t("searchDepartments")],
    ["region", t("searchRegions")],
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-start gap-2 font-normal text-muted-foreground sm:w-72"
        >
          <MagnifyingGlassIcon className="size-4" aria-hidden />
          <span className="truncate">{t("searchButton")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("searchPlaceholder")} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t("searchEmpty")}</CommandEmpty>
            {sections.map(([kind, heading]) =>
              groups[kind].length ? (
                <CommandGroup key={kind} heading={heading}>
                  {groups[kind].map((entry) => (
                    <CommandItem key={`${kind}-${entry.code}`} value={`${kind}-${entry.code}`} onSelect={() => select(entry)}>
                      <span className="truncate">{entry.label}</span>
                      {entry.detail && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{entry.detail}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null,
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
