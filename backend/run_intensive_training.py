"""Run continuous scraping + long-horizon baseline-aware model training."""

import argparse
import logging
import threading
import time
from datetime import datetime, timezone

import config
from data.rate_manager import RateManager
from data.training_store import append_live_snapshot, get_live_stats
from train import run_training


logger = logging.getLogger("liquifi.intensive")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def _collector_loop(stop_event: threading.Event, scrape_interval_s: int) -> None:
    rm = RateManager()
    while not stop_event.is_set():
        started = time.time()
        try:
            rm.scrape()
            rm.snapshot()
            raw = rm.get_rate_buffer()
            if raw:
                wrote = append_live_snapshot(raw[-1], ts=datetime.now(timezone.utc))
                if wrote:
                    stats = get_live_stats()
                    logger.info("Live snapshot stored (rows=%d, last=%s)", stats["rows"], stats["last_timestamp"])
        except Exception as exc:
            logger.warning("Collector loop error: %s", exc)

        elapsed = time.time() - started
        sleep_for = max(1.0, scrape_interval_s - elapsed)
        stop_event.wait(sleep_for)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run intensive 12h-style training with continuous data scraping.")
    parser.add_argument("--hours", type=float, default=12.0, help="Training time budget in hours.")
    parser.add_argument("--scrape-interval", type=int, default=config.SCRAPE_INTERVAL_S, help="Live scrape interval in seconds.")
    parser.add_argument("--cycle-minutes", type=float, default=30.0, help="Retraining cycle length; data is rebuilt every cycle.")
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--seq-len", type=int, default=config.SEQ_LEN)
    parser.add_argument("--target-mode", choices=["absolute", "delta"], default=config.TARGET_MODE_DEFAULT)
    args = parser.parse_args()

    stop_event = threading.Event()
    collector = threading.Thread(
        target=_collector_loop,
        kwargs={"stop_event": stop_event, "scrape_interval_s": args.scrape_interval},
        daemon=True,
    )
    collector.start()

    logger.info("Started live collector (interval=%ss).", args.scrape_interval)
    try:
        total_seconds = max(0.0, args.hours * 3600.0)
        cycle_seconds = max(60.0, args.cycle_minutes * 60.0)
        started = time.time()
        cycle = 0
        while True:
            elapsed = time.time() - started
            remaining = total_seconds - elapsed
            if remaining <= 0:
                break
            cycle += 1
            this_cycle_hours = min(remaining, cycle_seconds) / 3600.0
            logger.info(
                "Training cycle %d started (budget=%.2f min, remaining=%.2f min).",
                cycle,
                this_cycle_hours * 60.0,
                remaining / 60.0,
            )
            run_training(
                epochs=10_000,
                lr=args.lr,
                seq_len=args.seq_len,
                data_path=config.SEED_DATA_PATH,
                hours=this_cycle_hours,
                resume=True,
                target_mode=args.target_mode,
                use_live=True,
                min_rmse_margin=0.0,
            )
            stats = get_live_stats()
            logger.info(
                "Training cycle %d finished. Live rows=%d last=%s",
                cycle,
                stats["rows"],
                stats["last_timestamp"],
            )
    finally:
        stop_event.set()
        collector.join(timeout=5)
        stats = get_live_stats()
        logger.info("Stopped intensive runner. Live rows=%d, last=%s", stats["rows"], stats["last_timestamp"])


if __name__ == "__main__":
    main()
