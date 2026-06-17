# RetentaShield — Student Dropout Prediction & Retention System

RetentaShield is an ML-powered early warning and student retention tool designed for educational institutions. It analyzes historical student datasets to predict dropout risk, explain the top contributing factors behind the risk, and suggest tailored interventions to prevent student dropouts.

---

## 🔗 Live Deployments

* **Live Dashboard (Netlify)**: [https://student-dropout.netlify.app/](https://student-dropout.netlify.app/)
* **Live API Backend (Render)**: [https://dropout-backend-qed7.onrender.com/health](https://dropout-backend-qed7.onrender.com/health) (Swagger UI available at `/docs`)

---


## 🚀 Key Features

1. **Early Risk Alert Dashboard**: Real-time KPI summaries for total cohort, high risk, medium risk, and low risk distributions.
2. **Explainable AI (XAI)**: Displays relative contribution percentages for the top factors contributing to a student's risk level.
3. **Intervention Engine**: Generates action strategies and urgency frames based on the student's primary risk indicators (Academic, Financial, Family, etc.).
4. **Interactive Predictor Simulator**: Switch between tabs (Curricular Performance, Demographics, Financials, Family Background) and simulate risk scores in real-time, with templates prefilled from existing student cohorts.
5. **Interactive Data Analytics**: Stacked bar charts of course-wise risk and doughnut charts of gender proportions powered by Chart.js.

---

## 🛠 Technology Stack

* **ML Model**: XGBoost Classifier (binary: *Dropout*, *Graduate*) saved via `joblib`.
* **Backend API**: FastAPI (Python 3.10+), Uvicorn, Pandas, Scikit-learn, Numpy.
* **Frontend Client**: Vanilla HTML5, Vanilla CSS3 (with CSS Variables & Glassmorphic accents), Vanilla JavaScript (ES6+), Chart.js (via CDN), Lucide Icons (via CDN).

---

## 📂 Project Structure

```
student-dropout-prediction/
├── dataset/
│   └── student_data.csv          # 4,424 rows × 37 UCI feature columns
├── model/
│   ├── dropout_model.joblib      # XGBoost Classifier
│   ├── scaler.joblib             # StandardScaler fitted on training split
│   ├── label_encoder.joblib      # Target label encoder (Dropout, Graduate)
│   └── metadata.json             # Feature lists, target classes, accuracy, F1 metric
├── backend/
│   ├── app.py                    # Main FastAPI service
│   └── requirements.txt          # Python dependencies
├── frontend/
│   ├── index.html                # Roster UI & Detail/Simulator Modals
│   ├── style.css                 # Clean, responsive styling & radial progress gauges
│   └── script.js                 # API bindings, event handlers, Chart.js loaders
├── render.yaml                   # Infrastructure-as-code configuration for Render Blueprints
├── netlify.toml                  # Netlify deployment configuration for static hosting
└── README.md                     # Documentation
```

---

## ⚡ Setup & Run Instructions

### 1. Start the Backend API

Go to the `backend` folder, install the dependencies, and launch the server using `uvicorn`:

```bash
# Navigate to the backend directory
cd backend

# Install dependencies (ensure Python 3.10+ is installed)
pip install -r requirements.txt

# Start the FastAPI uvicorn server on port 8000
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The API will start at `http://localhost:8000`. You can inspect the interactive OpenAPI Swagger documentation at `http://localhost:8000/docs`.

### 2. Launch the Frontend Client

The frontend is built using standard Vanilla Web Technologies (HTML, CSS, JS) and does not require building or compile-time packaging:

* You can open [frontend/index.html](file:///d:/Student_DropOut_Prediction/frontend/index.html) directly in any modern browser.
* Alternatively, run a lightweight local static web server to avoid CORS issues:

```bash
# Navigate to the frontend directory
cd frontend

# Python 3 static server
python -m http.server 3000
```
Open your browser and navigate to `http://localhost:3000`.

---

## 🔌 API Documentation

| Endpoint | Method | Response | Description |
| --- | --- | --- | --- |
| `/health` | `GET` | JSON | Checks server & ML model load status. |
| `/dashboard-summary` | `GET` | JSON | Aggregated totals, course, gender distributions, and model scores. |
| `/students` | `GET` | JSON | Paginated, sortable student list with risk scores & course names. |
| `/students/{index}` | `GET` | JSON | Complete risk assessment, probabilities, factors, and intervention. |
| `/students/{index}/features` | `GET` | JSON | Returns raw feature key-values for predictor template population. |
| `/predict` | `POST` | JSON | Submits student feature payloads and returns retention evaluations. |

---

## 🌐 Production Deployment

This project is pre-configured for automated one-click deployments.

### Option A: Render Blueprints (Backend + Frontend)
1. Push this project to a GitHub repository.
2. Log in to [Render](https://render.com) and go to **Blueprints**.
3. Click **New Blueprint Instance** and connect your repository.
4. Render will read [render.yaml](file:///d:/Student_DropOut_Prediction/render.yaml) and automatically deploy:
   * **Backend API** at `https://dropout-backend-qed7.onrender.com`
5. Go to your frontend directory [script.js](file:///d:/Student_DropOut_Prediction/frontend/script.js#L6) and verify `PRODUCTION_API_URL` matches this URL.

### Option B: Netlify (Static Frontend Only)
If hosting your frontend separately:
1. Log in to [Netlify](https://netlify.com) and click **Add new site** -> **Import from Git**.
2. Connect your GitHub repository.
3. Netlify will read [netlify.toml](file:///d:/Student_DropOut_Prediction/netlify.toml) and publish the `frontend/` directory automatically.
4. Set up your backend on Render (configured at `https://dropout-backend-qed7.onrender.com`), and verify `PRODUCTION_API_URL` in `script.js`.
