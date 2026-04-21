"""Plan 9c — Forecast dataclasses (Holt-Winters + AIC).

Tableau parity (Build_Tableau §XIII.3): exponential smoothing tries 8
ETS combinations from the Hyndman taxonomy and selects by AIC. We
surface alpha/beta/gamma + SSE/AIC/RMSE/MAE/MAPE per candidate so the
user sees why one model won.

Wire-only (not proto-backed) — same precedent as Plan 9b TrendFitResult.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


_VALID_UNITS = {
    "auto", "years", "quarters", "months", "weeks",
    "days", "hours", "minutes", "seconds",
}
_VALID_MODELS = {"auto", "additive", "multiplicative", "custom"}
_VALID_LEVELS = {0.90, 0.95, 0.99}
_VALID_KINDS = {"AAA", "AAM", "AMA", "AMM", "ANA", "ANM", "ANN", "MNN"}


@dataclass(frozen=True, slots=True)
class ForecastSpec:
    forecast_length: int
    forecast_unit: str
    model: str
    season_length: Optional[int]
    confidence_level: float
    ignore_last: int

    def validate(self) -> None:
        if self.forecast_length <= 0:
            raise ValueError(f"forecast_length must be > 0, got {self.forecast_length}")
        if self.forecast_unit not in _VALID_UNITS:
            raise ValueError(
                f"forecast_unit must be one of {sorted(_VALID_UNITS)}, got {self.forecast_unit!r}"
            )
        if self.model not in _VALID_MODELS:
            raise ValueError(
                f"model must be one of {sorted(_VALID_MODELS)}, got {self.model!r}"
            )
        if self.confidence_level not in _VALID_LEVELS:
            raise ValueError(
                f"confidence_level must be one of {sorted(_VALID_LEVELS)}, got {self.confidence_level}"
            )
        if self.ignore_last < 0:
            raise ValueError(f"ignore_last must be >= 0, got {self.ignore_last}")
        if self.model in {"additive", "multiplicative", "custom"} and self.season_length is None:
            raise ValueError("season_length required when model != 'auto'")
        if self.season_length is not None and self.season_length < 2:
            raise ValueError(f"season_length must be >= 2, got {self.season_length}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "forecast_length": self.forecast_length,
            "forecast_unit": self.forecast_unit,
            "model": self.model,
            "season_length": self.season_length,
            "confidence_level": self.confidence_level,
            "ignore_last": self.ignore_last,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ForecastSpec":
        return cls(
            forecast_length=int(d["forecast_length"]),
            forecast_unit=str(d.get("forecast_unit", "auto")),
            model=str(d.get("model", "auto")),
            season_length=(int(d["season_length"]) if d.get("season_length") is not None else None),
            confidence_level=float(d.get("confidence_level", 0.95)),
            ignore_last=int(d.get("ignore_last", 0)),
        )


@dataclass(frozen=True, slots=True)
class ForecastModelFit:
    kind: str
    alpha: Optional[float]
    beta: Optional[float]
    gamma: Optional[float]
    sse: float
    aic: float
    rmse: float
    mae: float
    mape: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "kind": self.kind, "alpha": self.alpha, "beta": self.beta, "gamma": self.gamma,
            "sse": self.sse, "aic": self.aic, "rmse": self.rmse, "mae": self.mae, "mape": self.mape,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ForecastModelFit":
        return cls(
            kind=str(d["kind"]),
            alpha=(float(d["alpha"]) if d.get("alpha") is not None else None),
            beta=(float(d["beta"]) if d.get("beta") is not None else None),
            gamma=(float(d["gamma"]) if d.get("gamma") is not None else None),
            sse=float(d["sse"]), aic=float(d["aic"]), rmse=float(d["rmse"]),
            mae=float(d["mae"]), mape=float(d["mape"]),
        )


@dataclass(frozen=True, slots=True)
class ForecastResult:
    best_model: ForecastModelFit
    forecasts: List[Dict[str, float]] = field(default_factory=list)
    actuals: List[Dict[str, float]] = field(default_factory=list)
    model_candidates: List[ForecastModelFit] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "best_model": self.best_model.to_dict(),
            "forecasts": [dict(p) for p in self.forecasts],
            "actuals": [dict(p) for p in self.actuals],
            "model_candidates": [m.to_dict() for m in self.model_candidates],
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ForecastResult":
        return cls(
            best_model=ForecastModelFit.from_dict(d["best_model"]),
            forecasts=[dict(p) for p in d.get("forecasts", [])],
            actuals=[dict(p) for p in d.get("actuals", [])],
            model_candidates=[ForecastModelFit.from_dict(m) for m in d.get("model_candidates", [])],
        )
