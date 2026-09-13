import type { Platform } from "./types";

export const platformNames: Record<Platform, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  linkedin: "LinkedIn Ads",
};
export const platforms: Platform[] = ["meta", "google", "linkedin"];
const integer = new Intl.NumberFormat("en-US");
export const count = (value: number | null | undefined) =>
  value == null ? "—" : integer.format(value);
export const money = (value: string | null) =>
  value === null
    ? "—"
    : `$${Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
export const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;
export const cpc = (value: number | null) =>
  value === null ? "—" : `$${value.toFixed(4)}`;
export const shortDate = (value: string | null) =>
  value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "Unknown week";
