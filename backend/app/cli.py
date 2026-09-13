"""Run with: python -m app.cli"""

from app.config import Settings, json_text
from app.database import initialize, replace_snapshot
from app.ingestion import build_snapshot


def main():
    settings = Settings.from_environment()
    initialize(settings.database_path)
    snapshot = build_snapshot(settings)
    replace_snapshot(settings.database_path, snapshot)
    print(json_text(snapshot.summary()))


if __name__ == "__main__":
    main()
