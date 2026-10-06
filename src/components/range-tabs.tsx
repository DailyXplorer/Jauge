import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { RANGES, type Range } from "@/lib/series";

export function RangeTabs({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
  const { dict } = useI18n();
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as Range)}>
      <TabsList>
        {RANGES.map((range) => (
          <TabsTrigger key={range} value={range} className="px-2.5 tabular-nums">
            {dict.ranges[range]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
