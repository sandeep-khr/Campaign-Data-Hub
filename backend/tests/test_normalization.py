import time
from datetime import date
from decimal import Decimal

import pytest

from app.normalization import count_value, date_value, money_value


def test_exact_money_and_currency():
    assert money_value("64629999", "micros", Decimal("1"), Decimal("1")) == 64_629_999
    assert money_value("92.37", "currency", Decimal("1.08"), Decimal("1")) == 99_759_600
    assert money_value("1000000", "micros", Decimal("1.08"), Decimal("1")) == 1_080_000
    assert money_value("17334.00", "usd", Decimal("1"), Decimal("100")) == 173_340_000


def test_unrepresentable_precision_is_not_truncated():
    with pytest.raises(ArithmeticError, match="exactly"):
        money_value("1", "micros", Decimal("1.08"), Decimal("1"))


@pytest.mark.parametrize("value", ["-1", "1.5", True, "Infinity", str(2**63)])
def test_invalid_counts_are_not_coerced(value):
    with pytest.raises(ValueError):
        count_value(value)


def test_date_formats_and_invalid_date():
    assert date_value("06/01/2026", "meta")[0] == date(2026, 6, 1)
    assert date_value("2026-06-01", "meta")[0] == date(2026, 6, 1)
    with pytest.raises(ValueError):
        date_value("06/31/2026", "meta")


def test_epoch_date_does_not_depend_on_local_timezone(monkeypatch):
    try:
        with monkeypatch.context() as patch:
            patch.setenv("TZ", "America/Los_Angeles")
            if hasattr(time, "tzset"):
                time.tzset()
            assert date_value(1780272000000, "linkedin")[0] == date(2026, 6, 1)
    finally:
        if hasattr(time, "tzset"):
            time.tzset()
