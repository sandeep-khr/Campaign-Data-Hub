import type { Filters } from "../types";
import { platformNames, platforms } from "../format";
import { Search } from "lucide-react";

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
  const invalid = Boolean(
    filters.start_date &&
    filters.end_date &&
    filters.start_date > filters.end_date,
  );
  return (
    <div className="filter-bar">
      <label>
        Platform
        <select
          value={filters.platform}
          onChange={(event) =>
            onChange({
              ...filters,
              platform: event.target.value as Filters["platform"],
            })
          }
        >
          <option value="">All platforms</option>
          {platforms.map((platform) => (
            <option key={platform} value={platform}>
              {platformNames[platform]}
            </option>
          ))}
        </select>
      </label>
      <label className="campaign-filter">
        Campaign search
        <span className="input-with-icon">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={filters.campaign}
            placeholder="Search campaigns"
            onChange={(event) =>
              onChange({ ...filters, campaign: event.target.value })
            }
          />
        </span>
      </label>
      <label>
        Start date
        <input
          type="date"
          value={filters.start_date}
          onChange={(event) =>
            onChange({ ...filters, start_date: event.target.value })
          }
        />
      </label>
      <span className="date-separator" aria-hidden="true">
        →
      </span>
      <label>
        End date
        <input
          type="date"
          value={filters.end_date}
          aria-invalid={invalid}
          onChange={(event) =>
            onChange({ ...filters, end_date: event.target.value })
          }
        />
      </label>
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
