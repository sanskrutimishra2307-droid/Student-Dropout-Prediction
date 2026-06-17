import os
import csv
import json
import joblib
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import accuracy_score, f1_score
from xgboost import XGBClassifier

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "student_data.csv")
MODEL_DIR = os.path.join(BASE_DIR, "model")

def retrain():
    print("Starting binary model retraining (excl. Enrolled)...")
    
    # Load dataset
    with open(DATASET_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
        
    target_idx = header.index('target')
    feature_names = [col for col in header if col != 'target']
    
    # Exclude Enrolled rows
    X_list = []
    y_list = []
    for row in rows:
        if row[target_idx] == 'Enrolled':
            continue
        feat = [float(row[i]) for i, col in enumerate(header) if col != 'target']
        X_list.append(feat)
        y_list.append(row[target_idx]) # 'Dropout' or 'Graduate'
        
    X = np.array(X_list, dtype=np.float64)
    y = np.array(y_list)
    
    print(f"Cohort size after excluding Enrolled: {len(X)}")
    print(f"  Dropout count: {sum(y == 'Dropout')}")
    print(f"  Graduate count: {sum(y == 'Graduate')}")

    # Encode target
    le = LabelEncoder()
    y_encoded = le.fit_transform(y) # Dropout=0, Graduate=1 (or alphabetical)
    print("Label encoder classes:", le.classes_.tolist())

    # Stratified Train/Test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
    )

    # Scale
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train XGBoost with optimal parameters from experiment
    model = XGBClassifier(
        learning_rate=0.05,
        max_depth=4,
        n_estimators=250,
        subsample=0.8,
        random_state=42,
        eval_metric='logloss'
    )
    model.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred = model.predict(X_test_scaled)
    acc = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average='weighted')
    print(f"\nRetrained Binary Model Metrics:")
    print(f"  Test Accuracy: {acc*100:.2f}%")
    print(f"  Test F1 (weighted): {f1*100:.2f}%")

    # Ensure model directory exists
    os.makedirs(MODEL_DIR, exist_ok=True)

    # Save artifacts
    model_path = os.path.join(MODEL_DIR, "dropout_model.joblib")
    scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")
    le_path = os.path.join(MODEL_DIR, "label_encoder.joblib")
    metadata_path = os.path.join(MODEL_DIR, "metadata.json")

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)
    joblib.dump(le, le_path)

    metadata = {
        "model_name": "XGBoost (Binary)",
        "feature_columns": feature_names,
        "target_classes": le.classes_.tolist(),
        "test_accuracy": float(acc),
        "test_f1_weighted": float(f1)
    }

    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)

    print("\nSuccessfully exported all binary model artifacts to:", MODEL_DIR)

if __name__ == '__main__':
    retrain()
