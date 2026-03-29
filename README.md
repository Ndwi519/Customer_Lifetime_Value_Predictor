# ValueSight: Customer Lifetime Value (CLV) Predictor

ValueSight is an AI-powered intelligence dashboard that classifies customers into high-value and low-value segments based on their purchase history. It uses an **XGBoost machine learning model** to provide real-time predictions and loyalty scores.

![Project Preview](frontend/src/logo.svg) <!-- Replace with a screenshot if available -->

## 🚀 Features
- **Real-time CLV Prediction**: Input Recency, Frequency, and Monetary (RFM) metrics to get a segment classification.
- **Loyalty Score**: A 0-100 gauge reflecting the customer's predicted future value.
- **Model Explanation**: A "Professor" mode that explains how the model interpreted specific customer signals.
- **Modern UI**: Clean, responsive dashboard with dark mode support.

## 🛠️ Tech Stack
- **Frontend**: React.js, Vanilla CSS.
- **Backend**: Flask (Python), Scikit-Learn, XGBoost.
- **Data Science**: Pandas, NumPy.

## 📦 Setup & Installation

### 1. Prerequisites
- Python 3.8+
- Node.js & npm

### 2. Backend Setup
```bash
cd Backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```
The backend will run on `http://127.0.0.1:5000`.

### 3. Frontend Setup
```bash
cd frontend
npm install
npm start
```
The dashboard will be available at `http://localhost:3000`.

## 📜 Project Structure
- `Backend/`: Flask API, pre-trained model (`model.pkl`), and training scripts.
- `frontend/`: React components and UI logic.
- `README.md`: This file.

