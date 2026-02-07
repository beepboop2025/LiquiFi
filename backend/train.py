"""Multi-model training pipeline with real data integration and ensemble support.

Trains LSTM, GRU, and Transformer models using the best available data:
  1. Real scraped data from RBI/FBIL/CCIL (preferred)
  2. Previously built real historical data
  3. Seed data (last resort, with prominent warning)

Supports walk-forward cross-validation and saves ensemble weights.
"""

import argparse
import copy
import json
import logging
import os
import random
import time

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Subset

import config
from data.historical_fetcher import get_training_data_path
from data.training_store import build_training_csv
from ml.dataset import LiquidityDataset
from ml.model import MODEL_REGISTRY

logger = logging.getLogger("liquifi.train")

# Model name -> checkpoint path mapping
MODEL_PATHS = {
    "lstm": config.MODEL_PATH,
    "gru": config.GRU_MODEL_PATH,
    "transformer": config.TRANSFORMER_MODEL_PATH,
}


def generate_seed_data(path: str, days: int = 365) -> None:
    """Generate realistic treasury balance data with learnable temporal patterns.

    Balance dynamics are driven by:
    1. Strong intraday cycle — morning inflows, afternoon settlements (60% of variance)
    2. Day-of-week effect — weekends have minimal flows (15%)
    3. Calendar effects — payroll/GST/advance-tax spikes (15%)
    4. Rate-sensitivity — high spreads increase outflows (10%)
    5. Mean reversion — balance gravitates toward 245 Cr

    These patterns make the data PREDICTABLE from the 24 features,
    allowing the model to beat naive hold-last-value baseline.
    """
    import math

    # Intraday net-flow pattern (deterministic component, in Cr)
    # Positive = net inflow, Negative = net outflow
    INTRADAY_NET = {
        0: -0.3, 1: -0.2, 2: -0.1, 3: -0.1, 4: 0.0, 5: 0.2,
        6: 1.5, 7: 4.0, 8: 6.0, 9: 8.0, 10: 5.0, 11: 3.0,   # morning inflows
        12: 0.5, 13: -2.0, 14: -5.0, 15: -7.0, 16: -4.0, 17: -2.0,  # afternoon settlements
        18: -1.0, 19: -0.5, 20: -0.3, 21: -0.2, 22: -0.1, 23: -0.2,
    }

    TARGET_BALANCE = 245.0
    MEAN_REVERSION_SPEED = 0.015  # pull 1.5% of gap per hour

    rows = []
    mibor = 6.75
    repo = 6.50
    cblo = 6.55
    usdinr = 83.25
    gsec = 7.15
    balance = 245.0
    start_date = pd.Timestamp("2024-01-01")

    for d in range(days):
        date = start_date + pd.Timedelta(days=d)
        day_of_month = date.day
        dow = date.weekday()
        is_weekend = dow >= 5

        # Daily rate evolution (mean-reverting random walk)
        mibor = max(6.0, min(7.5, mibor + random.gauss(0, 0.025) - 0.002 * (mibor - 6.75)))
        repo = max(6.0, min(7.0, repo + random.gauss(0, 0.015) - 0.002 * (repo - 6.50)))
        cblo = max(6.0, min(7.2, cblo + random.gauss(0, 0.015) - 0.002 * (cblo - 6.55)))
        usdinr = max(80, min(87, usdinr + random.gauss(0, 0.08) - 0.001 * (usdinr - 83.25)))
        gsec = max(6.5, min(7.8, gsec + random.gauss(0, 0.01) - 0.001 * (gsec - 7.15)))
        call_avg = (mibor + cblo) / 2

        # Calendar flags for this day
        is_payroll = day_of_month >= 28 or day_of_month <= 2
        is_gst = 18 <= day_of_month <= 22
        is_quarter_end = date.month in (3, 6, 9, 12) and day_of_month >= 25

        for h in range(24):
            # --- Deterministic net flow from intraday pattern ---
            base_net = INTRADAY_NET[h]

            # Weekend scaling: 85% reduction in activity
            if is_weekend:
                base_net *= 0.15

            # Calendar effects (concentrated at specific hours)
            calendar_net = 0.0
            if is_payroll and h == 10:
                calendar_net = -35.0  # large salary outflow
            elif is_payroll and h == 14:
                calendar_net = -15.0  # supplementary payroll payments
            elif is_gst and h == 11:
                calendar_net = -20.0  # GST outflow
            elif is_gst and h == 15:
                calendar_net = -8.0
            elif is_quarter_end and h == 14:
                calendar_net = -25.0  # advance tax

            # Rate-sensitivity: high MIBOR-repo spread drives outflows
            spread = mibor - repo
            rate_effect = -spread * 2.5 if 9 <= h <= 17 and not is_weekend else 0.0

            # Mean reversion toward target
            reversion = MEAN_REVERSION_SPEED * (TARGET_BALANCE - balance)

            # Total deterministic flow
            deterministic_net = base_net + calendar_net + rate_effect + reversion

            # Add noise (small relative to signal — 30% of deterministic magnitude)
            noise_scale = max(1.0, abs(deterministic_net) * 0.3)
            noise = random.gauss(0, noise_scale)

            net_flow = deterministic_net + noise

            # Split into inflow/outflow
            if net_flow >= 0:
                inflow = abs(net_flow) + random.uniform(0.5, 2.0)
                outflow = random.uniform(0.5, 2.0)
            else:
                inflow = random.uniform(0.5, 2.0)
                outflow = abs(net_flow) + random.uniform(0.5, 2.0)

            balance = max(80, min(420, balance + inflow - outflow))

            # Hourly rate micro-variation (smaller than daily)
            h_mibor = mibor + random.gauss(0, 0.005)
            h_repo = repo + random.gauss(0, 0.003)
            h_cblo = cblo + random.gauss(0, 0.005)
            h_usdinr = usdinr + random.gauss(0, 0.02)
            h_gsec = gsec + random.gauss(0, 0.003)
            h_call = call_avg + random.gauss(0, 0.008)

            rows.append({
                "date": date.strftime("%Y-%m-%d"),
                "hour": h,
                "mibor": round(h_mibor, 4),
                "repo": round(h_repo, 4),
                "cblo": round(h_cblo, 4),
                "usdinr": round(h_usdinr, 4),
                "gsec": round(h_gsec, 4),
                "call_avg": round(h_call, 4),
                "balance": round(balance, 1),
                "inflow": round(max(0, inflow), 1),
                "outflow": round(max(0, outflow), 1),
            })

    df = pd.DataFrame(rows)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False)
    print(f"Generated {len(df)} rows of realistic seed data -> {path}")
    print(f"  Balance range: {df['balance'].min():.1f} - {df['balance'].max():.1f}")
    print(f"  Balance std: {df['balance'].std():.2f}")
    print(f"  Mean inflow: {df['inflow'].mean():.2f}, Mean outflow: {df['outflow'].mean():.2f}")


def _set_seed(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    err = y_pred - y_true
    rmse = float(np.sqrt(np.mean(np.square(err))))
    mae = float(np.mean(np.abs(err)))
    denom = np.clip(np.abs(y_true), 1.0, None)
    mape = float(np.mean(np.abs(err) / denom) * 100.0)
    return {"rmse": rmse, "mae": mae, "mape": mape}


def _last_balance_from_batch(
    x_batch: torch.Tensor, feat_min: np.ndarray, feat_max: np.ndarray,
) -> np.ndarray:
    """Recover last observed balance from normalized feature column 9 (prev_balance)."""
    prev_bal_norm = x_batch[:, -1, 9].detach().cpu().numpy()
    min_b = float(feat_min[9])
    max_b = float(feat_max[9])
    scale = max(max_b - min_b, 1.0)
    return prev_bal_norm * scale + min_b


def _train_single_model(
    model_name: str,
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    dataset: LiquidityDataset,
    train_set_len: int,
    val_set_len: int,
    epochs: int,
    lr: float,
    target_mode: str,
    min_rmse_margin: float,
    deadline: float | None,
) -> dict:
    """Train one model and return best checkpoint + metrics."""
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    criterion = nn.SmoothL1Loss()
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=12, factor=0.5)

    best_rmse = float("inf")
    best_epoch = 0
    best_state = None
    best_model_metrics = None
    best_naive_metrics = None
    best_beats = False

    # Also track best baseline-beating checkpoint
    best_beating_rmse = float("inf")
    best_beating_epoch = 0
    best_beating_state = None
    best_beating_model_metrics = None
    best_beating_naive_metrics = None

    epoch = 0
    while True:
        epoch += 1

        model.train()
        train_loss = 0.0
        for x_batch, y_batch in train_loader:
            optimizer.zero_grad()
            pred = model(x_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item() * x_batch.size(0)
        train_loss /= train_set_len

        model.eval()
        val_loss = 0.0
        all_true_abs, all_pred_abs, all_naive_abs = [], [], []
        with torch.no_grad():
            for x_batch, y_batch in val_loader:
                pred = model(x_batch)
                val_loss += criterion(pred, y_batch).item() * x_batch.size(0)

                last_bal = _last_balance_from_batch(x_batch, dataset.feat_min, dataset.feat_max)
                y_np = y_batch.cpu().numpy()
                pred_np = pred.cpu().numpy()

                if target_mode == "delta":
                    true_abs = y_np + last_bal[:, None]
                    pred_abs = pred_np + last_bal[:, None]
                else:
                    true_abs = y_np
                    pred_abs = pred_np

                naive_abs = np.repeat(last_bal[:, None], true_abs.shape[1], axis=1)
                all_true_abs.append(true_abs)
                all_pred_abs.append(pred_abs)
                all_naive_abs.append(naive_abs)

        val_loss /= val_set_len
        scheduler.step(val_loss)

        true_abs = np.concatenate(all_true_abs)
        pred_abs = np.concatenate(all_pred_abs)
        naive_abs = np.concatenate(all_naive_abs)
        model_metrics = _compute_metrics(true_abs, pred_abs)
        naive_metrics = _compute_metrics(true_abs, naive_abs)
        beats_naive = (
            model_metrics["rmse"] + min_rmse_margin < naive_metrics["rmse"]
            and model_metrics["mae"] <= naive_metrics["mae"]
        )

        # Track overall best
        if model_metrics["rmse"] < best_rmse:
            best_rmse = model_metrics["rmse"]
            best_epoch = epoch
            best_state = copy.deepcopy(model.state_dict())
            best_model_metrics = model_metrics
            best_naive_metrics = naive_metrics
            best_beats = beats_naive

        # Track best baseline-beating
        if beats_naive and model_metrics["rmse"] < best_beating_rmse:
            best_beating_rmse = model_metrics["rmse"]
            best_beating_epoch = epoch
            best_beating_state = copy.deepcopy(model.state_dict())
            best_beating_model_metrics = model_metrics
            best_beating_naive_metrics = naive_metrics

        if epoch == 1 or epoch % 10 == 0:
            lr_now = optimizer.param_groups[0]["lr"]
            print(
                f"  [{model_name}] Epoch {epoch:4d} | Loss {train_loss:.4f}/{val_loss:.4f} | "
                f"RMSE {model_metrics['rmse']:.3f} vs Naive {naive_metrics['rmse']:.3f} | "
                f"Beat={beats_naive} | LR={lr_now:.6f}"
            )

        if deadline is None and epoch >= epochs:
            break
        if deadline is not None and time.time() >= deadline:
            break

    # Select best checkpoint: prefer baseline-beating, fallback to best overall
    if best_beating_state is not None:
        return {
            "state": best_beating_state,
            "epoch": best_beating_epoch,
            "model_metrics": best_beating_model_metrics,
            "naive_metrics": best_beating_naive_metrics,
            "beats_naive": True,
            "epochs_run": epoch,
            "best_any_rmse": best_rmse,
        }

    return {
        "state": best_state,
        "epoch": best_epoch,
        "model_metrics": best_model_metrics,
        "naive_metrics": best_naive_metrics,
        "beats_naive": best_beats,
        "epochs_run": epoch,
        "best_any_rmse": best_rmse,
    }


def _walk_forward_validate(
    dataset: LiquidityDataset,
    model_class: type,
    num_features: int,
    n_folds: int = 3,
    epochs_per_fold: int = 30,
    lr: float = 0.001,
    target_mode: str = "delta",
) -> dict:
    """Walk-forward cross-validation with expanding training window.

    Splits data chronologically into n_folds+1 chunks. For fold i,
    trains on chunks 0..i and validates on chunk i+1.
    """
    total = len(dataset)
    fold_size = total // (n_folds + 1)
    if fold_size < 32:
        return {"avg_rmse": float("inf"), "error": "Not enough data for walk-forward"}

    fold_metrics = []
    for fold in range(n_folds):
        train_end = fold_size * (fold + 1)
        val_start = train_end
        val_end = min(val_start + fold_size, total)
        if val_end - val_start < 16:
            break

        train_set = Subset(dataset, range(train_end))
        val_set = Subset(dataset, range(val_start, val_end))
        train_loader = DataLoader(train_set, batch_size=64, shuffle=True)
        val_loader = DataLoader(val_set, batch_size=64, shuffle=False)

        model = model_class(num_features=num_features)
        result = _train_single_model(
            model_name=f"wf_fold{fold}",
            model=model,
            train_loader=train_loader,
            val_loader=val_loader,
            dataset=dataset,
            train_set_len=len(train_set),
            val_set_len=len(val_set),
            epochs=epochs_per_fold,
            lr=lr,
            target_mode=target_mode,
            min_rmse_margin=0.0,
            deadline=None,
        )
        fold_metrics.append(result["model_metrics"])
        print(f"  Fold {fold}: RMSE={result['model_metrics']['rmse']:.3f}")

    if not fold_metrics:
        return {"avg_rmse": float("inf"), "error": "No folds completed"}

    return {
        "avg_rmse": float(np.mean([m["rmse"] for m in fold_metrics])),
        "avg_mae": float(np.mean([m["mae"] for m in fold_metrics])),
        "folds": fold_metrics,
    }


def _save_training_metadata(metadata_type: str, payload: dict) -> None:
    """Persist training metadata to the DB if PostgreSQL is available."""
    try:
        from models.database import DATABASE_URL, get_db_context
        if DATABASE_URL.startswith("sqlite"):
            return
        from models.data_store import TrainingMetadata
        with get_db_context() as db:
            row = TrainingMetadata(
                metadata_type=metadata_type,
                payload=json.dumps(payload, default=str),
                created_at=time.time(),
            )
            db.add(row)
            db.commit()
    except Exception as exc:
        logger.warning("DB training metadata write failed: %s", exc)


def run_training(
    epochs: int = 100,
    lr: float = 0.001,
    seq_len: int = config.SEQ_LEN,
    data_path: str | None = None,
    hours: float | None = None,
    resume: bool = True,
    target_mode: str = config.TARGET_MODE_DEFAULT,
    use_live: bool = True,
    min_rmse_margin: float = 0.0,
    models_to_train: list[str] | None = None,
    walk_forward: bool = False,
) -> dict:
    """
    Train all models using the best available data (real > seed).

    Priority: real scraped data > previously built real data > seed data (with warning).
    """
    _set_seed(42)

    # 1. Determine best training data source
    if data_path is None:
        data_path = get_training_data_path()
        print(f"Auto-selected training data: {data_path}")

    if not os.path.exists(data_path):
        print("No training data found. Generating seed data as last-resort fallback...")
        generate_seed_data(config.SEED_DATA_PATH)
        data_path = config.SEED_DATA_PATH

    # 2. Optionally merge live snapshots
    data_summary = {"path": data_path, "rows": 0, "base_rows": 0, "live_rows": 0, "holdout_rows": 0}
    if use_live:
        data_summary = build_training_csv(
            base_path=data_path,
            out_path=config.TRAINING_DATA_PATH,
            holdout_hours=48,
        )
        dataset_path = data_summary["path"]
        print(
            f"Training dataset: rows={data_summary['rows']} "
            f"(base={data_summary['base_rows']}, live={data_summary['live_rows']}, "
            f"holdout={data_summary.get('holdout_rows', 0)} withheld)"
        )
    else:
        dataset_path = data_path

    # 3. Create dataset
    print(f"Loading data from {dataset_path}...")
    dataset = LiquidityDataset(dataset_path, seq_len=seq_len, target_mode=target_mode)
    dataset.save_scaler()
    actual_features = dataset.num_features
    print(f"Dataset: {len(dataset)} samples, {actual_features} features")

    total = len(dataset)
    if total < 32:
        raise ValueError(f"Not enough samples to train: {total}")

    # 4. Temporal split (last 15% for validation — no future leakage)
    split = int(total * 0.85)
    train_set = Subset(dataset, range(split))
    val_set = Subset(dataset, range(split, total))
    print(f"Train: {len(train_set)}, Val: {len(val_set)} (temporal split)")

    train_loader = DataLoader(train_set, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_set, batch_size=64, shuffle=False)

    # 5. Determine which models to train
    if models_to_train is None:
        models_to_train = list(MODEL_REGISTRY.keys())

    start = time.time()
    deadline = (start + hours * 3600.0) if hours else None

    # Divide time budget across models
    per_model_budget = hours / len(models_to_train) if hours and len(models_to_train) > 0 else None

    # 6. Optional walk-forward validation
    wf_results = {}
    if walk_forward:
        print("\n--- Walk-Forward Cross-Validation ---")
        for model_name in models_to_train:
            print(f"\nWalk-forward: {model_name.upper()}")
            model_class = MODEL_REGISTRY[model_name]
            wf = _walk_forward_validate(
                dataset=dataset,
                model_class=model_class,
                num_features=actual_features,
                n_folds=3,
                epochs_per_fold=min(30, epochs),
                lr=lr,
                target_mode=target_mode,
            )
            wf_results[model_name] = wf
            print(f"  {model_name} walk-forward avg RMSE: {wf['avg_rmse']:.3f}")

    # 7. Train each model on full training set
    results = {}
    for model_name in models_to_train:
        print(f"\n{'='*60}")
        print(f"Training {model_name.upper()} model")
        print(f"{'='*60}")

        model_class = MODEL_REGISTRY[model_name]
        model = model_class(num_features=actual_features)

        # Warm-start from existing checkpoint
        model_path = MODEL_PATHS.get(model_name)
        if resume and model_path and os.path.exists(model_path):
            try:
                state = torch.load(model_path, map_location="cpu", weights_only=True)
                model.load_state_dict(state)
                print(f"  Warm-start from {model_path}")
            except Exception as exc:
                print(f"  Warm-start skipped: {exc}")

        model_deadline = None
        if per_model_budget:
            model_deadline = time.time() + per_model_budget * 3600.0

        result = _train_single_model(
            model_name=model_name,
            model=model,
            train_loader=train_loader,
            val_loader=val_loader,
            dataset=dataset,
            train_set_len=len(train_set),
            val_set_len=len(val_set),
            epochs=epochs,
            lr=lr,
            target_mode=target_mode,
            min_rmse_margin=min_rmse_margin,
            deadline=model_deadline,
        )
        results[model_name] = result

        # Save checkpoint
        if result["state"] is not None and model_path:
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            torch.save(result["state"], model_path)
            print(
                f"  Saved -> {model_path}\n"
                f"  Best epoch: {result['epoch']}, "
                f"RMSE: {result['model_metrics']['rmse']:.3f}, "
                f"Beats naive: {result['beats_naive']}"
            )

    # 8. Compute ensemble weights from inverse RMSE
    ensemble_weights = {}
    for name, res in results.items():
        if res["model_metrics"]:
            rmse = res["model_metrics"]["rmse"]
            if rmse > 0:
                ensemble_weights[name] = 1.0 / rmse

    total_w = sum(ensemble_weights.values())
    if total_w > 0:
        for name in ensemble_weights:
            ensemble_weights[name] = round(ensemble_weights[name] / total_w, 4)

    os.makedirs(os.path.dirname(config.ENSEMBLE_WEIGHTS_PATH), exist_ok=True)
    with open(config.ENSEMBLE_WEIGHTS_PATH, "w") as f:
        json.dump({
            "weights": ensemble_weights,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }, f, indent=2)
    print(f"\nEnsemble weights: {ensemble_weights}")

    # 9. Save training metadata
    elapsed = time.time() - start
    meta = {
        "elapsed_s": round(elapsed, 1),
        "epochs_requested": epochs,
        "target_mode": target_mode,
        "dataset_path": dataset_path,
        "dataset_rows": total,
        "num_features": actual_features,
        "train_samples": len(train_set),
        "val_samples": len(val_set),
        "data_summary": data_summary,
        "models": {},
        "ensemble_weights": ensemble_weights,
        "walk_forward": wf_results if walk_forward else None,
    }
    for name, res in results.items():
        meta["models"][name] = {
            "best_epoch": res["epoch"],
            "epochs_run": res["epochs_run"],
            "beats_naive": res["beats_naive"],
            "model_metrics": res["model_metrics"],
            "naive_metrics": res["naive_metrics"],
        }

    # Backwards compatibility: top-level fields for LSTM
    lstm_res = results.get("lstm", {})
    if lstm_res:
        meta["selected_epoch"] = lstm_res.get("epoch")
        meta["selected_beats_naive"] = lstm_res.get("beats_naive")
        meta["selected_model_metrics"] = lstm_res.get("model_metrics")
        meta["selected_naive_metrics"] = lstm_res.get("naive_metrics")
        meta["model_replaced"] = lstm_res.get("state") is not None

    with open(config.META_PATH, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    # Also persist to DB if PostgreSQL is available
    _save_training_metadata("training_meta", meta)
    _save_training_metadata("ensemble_weights", {
        "weights": ensemble_weights,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })

    print(f"\nTraining complete in {elapsed:.1f}s")
    print(f"Metadata saved to {config.META_PATH}")
    return meta


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train liquidity forecasting models")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--seq-len", type=int, default=config.SEQ_LEN)
    parser.add_argument(
        "--data", type=str, default=None,
        help="Override data path (auto-selects real data by default).",
    )
    parser.add_argument("--hours", type=float, default=None, help="Time budget for training.")
    parser.add_argument(
        "--target-mode", choices=["absolute", "delta"], default=config.TARGET_MODE_DEFAULT,
    )
    parser.add_argument("--no-resume", action="store_true", help="Start from scratch.")
    parser.add_argument("--no-live", action="store_true", help="Disable live snapshot merge.")
    parser.add_argument(
        "--models", nargs="+", choices=["lstm", "gru", "transformer"], default=None,
        help="Which models to train (default: all).",
    )
    parser.add_argument(
        "--walk-forward", action="store_true",
        help="Run walk-forward cross-validation before final training.",
    )
    parser.add_argument("--min-rmse-margin", type=float, default=0.0)
    args = parser.parse_args()

    run_training(
        epochs=args.epochs,
        lr=args.lr,
        seq_len=args.seq_len,
        data_path=args.data,
        hours=args.hours,
        resume=not args.no_resume,
        target_mode=args.target_mode,
        use_live=not args.no_live,
        min_rmse_margin=args.min_rmse_margin,
        models_to_train=args.models,
        walk_forward=args.walk_forward,
    )
