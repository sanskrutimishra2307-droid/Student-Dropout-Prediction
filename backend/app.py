"""
Student Dropout Prediction System — FastAPI Backend
=====================================================
ML-powered early warning and retention tool.

Loads pre-trained XGBoost artifacts on startup and exposes REST
endpoints for single-student prediction, batch student listing,
dashboard analytics, and health checks.

Endpoints
---------
POST /predict            Predict dropout risk for one student.
GET  /students           List all students with computed risk tiers.
GET  /students/{index}   Get a single student's full prediction.
GET  /dashboard-summary  Aggregate risk statistics for the dashboard.
GET  /health             API and model health check.

Run
---
    uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import csv
import json
import logging
import time
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

# Suppress sklearn warning about feature names when passing numpy arrays.
# Column order is guaranteed by metadata.json — no risk of mismatch.
warnings.filterwarnings(
    "ignore",
    message="X does not have valid feature names",
    category=UserWarning,
    module="sklearn",
)

# Suppress sklearn version mismatch warning for deserialized artifacts.
# StandardScaler and LabelEncoder are stable across sklearn minor versions.
try:
    from sklearn.exceptions import InconsistentVersionWarning
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except ImportError:
    pass
warnings.filterwarnings(
    "ignore",
    message="Trying to unpickle estimator",
    module="sklearn",
)

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("dropout-api")

# ---------------------------------------------------------------------------
# Path Configuration
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "model"
DATASET_PATH = BASE_DIR / "dataset" / "student_data.csv"

# ---------------------------------------------------------------------------
# Constants — Course Code → Human-Readable Name (UCI Dataset)
# ---------------------------------------------------------------------------
COURSE_NAMES: dict[int, str] = {
    33: "Biofuel Production Technologies",
    171: "Animation and Multimedia Design",
    8014: "Social Service (Evening)",
    9003: "Agronomy",
    9070: "Communication Design",
    9085: "Veterinary Nursing",
    9119: "Informatics Engineering",
    9130: "Equiniculture",
    9147: "Management",
    9238: "Social Service",
    9254: "Tourism",
    9500: "Nursing",
    9556: "Oral Hygiene",
    9670: "Advertising and Marketing Management",
    9773: "Journalism and Communication",
    9853: "Basic Education",
    9991: "Management (Evening)",
}

# ---------------------------------------------------------------------------
# Constants — Human-Friendly Feature Labels
# ---------------------------------------------------------------------------
FEATURE_LABELS: dict[str, str] = {
    "Marital Status": "Marital Status",
    "Application mode": "Application Mode",
    "Application order": "Application Priority Order",
    "Course": "Course Enrolled",
    "Daytime/evening attendance": "Attendance Schedule (Day/Evening)",
    "Previous qualification": "Previous Qualification Type",
    "Previous qualification (grade)": "Previous Qualification Grade",
    "Nacionality": "Nationality",
    "Mother's qualification": "Mother's Education Level",
    "Father's qualification": "Father's Education Level",
    "Mother's occupation": "Mother's Occupation",
    "Father's occupation": "Father's Occupation",
    "Admission grade": "Admission Grade",
    "Displaced": "Displaced Student",
    "Educational special needs": "Special Educational Needs",
    "Debtor": "Has Outstanding Debt",
    "Tuition fees up to date": "Tuition Fees Up to Date",
    "Gender": "Gender",
    "Scholarship holder": "Scholarship Holder",
    "Age at enrollment": "Age at Enrollment",
    "International": "International Student",
    "Curricular units 1st sem (credited)": "1st Sem – Units Credited",
    "Curricular units 1st sem (enrolled)": "1st Sem – Units Enrolled",
    "Curricular units 1st sem (evaluations)": "1st Sem – Evaluations",
    "Curricular units 1st sem (approved)": "1st Sem – Units Approved",
    "Curricular units 1st sem (grade)": "1st Sem – Average Grade",
    "Curricular units 1st sem (without evaluations)": "1st Sem – Without Evaluations",
    "Curricular units 2nd sem (credited)": "2nd Sem – Units Credited",
    "Curricular units 2nd sem (enrolled)": "2nd Sem – Units Enrolled",
    "Curricular units 2nd sem (evaluations)": "2nd Sem – Evaluations",
    "Curricular units 2nd sem (approved)": "2nd Sem – Units Approved",
    "Curricular units 2nd sem (grade)": "2nd Sem – Average Grade",
    "Curricular units 2nd sem (without evaluations)": "2nd Sem – Without Evaluations",
    "Unemployment rate": "Unemployment Rate",
    "Inflation rate": "Inflation Rate",
    "GDP": "GDP Growth",
}

# ---------------------------------------------------------------------------
# Constants — Feature Categories for Intervention Mapping
# ---------------------------------------------------------------------------
_ACADEMIC_PERFORMANCE_FEATURES = {
    "Curricular units 1st sem (approved)",
    "Curricular units 1st sem (grade)",
    "Curricular units 2nd sem (approved)",
    "Curricular units 2nd sem (grade)",
    "Curricular units 1st sem (evaluations)",
    "Curricular units 2nd sem (evaluations)",
    "Curricular units 1st sem (without evaluations)",
    "Curricular units 2nd sem (without evaluations)",
    "Curricular units 1st sem (enrolled)",
    "Curricular units 2nd sem (enrolled)",
    "Curricular units 1st sem (credited)",
    "Curricular units 2nd sem (credited)",
}

_FINANCIAL_FEATURES = {
    "Tuition fees up to date",
    "Debtor",
    "Scholarship holder",
}

_ADMISSION_FEATURES = {
    "Admission grade",
    "Previous qualification",
    "Previous qualification (grade)",
    "Application mode",
    "Application order",
    "Course",
}

_PERSONAL_FEATURES = {
    "Age at enrollment",
    "Marital Status",
    "Displaced",
    "International",
    "Nacionality",
    "Gender",
    "Educational special needs",
    "Daytime/evening attendance",
}

_FAMILY_FEATURES = {
    "Mother's qualification",
    "Father's qualification",
    "Mother's occupation",
    "Father's occupation",
}

_MACRO_FEATURES = {
    "Unemployment rate",
    "Inflation rate",
    "GDP",
}

INTERVENTION_RULES: dict[str, dict[str, str]] = {
    "academic_performance": {
        "category": "Academic Performance",
        "action": (
            "Schedule academic counseling session; recommend tutoring or "
            "remedial classes for weak subjects."
        ),
        "urgency": "Immediate – within 7 days",
    },
    "financial": {
        "category": "Financial Difficulties",
        "action": (
            "Refer to financial aid office; verify scholarship eligibility "
            "and tuition payment plan options."
        ),
        "urgency": "Urgent – within 10 days",
    },
    "admission_background": {
        "category": "Academic Background",
        "action": (
            "Assign faculty mentor for academic integration support; "
            "consider bridge/preparatory programme."
        ),
        "urgency": "Within 15 days",
    },
    "personal": {
        "category": "Personal / Demographic Factors",
        "action": (
            "Refer to student counseling cell; explore flexible scheduling "
            "or peer-support programmes."
        ),
        "urgency": "Within 15 days",
    },
    "family_background": {
        "category": "Family Background",
        "action": (
            "Initiate parent/guardian outreach; connect with student support "
            "services for additional resources."
        ),
        "urgency": "Within 20 days",
    },
    "macroeconomic": {
        "category": "Macroeconomic Conditions",
        "action": (
            "Monitor cohort-level trends; consider institutional-level "
            "financial relief or scholarship expansion."
        ),
        "urgency": "Ongoing review",
    },
}

# ---------------------------------------------------------------------------
# Risk Tier Thresholds
# ---------------------------------------------------------------------------
HIGH_RISK_THRESHOLD = 70.0
MEDIUM_RISK_THRESHOLD = 40.0


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class StudentFeatures(BaseModel):
    """Input schema for a single student prediction request.

    All 36 feature columns from the dataset. Accepts both the raw column
    names (with special characters) and numeric values.
    """

    marital_status: float = Field(..., alias="Marital Status")
    application_mode: float = Field(..., alias="Application mode")
    application_order: float = Field(..., alias="Application order")
    course: float = Field(..., alias="Course")
    daytime_evening_attendance: float = Field(
        ..., alias="Daytime/evening attendance"
    )
    previous_qualification: float = Field(..., alias="Previous qualification")
    previous_qualification_grade: float = Field(
        ..., alias="Previous qualification (grade)"
    )
    nacionality: float = Field(..., alias="Nacionality")
    mothers_qualification: float = Field(..., alias="Mother's qualification")
    fathers_qualification: float = Field(..., alias="Father's qualification")
    mothers_occupation: float = Field(..., alias="Mother's occupation")
    fathers_occupation: float = Field(..., alias="Father's occupation")
    admission_grade: float = Field(..., alias="Admission grade")
    displaced: float = Field(..., alias="Displaced")
    educational_special_needs: float = Field(
        ..., alias="Educational special needs"
    )
    debtor: float = Field(..., alias="Debtor")
    tuition_fees_up_to_date: float = Field(
        ..., alias="Tuition fees up to date"
    )
    gender: float = Field(..., alias="Gender")
    scholarship_holder: float = Field(..., alias="Scholarship holder")
    age_at_enrollment: float = Field(..., alias="Age at enrollment")
    international: float = Field(..., alias="International")
    cu_1st_credited: float = Field(
        ..., alias="Curricular units 1st sem (credited)"
    )
    cu_1st_enrolled: float = Field(
        ..., alias="Curricular units 1st sem (enrolled)"
    )
    cu_1st_evaluations: float = Field(
        ..., alias="Curricular units 1st sem (evaluations)"
    )
    cu_1st_approved: float = Field(
        ..., alias="Curricular units 1st sem (approved)"
    )
    cu_1st_grade: float = Field(
        ..., alias="Curricular units 1st sem (grade)"
    )
    cu_1st_without_evaluations: float = Field(
        ..., alias="Curricular units 1st sem (without evaluations)"
    )
    cu_2nd_credited: float = Field(
        ..., alias="Curricular units 2nd sem (credited)"
    )
    cu_2nd_enrolled: float = Field(
        ..., alias="Curricular units 2nd sem (enrolled)"
    )
    cu_2nd_evaluations: float = Field(
        ..., alias="Curricular units 2nd sem (evaluations)"
    )
    cu_2nd_approved: float = Field(
        ..., alias="Curricular units 2nd sem (approved)"
    )
    cu_2nd_grade: float = Field(
        ..., alias="Curricular units 2nd sem (grade)"
    )
    cu_2nd_without_evaluations: float = Field(
        ..., alias="Curricular units 2nd sem (without evaluations)"
    )
    unemployment_rate: float = Field(..., alias="Unemployment rate")
    inflation_rate: float = Field(..., alias="Inflation rate")
    gdp: float = Field(..., alias="GDP")

    model_config = {"populate_by_name": True}


class FactorDetail(BaseModel):
    """A single contributing factor in a prediction explanation."""

    feature: str
    label: str
    contribution_pct: float
    category: str


class InterventionDetail(BaseModel):
    """Recommended intervention action."""

    category: str
    action: str
    urgency: str


class PredictionResponse(BaseModel):
    """Full prediction response for one student."""

    risk_score: float
    risk_tier: str
    probabilities: dict[str, float]
    top_factors: list[FactorDetail]
    intervention: InterventionDetail
    response_window_days: int


class StudentSummary(BaseModel):
    """Compact student record for the listing endpoint."""

    index: int
    course: str
    course_code: int
    gender: str
    age: int
    admission_grade: float
    risk_score: float
    risk_tier: str
    cu_1st_approved: int
    cu_2nd_approved: int


class StudentListResponse(BaseModel):
    """Paginated list of students."""

    total: int
    page: int
    page_size: int
    students: list[StudentSummary]


class RiskTierCounts(BaseModel):
    """Counts per risk tier."""

    low: int
    medium: int
    high: int


class BreakdownItem(BaseModel):
    """Single item in a categorical breakdown."""

    label: str
    total: int
    high: int
    medium: int
    low: int


class DashboardSummaryResponse(BaseModel):
    """Full dashboard summary response."""

    total_students: int
    risk_tiers: RiskTierCounts
    course_breakdown: list[BreakdownItem]
    gender_breakdown: list[BreakdownItem]
    model_accuracy: float
    model_f1: float


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    model_loaded: bool
    model_name: str
    dataset_loaded: bool
    total_students: int
    feature_count: int
    uptime_seconds: float


# ---------------------------------------------------------------------------
# Application State (populated at startup)
# ---------------------------------------------------------------------------
class _AppState:
    """Container for loaded model artifacts and pre-computed data.

    Avoids global mutable state scattered across the module. All fields
    are set once during the lifespan startup and read-only afterwards.
    """

    def __init__(self) -> None:
        self.model: Any = None
        self.scaler: Any = None
        self.label_encoder: Any = None
        self.metadata: dict[str, Any] = {}
        self.feature_columns: list[str] = []
        self.target_classes: list[str] = []
        self.feature_importances: dict[str, float] = {}
        self.dataset: list[dict[str, str]] = []
        self.student_predictions: list[dict[str, Any]] = []
        self.start_time: float = 0.0


state = _AppState()


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
def _classify_risk_tier(score: float) -> str:
    """Map a 0-100 risk score to a human-readable tier label."""
    if score >= HIGH_RISK_THRESHOLD:
        return "High"
    if score >= MEDIUM_RISK_THRESHOLD:
        return "Medium"
    return "Low"


def _get_feature_category(feature_name: str) -> str:
    """Map a raw feature name to its semantic category key."""
    if feature_name in _ACADEMIC_PERFORMANCE_FEATURES:
        return "academic_performance"
    if feature_name in _FINANCIAL_FEATURES:
        return "financial"
    if feature_name in _ADMISSION_FEATURES:
        return "admission_background"
    if feature_name in _PERSONAL_FEATURES:
        return "personal"
    if feature_name in _FAMILY_FEATURES:
        return "family_background"
    if feature_name in _MACRO_FEATURES:
        return "macroeconomic"
    return "personal"  # safe fallback


def _compute_top_factors(
    feature_values: np.ndarray,
    top_n: int = 5,
) -> list[FactorDetail]:
    """Return the top-N globally important features as FactorDetail objects.

    Uses the model's built-in feature importances (gain-based for XGBoost),
    normalized to percentage contributions.
    """
    importances = state.feature_importances
    # Sort by importance descending
    sorted_features = sorted(
        importances.items(), key=lambda item: item[1], reverse=True
    )[:top_n]

    total_importance = sum(v for _, v in sorted_features)
    if total_importance == 0:
        total_importance = 1.0  # prevent division by zero

    factors: list[FactorDetail] = []
    for feature_name, importance in sorted_features:
        category_key = _get_feature_category(feature_name)
        factors.append(
            FactorDetail(
                feature=feature_name,
                label=FEATURE_LABELS.get(feature_name, feature_name),
                contribution_pct=round(
                    (importance / total_importance) * 100, 1
                ),
                category=INTERVENTION_RULES.get(
                    category_key, INTERVENTION_RULES["personal"]
                )["category"],
            )
        )

    return factors


def _get_intervention(top_factors: list[FactorDetail]) -> InterventionDetail:
    """Derive the recommended intervention from the dominant risk factor.

    Uses the category of the single most important feature to select a
    rule-based recommendation.
    """
    if not top_factors:
        rule = INTERVENTION_RULES["academic_performance"]
    else:
        top_feature = top_factors[0].feature
        category_key = _get_feature_category(top_feature)
        rule = INTERVENTION_RULES.get(
            category_key, INTERVENTION_RULES["personal"]
        )

    return InterventionDetail(
        category=rule["category"],
        action=rule["action"],
        urgency=rule["urgency"],
    )


def _get_response_window(risk_score: float) -> int:
    """Return a suggested response window (in days) based on risk score."""
    if risk_score >= 85:
        return 7
    if risk_score >= HIGH_RISK_THRESHOLD:
        return 15
    if risk_score >= MEDIUM_RISK_THRESHOLD:
        return 30
    return 60


def _predict_single(feature_values: np.ndarray) -> PredictionResponse:
    """Run prediction pipeline for a single feature vector.

    1. Scale the features.
    2. Get class probabilities from the model.
    3. Extract the dropout probability as the risk score (0-100%).
    4. Compute top contributing factors.
    5. Generate intervention recommendation.
    """
    # Scale
    scaled = state.scaler.transform(feature_values.reshape(1, -1))

    # Predict probabilities
    probas = state.model.predict_proba(scaled)[0]

    # Map probabilities to class names
    prob_dict = {
        cls: round(float(p) * 100, 2)
        for cls, p in zip(state.target_classes, probas)
    }

    # Dropout probability → risk score
    dropout_idx = state.target_classes.index("Dropout")
    risk_score = round(float(probas[dropout_idx]) * 100, 2)

    risk_tier = _classify_risk_tier(risk_score)
    top_factors = _compute_top_factors(feature_values)
    intervention = _get_intervention(top_factors)
    response_window = _get_response_window(risk_score)

    return PredictionResponse(
        risk_score=risk_score,
        risk_tier=risk_tier,
        probabilities=prob_dict,
        top_factors=top_factors,
        intervention=intervention,
        response_window_days=response_window,
    )


def _row_to_feature_array(row: dict[str, str]) -> np.ndarray:
    """Convert a CSV row dict to a numpy feature array in column order."""
    return np.array(
        [float(row[col]) for col in state.feature_columns], dtype=np.float64
    )


def _precompute_student_predictions() -> list[dict[str, Any]]:
    """Batch-predict all students in the dataset.

    Returns a list of lightweight summary dicts used by the /students and
    /dashboard-summary endpoints. Full prediction details are computed
    on-demand to keep memory usage reasonable.
    """
    logger.info("Pre-computing predictions for %d students…", len(state.dataset))
    start = time.perf_counter()

    # Build feature matrix in one shot
    feature_matrix = np.array(
        [
            [float(row[col]) for col in state.feature_columns]
            for row in state.dataset
        ],
        dtype=np.float64,
    )

    # Batch scale and predict
    scaled_matrix = state.scaler.transform(feature_matrix)
    all_probas = state.model.predict_proba(scaled_matrix)

    dropout_idx = state.target_classes.index("Dropout")
    results: list[dict[str, Any]] = []

    for i, (row, probas) in enumerate(zip(state.dataset, all_probas)):
        risk_score = round(float(probas[dropout_idx]) * 100, 2)
        course_code = int(float(row["Course"]))
        results.append(
            {
                "index": i,
                "course": COURSE_NAMES.get(course_code, f"Course {course_code}"),
                "course_code": course_code,
                "gender": "Male" if row["Gender"] == "1" else "Female",
                "age": int(float(row["Age at enrollment"])),
                "admission_grade": round(float(row["Admission grade"]), 1),
                "risk_score": risk_score,
                "risk_tier": _classify_risk_tier(risk_score),
                "cu_1st_approved": int(
                    float(row["Curricular units 1st sem (approved)"])
                ),
                "cu_2nd_approved": int(
                    float(row["Curricular units 2nd sem (approved)"])
                ),
            }
        )

    elapsed = time.perf_counter() - start
    logger.info("Pre-computation complete in %.2fs", elapsed)
    return results


def _load_dataset() -> list[dict[str, str]]:
    """Load the CSV dataset into a list of row dicts."""
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset not found at {DATASET_PATH}")

    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    # Filter out Enrolled students since model is binary (Dropout vs Graduate)
    rows = [row for row in rows if row["target"] != "Enrolled"]

    logger.info("Loaded dataset: %d rows from %s (after filtering 'Enrolled')", len(rows), DATASET_PATH.name)
    return rows


def _load_model_artifacts() -> None:
    """Load all model artifacts from disk into application state."""
    # Metadata
    metadata_path = MODEL_DIR / "metadata.json"
    if not metadata_path.exists():
        raise FileNotFoundError(f"Metadata not found at {metadata_path}")

    with open(metadata_path, "r", encoding="utf-8") as f:
        state.metadata = json.load(f)

    state.feature_columns = state.metadata["feature_columns"]
    state.target_classes = state.metadata["target_classes"]

    # Model
    model_path = MODEL_DIR / "dropout_model.joblib"
    state.model = joblib.load(model_path)
    logger.info("Loaded model: %s from %s", type(state.model).__name__, model_path.name)

    # Scaler
    scaler_path = MODEL_DIR / "scaler.joblib"
    state.scaler = joblib.load(scaler_path)
    logger.info("Loaded scaler: %s", type(state.scaler).__name__)

    # Label Encoder
    le_path = MODEL_DIR / "label_encoder.joblib"
    state.label_encoder = joblib.load(le_path)
    logger.info(
        "Loaded label encoder — classes: %s",
        state.label_encoder.classes_.tolist(),
    )

    # Feature importances (gain-based for XGBoost)
    raw_importances = state.model.feature_importances_
    total = float(raw_importances.sum()) or 1.0
    state.feature_importances = {
        col: float(imp / total)
        for col, imp in zip(state.feature_columns, raw_importances)
    }

    logger.info(
        "Model ready — %d features, %d classes, accuracy=%.2f%%",
        len(state.feature_columns),
        len(state.target_classes),
        state.metadata.get("test_accuracy", 0) * 100,
    )


# ---------------------------------------------------------------------------
# Lifespan — Startup / Shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all artifacts on startup; clean up on shutdown."""
    state.start_time = time.time()

    logger.info("Starting up — loading model artifacts…")
    _load_model_artifacts()

    logger.info("Loading dataset…")
    state.dataset = _load_dataset()

    logger.info("Pre-computing student predictions…")
    state.student_predictions = _precompute_student_predictions()

    logger.info("✓ Backend ready. Serving %d students.", len(state.dataset))
    yield

    logger.info("Shutting down…")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Student Dropout Prediction API",
    description=(
        "ML-powered early warning system for student retention. "
        "Predicts dropout risk, explains contributing factors, "
        "and recommends interventions."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the frontend (served from file:// or any local dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.post(
    "/predict",
    response_model=PredictionResponse,
    summary="Predict dropout risk for a single student",
    tags=["Prediction"],
)
async def predict(student: StudentFeatures) -> PredictionResponse:
    """Accept a single student's 36 feature values and return:

    - **risk_score** (0-100%): Dropout probability.
    - **risk_tier**: "Low", "Medium", or "High".
    - **probabilities**: Per-class probability breakdown.
    - **top_factors**: Top 5 contributing features with explanations.
    - **intervention**: Recommended action based on dominant factor.
    - **response_window_days**: Suggested timeframe to act.
    """
    try:
        # Build feature array in the correct column order
        values = [
            getattr(student, field_name)
            for field_name in StudentFeatures.model_fields
        ]
        feature_array = np.array(values, dtype=np.float64)

        return _predict_single(feature_array)

    except Exception as exc:
        logger.exception("Prediction failed")
        raise HTTPException(
            status_code=500,
            detail=f"Prediction error: {exc}",
        ) from exc


@app.get(
    "/students",
    response_model=StudentListResponse,
    summary="List all students with risk tiers",
    tags=["Students"],
)
async def list_students(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(
        50, ge=1, le=500, description="Students per page"
    ),
    risk_tier: str | None = Query(
        None,
        description="Filter by risk tier: 'High', 'Medium', or 'Low'",
    ),
    course: str | None = Query(
        None, description="Filter by course name (partial match)"
    ),
    search: str | None = Query(
        None, description="Search by student index"
    ),
    sort_by: str = Query(
        "risk_score",
        description="Sort field: 'risk_score', 'age', 'admission_grade'",
    ),
    sort_order: str = Query(
        "desc", description="Sort order: 'asc' or 'desc'"
    ),
) -> StudentListResponse:
    """Return a paginated, filterable, sortable list of students.

    Each student record includes their computed risk score and tier,
    basic profile fields, and course information.
    """
    results = state.student_predictions

    # -- Filters --
    if risk_tier:
        tier_upper = risk_tier.strip().capitalize()
        results = [s for s in results if s["risk_tier"] == tier_upper]

    if course:
        course_lower = course.strip().lower()
        results = [
            s for s in results if course_lower in s["course"].lower()
        ]

    if search:
        try:
            idx = int(search)
            results = [s for s in results if s["index"] == idx]
        except ValueError:
            results = []

    # -- Sorting --
    valid_sort_fields = {"risk_score", "age", "admission_grade", "index"}
    sort_field = sort_by if sort_by in valid_sort_fields else "risk_score"
    reverse = sort_order.lower() != "asc"
    results = sorted(results, key=lambda s: s[sort_field], reverse=reverse)

    # -- Pagination --
    total = len(results)
    start = (page - 1) * page_size
    end = start + page_size
    page_results = results[start:end]

    return StudentListResponse(
        total=total,
        page=page,
        page_size=page_size,
        students=[StudentSummary(**s) for s in page_results],
    )


@app.get(
    "/students/{index}",
    response_model=PredictionResponse,
    summary="Get full prediction for a single student by index",
    tags=["Students"],
)
async def get_student_prediction(index: int) -> PredictionResponse:
    """Return the full prediction details for a student identified by
    their dataset index (0-based).
    """
    if index < 0 or index >= len(state.dataset):
        raise HTTPException(
            status_code=404,
            detail=f"Student index {index} not found. Valid range: 0-{len(state.dataset) - 1}",
        )

    row = state.dataset[index]
    feature_array = _row_to_feature_array(row)
    return _predict_single(feature_array)


@app.get(
    "/students/{index}/features",
    response_model=dict[str, float],
    summary="Get raw feature values for a single student by index",
    tags=["Students"],
)
async def get_student_features(index: int) -> dict[str, float]:
    """Return the raw features for a student by index, to pre-populate the predictor simulator."""
    if index < 0 or index >= len(state.dataset):
        raise HTTPException(
            status_code=404,
            detail=f"Student index {index} not found. Valid range: 0-{len(state.dataset) - 1}",
        )

    row = state.dataset[index]
    # Convert all string values in the row dict to float
    return {col: float(val) for col, val in row.items() if col != "target"}


@app.get(
    "/dashboard-summary",
    response_model=DashboardSummaryResponse,
    summary="Dashboard aggregate statistics",
    tags=["Dashboard"],
)
async def dashboard_summary() -> DashboardSummaryResponse:
    """Return aggregate counts for the admin dashboard:

    - Total students and risk tier breakdown (Low / Medium / High).
    - Course-wise risk breakdown.
    - Gender-wise risk breakdown.
    - Model performance metrics.
    """
    predictions = state.student_predictions
    total = len(predictions)

    # -- Risk tier counts --
    tier_counts = {"Low": 0, "Medium": 0, "High": 0}
    for s in predictions:
        tier_counts[s["risk_tier"]] += 1

    # -- Course breakdown --
    course_data: dict[str, dict[str, int]] = {}
    for s in predictions:
        name = s["course"]
        if name not in course_data:
            course_data[name] = {"total": 0, "High": 0, "Medium": 0, "Low": 0}
        course_data[name]["total"] += 1
        course_data[name][s["risk_tier"]] += 1

    course_breakdown = sorted(
        [
            BreakdownItem(
                label=name,
                total=data["total"],
                high=data["High"],
                medium=data["Medium"],
                low=data["Low"],
            )
            for name, data in course_data.items()
        ],
        key=lambda item: item.total,
        reverse=True,
    )

    # -- Gender breakdown --
    gender_data: dict[str, dict[str, int]] = {}
    for s in predictions:
        g = s["gender"]
        if g not in gender_data:
            gender_data[g] = {"total": 0, "High": 0, "Medium": 0, "Low": 0}
        gender_data[g]["total"] += 1
        gender_data[g][s["risk_tier"]] += 1

    gender_breakdown = [
        BreakdownItem(
            label=g,
            total=data["total"],
            high=data["High"],
            medium=data["Medium"],
            low=data["Low"],
        )
        for g, data in gender_data.items()
    ]

    return DashboardSummaryResponse(
        total_students=total,
        risk_tiers=RiskTierCounts(
            low=tier_counts["Low"],
            medium=tier_counts["Medium"],
            high=tier_counts["High"],
        ),
        course_breakdown=course_breakdown,
        gender_breakdown=gender_breakdown,
        model_accuracy=round(
            state.metadata.get("test_accuracy", 0) * 100, 2
        ),
        model_f1=round(
            state.metadata.get("test_f1_weighted", 0) * 100, 2
        ),
    )


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="API health check",
    tags=["System"],
)
async def health_check() -> HealthResponse:
    """Confirm the API is running, the model is loaded, and the
    dataset is available.
    """
    return HealthResponse(
        status="healthy",
        model_loaded=state.model is not None,
        model_name=state.metadata.get("model_name", "Unknown"),
        dataset_loaded=len(state.dataset) > 0,
        total_students=len(state.dataset),
        feature_count=len(state.feature_columns),
        uptime_seconds=round(time.time() - state.start_time, 2),
    )


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
