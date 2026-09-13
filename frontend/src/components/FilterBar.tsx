import type { Filters } from "../types";
import { Search } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { PlatformSelect } from "./PlatformSelect";

export function FilterBar({
  filters,
  onChange,
  currency,
  currencies,
  onCurrencyChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  currency: string;
  currencies: string[];
  onCurrencyChange: (currency: string) => void;
}) {
  return (
    <div className="filter-bar">
      <div className="filter-field platform-filter">
        <span className="filter-label">Platform</span>
        <PlatformSelect
          value={filters.platform}
          onChange={(platform) => onChange({ ...filters, platform })}
        />
      </div>
      <label className="campaign-filter">
        Campaign search
        <span className="input-with-icon">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={filters.campaign}
            placeholder="Search campaign name (optional)"
            onChange={(event) =>
              onChange({ ...filters, campaign: event.target.value })
            }
          />
        </span>
      </label>
      <div className="filter-field date-range-filter">
        <span className="filter-label">Date range</span>
        <DateRangePicker
          start={filters.start_date}
          end={filters.end_date}
          onChange={(start_date, end_date) =>
            onChange({ ...filters, start_date, end_date })
          }
        />
      </div>
      <label className="currency-filter">
        Display currency
        <select
          value={currency}
          onChange={(event) => onCurrencyChange(event.target.value)}
        >
          {currencies.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
