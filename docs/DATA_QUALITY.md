# Data-quality findings

This report records what the implemented checks found in the supplied June 2026 exports. It is generated from one deterministic ingestion of the checked-in files.

## Snapshot result

| Measure | Result |
|---|---:|
| Physical files scanned | 15 |
| Processed deliveries | 14 |
| Duplicate deliveries | 1 |
| Missing deliveries | 1 |
| Accepted normalized rows | 368 |
| Rejected rows | 1 |
| Duplicate rows excluded | 8 |
| Rows with reviewed correction | 35 |
| Delivery health | 8 pass / 4 warn / 4 fail |
| Exact normalized spend | $54,277.299999 |

## Non-pass deliveries

| Delivery | Health | Finding | Handling |
|---|---|---|---|
| `google_ads_2026-06-01.csv` | warn | Eight exact duplicate rows | First occurrence retained; duplicates excluded |
| `google_ads_2026-06-15_resend.csv` | warn | Byte-identical resend of the unsuffixed delivery | File reported and linked to the original; no metrics loaded twice |
| `linkedin_ads_2026-06-08.json` | warn | Five rows omit clicks | Rows retained with clicks as unknown; excluded from ratios that require clicks |
| `meta_ads_2026-06-01.csv` | fail | `06/31/2026` is invalid at line 23 | Row rejected; remaining 34 rows retained |
| `meta_ads_2026-06-01.csv` | warn | One Meta row uses ISO format; the rejected date leaves one campaign/day gap | Valid ISO date accepted and documented; completeness gap reported |
| `meta_ads_2026-06-08.csv` | fail | All 35 spend values are about 100 times the cross-week baseline and look like cents | Exact-hash reviewed divide-by-100 correction applied; raw values and rules retained |
| `meta_ads_2026-06-15.csv` | warn | Three rows omit clicks | Rows retained with clicks as unknown |
| `meta_ads_2026-06-22.csv` | fail | Negative spend `-111.41` at line 8 | Spend set to unknown; valid dimensions and counts retained |
| LinkedIn week of `2026-06-22` | fail | Expected weekly delivery is absent | Synthetic missing-delivery report created; no fabricated metric rows |

One delivery can appear more than once because each check remains separate in the structured report.

## Why failed rows can still contribute data

Health describes source trust, while row retention describes what can be used safely. A bad identity or date means the row cannot be placed in the canonical dataset, so it is rejected. A bad individual metric is set to unknown while valid campaign, date and other measures remain usable. This preserves evidence and avoids turning missing or invalid values into zero.

The Meta cents correction is a reviewed exception rather than a general heuristic. The check can detect the same pattern in another file, but without a matching configuration entry it quarantines the suspicious spend instead of silently dividing it.

## Reproducing the report

From the repository root:

```bash
make setup
make ingest
```

The command prints the dataset fingerprint and summary counts. Run it again to verify that the fingerprint and results are unchanged. Start the application with `make run` to inspect every check, locator, observed value and expected value in the Data Health view.
