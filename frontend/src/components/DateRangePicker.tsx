import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { DayPicker, type DateRange } from "@daypicker/react";
import { format } from "date-fns";

function parseIso(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIso(value: Date | undefined) {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const selected: DateRange | undefined = start
    ? { from: parseIso(start), to: parseIso(end) }
    : undefined;

  let label = "Select date range";
  if (selected?.from && selected.to) {
    label = `${format(selected.from, "MMM d, yyyy")} – ${format(selected.to, "MMM d, yyyy")}`;
  } else if (selected?.from) {
    label = `${format(selected.from, "MMM d, yyyy")} – Pick end date`;
  }

  function selectRange(range: DateRange | undefined) {
    onChange(toIso(range?.from), toIso(range?.to));
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="date-range-trigger" aria-label="Date range">
          <CalendarDays size={16} aria-hidden="true" />
          <span>{label}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="date-range-content"
          align="start"
          sideOffset={6}
        >
          <DayPicker
            mode="range"
            selected={selected}
            onSelect={selectRange}
            defaultMonth={selected?.from ?? new Date()}
            showOutsideDays
          />
          <div className="date-range-actions">
            <span>{label}</span>
            <button
              type="button"
              onClick={() => onChange("", "")}
              disabled={!start && !end}
            >
              <X size={14} aria-hidden="true" />
              Clear
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
