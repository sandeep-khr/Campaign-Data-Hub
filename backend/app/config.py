import json
import os
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PLATFORMS = ("meta", "google", "linkedin")
POLICY_VERSION = "1"


def json_text(value: object) -> str:
    def encode(item: object) -> str:
        if isinstance(item, (Decimal, date)):
            return str(item)
        raise TypeError(f"Cannot serialize {type(item).__name__}")

    return json.dumps(value, sort_keys=True, ensure_ascii=False, default=encode)


@dataclass(frozen=True)
class Settings:
    data_dir: Path = PROJECT_ROOT / "data/deliveries"
    rates_path: Path = PROJECT_ROOT / "data/exchange_rates.json"
    overrides_path: Path = PROJECT_ROOT / "config/normalization_overrides.json"
    database_path: Path = PROJECT_ROOT / "var/campaign_hub.sqlite"
    report_start: date = date(2026, 6, 1)
    report_end: date = date(2026, 6, 30)
    unit_ratio_min: int = 50
    unit_ratio_max: int = 200
    volume_ratio_min: Decimal = Decimal("0.5")
    volume_ratio_max: Decimal = Decimal("2")

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            database_path=Path(os.environ.get("HUB_DATABASE", cls.database_path)),
            data_dir=Path(os.environ.get("HUB_DATA_DIR", cls.data_dir)),
        )

    def weeks(self) -> list[date]:
        return [
            self.report_start + timedelta(days=offset)
            for offset in range(0, (self.report_end - self.report_start).days + 1, 7)
        ]

    def load_processing_config(self) -> tuple[dict[str, Decimal], dict, dict]:
        if not self.data_dir.is_dir():
            raise ValueError("The configured input directory is missing or unreadable.")
        if self.report_start > self.report_end or self.report_start.weekday() != 0:
            raise ValueError("The reporting period must start on a Monday and end after it starts.")
        rates = json.loads(self.rates_path.read_text(), parse_float=Decimal)["rates"]
        rates = {currency: Decimal(str(value)) for currency, value in rates.items()}
        if not rates or any(not value.is_finite() or value <= 0 for value in rates.values()):
            raise ValueError("Exchange rates must be finite positive numbers.")
        if rates.get("USD") != Decimal(1):
            raise ValueError("The USD-to-USD rate must be 1.")
        overrides = json.loads(self.overrides_path.read_text())
        for fingerprint, override in overrides.items():
            if len(fingerprint) != 64 or override.get("platform") != "meta":
                raise ValueError("A correction must identify exact Meta content by SHA-256.")
            if override.get("spend_divisor") != "100":
                raise ValueError("The supported reviewed correction divides cents by 100.")
            if override.get("rule_id") != "meta.cents_to_usd" or not override.get("reason"):
                raise ValueError("A correction requires the named rule and its review reason.")
        context = {
            "policy_version": POLICY_VERSION,
            "report_start": str(self.report_start),
            "report_end": str(self.report_end),
            "platforms": list(PLATFORMS),
            "exchange_rates": {key: str(value) for key, value in rates.items()},
            "overrides": overrides,
            "unit_ratio_range": [self.unit_ratio_min, self.unit_ratio_max],
            "volume_ratio_range": [str(self.volume_ratio_min), str(self.volume_ratio_max)],
            "ratio_policy": "paired",
        }
        return rates, overrides, context
