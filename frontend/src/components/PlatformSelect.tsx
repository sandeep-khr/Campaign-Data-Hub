import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Layers3 } from "lucide-react";
import type { Platform } from "../types";
import { platformNames, platforms } from "../format";
import { PlatformLabel } from "./PlatformLabel";

export function PlatformSelect({
  value,
  onChange,
}: {
  value: Platform | "";
  onChange: (platform: Platform | "") => void;
}) {
  const selectedValue = value || "all";

  return (
    <Select.Root
      value={selectedValue}
      onValueChange={(next) =>
        onChange(next === "all" ? "" : (next as Platform))
      }
    >
      <Select.Trigger className="select-trigger" aria-label="Platform">
        <Select.Value>
          {value ? (
            <PlatformLabel platform={value} />
          ) : (
            <span className="platform-label">
              <Layers3
                className="platform-logo neutral-logo"
                aria-hidden="true"
              />
              All platforms
            </span>
          )}
        </Select.Value>
        <Select.Icon>
          <ChevronDown size={16} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="select-content"
          position="popper"
          sideOffset={6}
        >
          <Select.Viewport className="select-viewport">
            <Select.Item
              className="select-item"
              value="all"
              textValue="All platforms"
            >
              <Select.ItemText>
                <span className="platform-label">
                  <Layers3
                    className="platform-logo neutral-logo"
                    aria-hidden="true"
                  />
                  All platforms
                </span>
              </Select.ItemText>
              <Select.ItemIndicator className="select-indicator">
                <Check size={15} aria-hidden="true" />
              </Select.ItemIndicator>
            </Select.Item>
            {platforms.map((platform) => (
              <Select.Item
                className="select-item"
                value={platform}
                textValue={platformNames[platform]}
                key={platform}
              >
                <Select.ItemText>
                  <PlatformLabel platform={platform} />
                </Select.ItemText>
                <Select.ItemIndicator className="select-indicator">
                  <Check size={15} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
