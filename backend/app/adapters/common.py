import csv
import io
import json
from decimal import Decimal

from app.domain import SourceRow


def csv_rows(content: bytes, columns: dict[str, str], *, currency="USD", unit="usd"):
    reader = csv.reader(io.StringIO(content.decode("utf-8-sig"), newline=""), strict=True)
    headers = next(reader, None)
    if not headers or len(set(headers)) != len(headers):
        raise ValueError("A CSV file needs a nonempty header with unique column names.")
    missing = set(columns.values()) - set(headers)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}.")
    rows = []
    while True:
        line = reader.line_num + 1
        cells = next(reader, None)
        if cells is None:
            break
        if not cells:
            continue
        locator = f"line:{line}"
        if len(cells) != len(headers):
            rows.append(SourceRow(locator, cells, {}, "Row length does not match the header."))
            continue
        raw = dict(zip(headers, cells, strict=True))
        values = {key: raw[column] for key, column in columns.items()}
        values.setdefault("currency", currency)
        values["unit"] = unit
        rows.append(SourceRow(locator, raw, values))
    return rows


def json_array(content: bytes) -> list:
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Repeated JSON key: {key}.")
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError(f"Invalid JSON numeric constant: {value}.")

    rows = json.loads(
        content.decode("utf-8-sig"),
        parse_float=Decimal,
        parse_constant=invalid_constant,
        object_pairs_hook=unique_keys,
    )
    if not isinstance(rows, list):
        raise ValueError("Expected a JSON array of campaign records.")
    return rows
