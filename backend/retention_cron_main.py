from __future__ import annotations

import asyncio
import logging

from backend import server as backend_server

logger = logging.getLogger("foodlens.retention_cron")

async def _run_cron_runtime() -> None:
    started = False
    try:
        await backend_server.startup_retention_cron_runtime()
        started = True
        await backend_server.run_retention_cleanup_pass()
    finally:
        if started:
            await backend_server.shutdown_runtime()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
    try:
        asyncio.run(_run_cron_runtime())
        return 0
    except Exception:
        logger.exception("Retention cron runtime failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
