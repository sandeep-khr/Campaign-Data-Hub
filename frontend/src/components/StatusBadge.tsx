export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`status-badge status-${value}`}>
      <span aria-hidden="true" />
      {value}
    </span>
  );
}
