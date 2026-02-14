#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export FastAPI OpenAPI schema snapshot.")
    parser.add_argument(
        "--out",
        default="backend/contracts/openapi.json",
        help="Output path for exported OpenAPI schema",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out_path = Path(args.out)

    os.environ["OPENAPI_EXPORT_ONLY"] = "1"

    from backend.server import app  # delayed import to respect OPENAPI_EXPORT_ONLY

    schema = app.openapi()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fp:
        json.dump(schema, fp, ensure_ascii=False, indent=2, sort_keys=True)
        fp.write("\n")

    print(f"[OPENAPI-EXPORT] wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
