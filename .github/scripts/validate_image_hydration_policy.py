#!/usr/bin/env python3
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def require_pattern(path: str, pattern: str, message: str) -> str | None:
    content = read(path)
    if re.search(pattern, content, re.MULTILINE):
        return None
    return f"{path}: {message}"


def main() -> int:
    failures: list[str] = []

    checks = [
        (
            "FoodLens/features/camera/services/cameraAnalysisService.ts",
            r"saveImagePermanentlyOrThrow\(",
            "camera analysis path must persist images before storing result references.",
        ),
        (
            "FoodLens/features/camera/services/cameraAnalysisService.ts",
            r"dataStore\.setData\(\s*analysisResult,\s*locationContext,\s*persistedImageRef,",
            "camera analysis path must write persisted image reference to dataStore.",
        ),
        (
            "FoodLens/components/FoodThumbnail.tsx",
            r'cachePolicy="memory-disk"',
            "history/recent thumbnail renderer must use memory-disk cache policy.",
        ),
        (
            "FoodLens/components/FoodThumbnail.tsx",
            r"cacheKey",
            "history/recent thumbnail renderer must provide stable cache key for signed media URLs.",
        ),
        (
            "FoodLens/components/SecureImage.tsx",
            r'cachePolicy="memory-disk"',
            "result/profile secure image renderer must use memory-disk cache policy.",
        ),
    ]

    for path, pattern, message in checks:
        failure = require_pattern(path, pattern, message)
        if failure:
            failures.append(failure)

    if failures:
        print("Image hydration policy check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Image hydration policy check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
