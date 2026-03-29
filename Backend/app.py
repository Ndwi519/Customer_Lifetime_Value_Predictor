from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

model  = pickle.load(open("model.pkl", "rb"))
scaler = pickle.load(open("scaler.pkl", "rb"))

# Feature names must match exactly what the scaler was trained with
FEATURES = [
    'Recency',
    'CustomerAge',
    'Frequency',
    'LogMonetary',
    'AvgOrderValue',
    'PurchaseRate',
    'ValueDensity',
    'BasketSize',
    'DiversityScore',
]


def build_features(recency, frequency, monetary):
    customer_age    = recency + 1
    avg_order_value = monetary / (frequency + 1)
    log_monetary    = np.log1p(monetary)
    purchase_rate   = frequency / (customer_age + 1)
    value_density   = monetary / (recency + 1)
    basket_size     = frequency + 1
    diversity_score = frequency / (frequency + 1)

    # Return as DataFrame — column names silence the scaler warning
    return pd.DataFrame([[
        recency,
        customer_age,
        frequency,
        log_monetary,
        avg_order_value,
        purchase_rate,
        value_density,
        basket_size,
        diversity_score,
    ]], columns=FEATURES)


@app.route('/predict', methods=['POST'])
def predict():
    data = request.json

    recency   = float(data["recency"])
    frequency = float(data["frequency"])
    monetary  = float(data["monetary"])

    X    = build_features(recency, frequency, monetary)
    X_sc = scaler.transform(X)

    # Explicitly cast to native Python types — fixes "float32 not JSON serializable"
    pred_class = int(model.predict(X_sc)[0])
    prob       = float(model.predict_proba(X_sc)[0][1])

    category = "High Value" if pred_class == 1 else "Not High Value"
    score    = int(round(prob * 100))

    return jsonify({
        "category":   category,
        "confidence": round(prob, 2),
        "score":      score,
    })


if __name__ == "__main__":
    app.run(debug=True)