#!/usr/bin/env python3
import json
import os
import re
import sys


def _checked(body: str, phrase: str) -> bool:
    pattern = re.compile(rf"^- \[[xX]\].*{re.escape(phrase)}", re.MULTILINE)
    return bool(pattern.search(body))


def main() -> int:
    event_path = os.environ.get("GITHUB_EVENT_PATH", "").strip()
    if not event_path:
        print("GITHUB_EVENT_PATH is not set.")
        return 1

    with open(event_path, "r", encoding="utf-8") as fp:
        event = json.load(fp)

    pr = event.get("pull_request")
    if not pr:
        print("No pull_request payload found. Skip policy check.")
        return 0

    body = pr.get("body") or ""
    required = [
        "Main direct push not used",
        "Same-account cross-device sync impact reviewed",
        "OAuth identity split risk reviewed",
        "Required regression checks executed and result attached",
        "Image hydration regression reviewed",
    ]
    missing = [item for item in required if not _checked(body, item)]
    if missing:
        print("PR policy checklist is incomplete. Check these items in PR body:")
        for item in missing:
            print(f"- {item}")
        return 1

    print("PR policy checklist verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
