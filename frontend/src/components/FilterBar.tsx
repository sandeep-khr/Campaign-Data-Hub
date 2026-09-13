import type { Filters } from "../types";
import { platformNames, platforms } from "../format";

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
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
      <span className="filter-note">
        Reporting currency <strong>USD</strong>
      </span>
    </div>
  );
}
