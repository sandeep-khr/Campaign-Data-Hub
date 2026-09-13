import * as Popover from "@radix-ui/react-popover";
import { Bell, ChevronRight } from "lucide-react";
import { platformNames, shortDate } from "../format";
import type { DeliveriesResponse, Delivery } from "../types";
import { StatusBadge } from "./StatusBadge";

function label(delivery: Delivery) {
  if (delivery.file_name) return delivery.file_name;
  if (delivery.platform && delivery.period_start) {
    return `${platformNames[delivery.platform]} · ${shortDate(delivery.period_start)}`;
  }
  return "Expected delivery";
}

export function HealthNotifications({
  data,
  loading,
  onOpen,
}: {
  data: DeliveriesResponse | null;
  loading: boolean;
  onOpen: (deliveryId?: string) => void;
}) {
  const attention = (data?.items ?? [])
    .filter((item) => item.health !== "pass")
    .sort((left, right) => {
      const rank = { fail: 0, warn: 1, pass: 2 };
      return rank[left.health] - rank[right.health];
    });

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="notification-trigger"
          aria-label={`Data health notifications${attention.length ? `, ${attention.length} need attention` : ""}`}
        >
          <Bell size={18} aria-hidden="true" />
          {attention.length > 0 && (
            <span className="notification-count">{attention.length}</span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="notification-content"
          align="end"
          sideOffset={8}
        >
          <div className="notification-heading">
            <div>
              <strong>Data health</strong>
              <span>
                {loading
                  ? "Checking deliveries…"
                  : `${attention.length} item${attention.length === 1 ? "" : "s"} need attention`}
              </span>
            </div>
            {data?.dataset_fingerprint && (
              <span className="live-indicator">Dataset ready</span>
            )}
          </div>
          <div className="notification-list">
            {!loading && attention.length === 0 && (
              <p className="notification-empty">
                No active data health issues.
              </p>
            )}
            {attention.slice(0, 5).map((delivery) => (
              <Popover.Close asChild key={delivery.id}>
                <button
                  className="notification-item"
                  onClick={() => onOpen(delivery.id)}
                >
                  <StatusBadge value={delivery.health} />
                  <span>
                    <strong>{label(delivery)}</strong>
                    <small>
                      {delivery.issues} issue{delivery.issues === 1 ? "" : "s"}
                    </small>
                  </span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </Popover.Close>
            ))}
          </div>
          <Popover.Close asChild>
            <button className="notification-footer" onClick={() => onOpen()}>
              View all delivery health
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
