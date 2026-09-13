from app.adapters import google, linkedin, meta

ADAPTERS = {"meta": meta.parse, "google": google.parse, "linkedin": linkedin.parse}
EXTENSIONS = {"meta": "csv", "google": "csv", "linkedin": "json"}
