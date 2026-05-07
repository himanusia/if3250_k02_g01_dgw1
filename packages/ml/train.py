from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import StratifiedKFold, train_test_split


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET_PATH = REPO_ROOT / "Cleaned Rate Card.csv"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION = "lightgbm-huber-v1"
BARTER_PROXY_IDR = 150_000

PLATFORM_FEATURES = ("instagram", "tiktok", "other")
CREATOR_TYPE_FEATURES = ("cat", "dog_small_breed", "dog_medium_breed", "dog_large_breed", "other")
FOLLOWER_TIER_FEATURES = ("nano", "micro", "macro", "mega")


@dataclass
class PreparedRow:
    creator_type: str
    feature_vector: list[float]
    follower_tier: str
    followers: int
    is_barter: bool
    line_number: int
    platform: str
    rate_card_idr: int
    rate_card_raw: str
    username: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean the Digiwonder rate-card dataset and train a gradient boosting regressor."
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Path to the CSV dataset. Defaults to the repository root Cleaned Rate Card.csv.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for cleaned data, reports, and model artifacts.",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Fraction of trainable rows to reserve for evaluation. Default: 0.2",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="Random seed for the train/test split and model training. Default: 42",
    )
    parser.add_argument(
        "--min-trainable-rows",
        type=int,
        default=30,
        help="Fail fast if too few usable rows remain after cleaning. Default: 30",
    )
    parser.add_argument(
        "--barter-proxy-idr",
        type=int,
        default=BARTER_PROXY_IDR,
        help=f"Proxy IDR value assigned to BARTER rate-card rows. Default: {BARTER_PROXY_IDR}",
    )
    return parser.parse_args()


def clean_text(value: str | None) -> str:
    if value is None:
        return ""

    return " ".join(value.strip().split())


def slugify_label(value: str) -> str:
    normalized = clean_text(value).lower()
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized)
    normalized = normalized.strip("_")
    return normalized or "other"


def parse_int_like(value: str | None) -> int | None:
    if value is None:
        return None

    digits = re.sub(r"[^\d]", "", value)

    if not digits:
        return None

    parsed = int(digits)
    return parsed if parsed > 0 else None


def parse_rate_card(value: str | None, barter_proxy: int) -> tuple[int, bool] | None:
    if value and value.strip().upper() == "BARTER":
        return (barter_proxy, True)
    parsed = parse_int_like(value)
    if parsed is None:
        return None
    return (parsed, False)


def normalize_platform(value: str | None) -> str:
    normalized = slugify_label(value)

    if normalized in {"instagram", "tiktok"}:
        return normalized

    return "other"


def normalize_creator_type(value: str | None) -> str:
    normalized = slugify_label(value)

    if normalized in CREATOR_TYPE_FEATURES:
        return normalized

    return "other"


def get_follower_tier(followers: int) -> str:
    if followers >= 1_000_000:
        return "mega"
    if followers >= 100_000:
        return "macro"
    if followers >= 10_000:
        return "micro"
    return "nano"


def build_feature_vector(followers: int, platform: str, creator_type: str, is_barter: bool = False) -> tuple[list[float], str]:
    follower_tier = get_follower_tier(followers)
    feature_vector: list[float] = [
        float(followers),
        float(math.log1p(followers)),
    ]

    for candidate in PLATFORM_FEATURES:
        feature_vector.append(1.0 if platform == candidate else 0.0)

    for candidate in CREATOR_TYPE_FEATURES:
        feature_vector.append(1.0 if creator_type == candidate else 0.0)

    for candidate in FOLLOWER_TIER_FEATURES:
        feature_vector.append(1.0 if follower_tier == candidate else 0.0)

    feature_vector.append(1.0 if is_barter else 0.0)

    return feature_vector, follower_tier


def feature_names() -> list[str]:
    names = ["followers", "log_followers"]
    names.extend(f"platform__{candidate}" for candidate in PLATFORM_FEATURES)
    names.extend(f"creator_type__{candidate}" for candidate in CREATOR_TYPE_FEATURES)
    names.extend(f"follower_tier__{candidate}" for candidate in FOLLOWER_TIER_FEATURES)
    names.append("is_barter")
    return names


def load_and_clean_dataset(dataset_path: Path, barter_proxy: int = BARTER_PROXY_IDR) -> tuple[list[PreparedRow], list[dict[str, Any]]]:
    prepared_rows: list[PreparedRow] = []
    dropped_rows: list[dict[str, Any]] = []

    with dataset_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)

        for index, row in enumerate(reader, start=2):
            username = clean_text(row.get("username"))
            followers = parse_int_like(row.get("Followers"))
            rate_card_raw = clean_text(row.get("Rate Card"))
            rate_card_result = parse_rate_card(row.get("Rate Card"), barter_proxy)

            drop_reasons: list[str] = []

            if followers is None:
                drop_reasons.append("missing_or_invalid_followers")

            if rate_card_result is None:
                drop_reasons.append("missing_or_invalid_rate_card")

            if drop_reasons:
                dropped_rows.append(
                    {
                        "line_number": index,
                        "username": username,
                        "platform": clean_text(row.get("Platform")),
                        "creator_type": clean_text(row.get("Jenis Kreator")),
                        "drop_reasons": ",".join(drop_reasons),
                    }
                )
                continue

            rate_card_idr, is_barter = rate_card_result
            platform = normalize_platform(row.get("Platform"))
            creator_type = normalize_creator_type(row.get("Jenis Kreator"))
            vector, follower_tier = build_feature_vector(followers, platform, creator_type, is_barter)

            prepared_rows.append(
                PreparedRow(
                    creator_type=creator_type,
                    feature_vector=vector,
                    follower_tier=follower_tier,
                    followers=followers,
                    is_barter=is_barter,
                    line_number=index,
                    platform=platform,
                    rate_card_idr=rate_card_idr,
                    rate_card_raw=rate_card_raw,
                    username=username,
                )
            )

    return prepared_rows, dropped_rows


def save_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def rounded_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    log_true = np.log1p(y_true)
    log_pred = np.log1p(np.maximum(y_pred, 0))
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 2),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 2),
        "rmse_log": round(float(np.sqrt(mean_squared_error(log_true, log_pred))), 4),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
        "r2_log": round(float(r2_score(log_true, log_pred)), 4),
    }


def make_regressor(random_state: int) -> LGBMRegressor:
    return LGBMRegressor(
        objective="huber",
        alpha=0.9,          # linear penalty above 90th-percentile absolute error — suppresses outlier pull
        n_estimators=500,
        learning_rate=0.05,
        max_depth=4,
        num_leaves=15,
        min_child_samples=10,
        subsample=0.8,
        subsample_freq=1,
        colsample_bytree=0.8,
        reg_alpha=0.05,
        reg_lambda=0.1,
        random_state=random_state,
        verbose=-1,
    )


def predict_currency(model: LGBMRegressor, features: np.ndarray) -> np.ndarray:
    predictions = np.expm1(model.predict(features))
    return np.maximum(predictions, 0)


def cross_validation_metrics(features: np.ndarray, target: np.ndarray, strata: np.ndarray, random_state: int) -> dict[str, float]:
    # n_splits=3: with ~237 rows across 4 quantile strata, 3 folds keeps ≥15 samples per stratum per test fold
    splitter = StratifiedKFold(n_splits=3, shuffle=True, random_state=random_state)
    mae_scores: list[float] = []
    rmse_scores: list[float] = []
    rmse_log_scores: list[float] = []
    r2_scores: list[float] = []
    r2_log_scores: list[float] = []

    for fold_index, (train_indices, test_indices) in enumerate(splitter.split(features, strata), start=1):
        fold_model = make_regressor(random_state + fold_index)
        fold_model.fit(features[train_indices], np.log1p(target[train_indices]))
        fold_predictions = predict_currency(fold_model, features[test_indices])

        y_t, y_p = target[test_indices], fold_predictions
        log_t = np.log1p(y_t)
        log_p = np.log1p(np.maximum(y_p, 0))

        mae_scores.append(mean_absolute_error(y_t, y_p))
        rmse_scores.append(np.sqrt(mean_squared_error(y_t, y_p)))
        rmse_log_scores.append(np.sqrt(mean_squared_error(log_t, log_p)))
        r2_scores.append(r2_score(y_t, y_p))
        r2_log_scores.append(r2_score(log_t, log_p))

    return {
        "mae": round(float(np.mean(mae_scores)), 2),
        "rmse": round(float(np.mean(rmse_scores)), 2),
        "rmse_log": round(float(np.mean(rmse_log_scores)), 4),
        "r2": round(float(np.mean(r2_scores)), 4),
        "r2_log": round(float(np.mean(r2_log_scores)), 4),
    }


def export_onnx_if_available(model: LGBMRegressor, output_dir: Path, input_width: int) -> dict[str, Any]:
    artifact_path = output_dir / "rate-card-model.onnx"

    try:
        from onnxmltools import convert_lightgbm
        from onnxmltools.convert.common.data_types import FloatTensorType
    except ModuleNotFoundError as exc:
        return {
            "exported": False,
            "path": None,
            "reason": f"missing_dependency:{exc.name}",
        }

    onnx_model = convert_lightgbm(model.booster_, initial_types=[("features", FloatTensorType([None, input_width]))])
    artifact_path.write_bytes(onnx_model.SerializeToString())

    return {
        "exported": True,
        "path": str(artifact_path.relative_to(REPO_ROOT)),
        "reason": None,
    }


def main() -> None:
    args = parse_args()
    dataset_path = args.dataset.resolve()
    output_dir = args.output_dir.resolve()

    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    prepared_rows, dropped_rows = load_and_clean_dataset(dataset_path, args.barter_proxy_idr)

    if len(prepared_rows) < args.min_trainable_rows:
        raise RuntimeError(
            f"Only {len(prepared_rows)} trainable rows remain after cleaning; expected at least {args.min_trainable_rows}."
        )

    X = np.asarray([row.feature_vector for row in prepared_rows], dtype=np.float32)
    y = np.asarray([row.rate_card_idr for row in prepared_rows], dtype=np.float64)

    # Stratify on log-quantile bins of the target so every price range appears in every split/fold.
    # Follower-tier stratification fails here because tier doesn't map cleanly to rate card value
    # and the mega tier (6 samples) is too small for n_splits>3.
    strata = np.digitize(np.log1p(y), np.percentile(np.log1p(y), [25, 50, 75]))

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=args.test_size,
        random_state=args.random_state,
        stratify=strata,
    )

    model = make_regressor(args.random_state)
    model.fit(X_train, np.log1p(y_train))

    train_predictions = predict_currency(model, X_train)
    test_predictions = predict_currency(model, X_test)

    cleaned_rows = [
        {
            "line_number": row.line_number,
            "username": row.username,
            "platform": row.platform,
            "creator_type": row.creator_type,
            "followers": row.followers,
            "follower_tier": row.follower_tier,
            "rate_card_idr": row.rate_card_idr,
            "rate_card_raw": row.rate_card_raw,
            "is_barter": row.is_barter,
        }
        for row in prepared_rows
    ]

    save_csv(output_dir / "cleaned-training-data.csv", cleaned_rows)
    save_csv(output_dir / "dropped-rows.csv", dropped_rows)

    model_bundle_path = output_dir / "rate-card-model.joblib"
    metadata_path = output_dir / "training-report.json"

    metrics = {
        "cross_validation": cross_validation_metrics(X, y, strata, args.random_state),
        "train": rounded_metrics(y_train, train_predictions),
        "test": rounded_metrics(y_test, test_predictions),
    }

    onnx_export = export_onnx_if_available(model, output_dir, X.shape[1])

    model_bundle = {
        "feature_names": feature_names(),
        "model": model,
        "model_version": MODEL_VERSION,
        "prediction_inverse_transform": "expm1",
        "target_transform": "log1p",
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(model_bundle, model_bundle_path)

    drop_reason_counts = Counter()

    for row in dropped_rows:
        for reason in str(row["drop_reasons"]).split(","):
            if reason:
                drop_reason_counts[reason] += 1

    barter_rows_imputed = sum(1 for row in prepared_rows if row.is_barter)

    report = {
        "artifacts": {
            "cleaned_training_data": str((output_dir / "cleaned-training-data.csv").relative_to(REPO_ROOT)),
            "dropped_rows": str((output_dir / "dropped-rows.csv").relative_to(REPO_ROOT)) if dropped_rows else None,
            "joblib_model_bundle": str(model_bundle_path.relative_to(REPO_ROOT)),
            "onnx_model": onnx_export["path"],
        },
        "dataset": {
            "path": str(dataset_path.relative_to(REPO_ROOT)),
            "total_rows": len(prepared_rows) + len(dropped_rows),
            "trainable_rows": len(prepared_rows),
            "dropped_rows": len(dropped_rows),
            "barter_rows_imputed": barter_rows_imputed,
            "barter_proxy_idr": args.barter_proxy_idr,
            "drop_reason_counts": dict(sorted(drop_reason_counts.items())),
        },
        "feature_names": feature_names(),
        "metrics": metrics,
        "model_version": MODEL_VERSION,
        "onnx_export": onnx_export,
        "target_transform": "log1p",
        "training_config": {
            "min_trainable_rows": args.min_trainable_rows,
            "random_state": args.random_state,
            "test_size": args.test_size,
        },
    }

    metadata_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
