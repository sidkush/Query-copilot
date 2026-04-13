"""ML model catalog -- maps task types to candidate models with configs."""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ModelConfig:
    name: str
    task_type: str
    library: str
    class_path: str
    default_params: dict = field(default_factory=dict)
    description: str = ""


CLASSIFICATION_MODELS = [
    ModelConfig("XGBoost", "classification", "xgboost", "xgboost.XGBClassifier",
                {"n_estimators": 100, "max_depth": 6, "learning_rate": 0.1, "use_label_encoder": False, "eval_metric": "logloss"},
                "Gradient boosting -- best for structured/tabular data"),
    ModelConfig("LightGBM", "classification", "lightgbm", "lightgbm.LGBMClassifier",
                {"n_estimators": 100, "max_depth": -1, "learning_rate": 0.1, "verbose": -1},
                "Fast gradient boosting -- good with categoricals"),
    ModelConfig("Random Forest", "classification", "sklearn", "sklearn.ensemble.RandomForestClassifier",
                {"n_estimators": 100, "max_depth": None, "random_state": 42},
                "Ensemble -- interpretable, robust baseline"),
    ModelConfig("Logistic Regression", "classification", "sklearn", "sklearn.linear_model.LogisticRegression",
                {"max_iter": 1000, "random_state": 42},
                "Linear -- fast, interpretable, good baseline"),
]

REGRESSION_MODELS = [
    ModelConfig("XGBoost", "regression", "xgboost", "xgboost.XGBRegressor",
                {"n_estimators": 100, "max_depth": 6, "learning_rate": 0.1},
                "Gradient boosting regressor"),
    ModelConfig("LightGBM", "regression", "lightgbm", "lightgbm.LGBMRegressor",
                {"n_estimators": 100, "learning_rate": 0.1, "verbose": -1},
                "Fast gradient boosting regressor"),
    ModelConfig("Random Forest", "regression", "sklearn", "sklearn.ensemble.RandomForestRegressor",
                {"n_estimators": 100, "random_state": 42},
                "Ensemble regressor"),
    ModelConfig("Linear Regression", "regression", "sklearn", "sklearn.linear_model.LinearRegression",
                {}, "Linear baseline"),
]

CLUSTERING_MODELS = [
    ModelConfig("KMeans", "clustering", "sklearn", "sklearn.cluster.KMeans",
                {"n_clusters": 5, "random_state": 42, "n_init": 10},
                "Centroid-based clustering"),
    ModelConfig("DBSCAN", "clustering", "sklearn", "sklearn.cluster.DBSCAN",
                {"eps": 0.5, "min_samples": 5},
                "Density-based -- finds arbitrary shapes"),
]

ANOMALY_MODELS = [
    ModelConfig("Isolation Forest", "anomaly", "sklearn", "sklearn.ensemble.IsolationForest",
                {"n_estimators": 100, "contamination": 0.1, "random_state": 42},
                "Tree-based anomaly detector"),
    ModelConfig("Local Outlier Factor", "anomaly", "sklearn", "sklearn.neighbors.LocalOutlierFactor",
                {"n_neighbors": 20, "contamination": 0.1},
                "Distance-based outlier detection"),
]

MODEL_CATALOG = {
    "classification": CLASSIFICATION_MODELS,
    "regression": REGRESSION_MODELS,
    "clustering": CLUSTERING_MODELS,
    "anomaly": ANOMALY_MODELS,
}


def get_models_for_task(task_type: str) -> list[ModelConfig]:
    return MODEL_CATALOG.get(task_type, [])


def instantiate_model(config: ModelConfig, params: dict = None) -> Any:
    import importlib
    parts = config.class_path.rsplit(".", 1)
    module = importlib.import_module(parts[0])
    cls = getattr(module, parts[1])
    merged_params = {**config.default_params, **(params or {})}
    return cls(**merged_params)
