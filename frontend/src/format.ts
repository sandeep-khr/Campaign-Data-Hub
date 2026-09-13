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

function currencyFormatter(currency: string, digits: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function convertUsd(value: number, rateToUsd: number) {
  return value / rateToUsd;
}

export const money = (value: string | null, currency = "USD", rateToUsd = 1) =>
  value === null
    ? "—"
    : currencyFormatter(currency, 2).format(
        convertUsd(Number(value), rateToUsd),
      );
export const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;
export const cpc = (value: number | null, currency = "USD", rateToUsd = 1) =>
  value === null
    ? "—"
    : currencyFormatter(currency, 4).format(convertUsd(value, rateToUsd));
export const shortDate = (value: string | null) =>
  value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "Unknown week";
