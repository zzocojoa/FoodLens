from __future__ import annotations

import asyncio
import logging
import os
import signal
from datetime import datetime, timezone

from backend import server as backend_server

logger = logging.getLogger("foodlens.worker")

async def _wait_for_shutdown_signal() -> None:
    shutdown_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _request_shutdown() -> None:
        shutdown_event.set()

    for signum in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(signum, _request_shutdown)
        except (NotImplementedError, RuntimeError):
            signal.signal(signum, lambda *_: _request_shutdown())

    logger.info(
        "Worker runtime started pid=%d started_at=%s",
        os.getpid(),
        datetime.now(timezone.utc).isoformat(),
    )
    await shutdown_event.wait()


async def _run_worker_runtime() -> None:
    started = False
    try:
        await backend_server.startup_worker_runtime()
        started = True
        await _wait_for_shutdown_signal()
    finally:
        if started:
            await backend_server.shutdown_runtime()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
    try:
        asyncio.run(_run_worker_runtime())
        return 0
    except KeyboardInterrupt:
        return 130
    except Exception:
        logger.exception("Worker runtime failed to start or shut down cleanly.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
