from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import numpy as np
import pandas as pd
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
# In production, set FRONTEND_URL in .env to your Vercel URL
# Use * temporarily to ensure Vercel can connect regardless of the specific preview URL
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize xAI Client (Grok)
XAI_API_KEY = os.getenv("GROK_API_KEY")
client = OpenAI(
    api_key=XAI_API_KEY,
    base_url="https://api.x.ai/v1",
) if XAI_API_KEY else None

# Helper to get paths relative to this file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_path(filename):
    return os.path.join(BASE_DIR, filename)

model  = pickle.load(open(get_path("model.pkl"), "rb"))
scaler = pickle.load(open(get_path("scaler.pkl"), "rb"))

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
    # Fix: Estimate tenure (age) better. If frequency > 1, assume orders are spread.
    # If we only have R, F, M, a simple estimate for tenure is (Recency + (Frequency * 20))
    # This avoids the "new customer" bug for high-frequency users.
    customer_age = recency + (frequency * 20) if frequency > 1 else recency + 1
    
    avg_order_value = monetary / (frequency + 1)
    log_monetary    = np.log1p(monetary)
    purchase_rate   = frequency / (customer_age + 1)
    value_density   = monetary / (recency + 1)
    basket_size     = frequency + 1  # Simplified
    diversity_score = frequency / (frequency + 1) # Simplified

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


@app.route('/')
def home():
    return jsonify({
        "status": "online",
        "message": "CLV Prediction API is running",
        "endpoints": ["/predict", "/explain"]
    })


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

    # BUSINESS LOGIC OVERRIDE: Record Status & Penalize high recency
    status = "Active"
    score  = int(round(prob * 100))

    if recency > 365:
        status = "Churned/Sleeping"
        score  = int(score * 0.5) 
    elif recency > 180:
        status = "At Risk"
        score  = int(score * 0.75)
    elif recency > 90:
        status = "Inactive"
        score  = int(score * 0.9)
    
    # LOYALTY ANCHOR: Respect Frequency (F) bias fix
    is_loyal = False
    if frequency >= 50:
        is_loyal = True
        score = max(score, 75) # Safety Floor for Super-Loyalists
    elif frequency >= 25:
        is_loyal = True
        score = max(score, 60) # Safety Floor for Loyalists

    # Final category depends on model, recency, and loyalty
    category = "High Value" if pred_class == 1 else "Not High Value"
    
    if is_loyal:
        if monetary < 5000: # High Vol, Low Ticket
            category = "Loyal Customer (High Frequency)"
        else:
            category = "High Value" # If F is high and M is high, they are High Value
    
    # DECISIVE CERTAINTY: If they are churned/at-risk, we are more certain they aren't 'Active' High Value
    if status == "Churned/Sleeping" or status == "At Risk":
        if not is_loyal: # Don't penalize confidence for Loyalists
            if pred_class == 0: 
                prob = 0.05 # 95% certainty they are NOT high value
            else:
                prob = 0.40 # 60% certainty they are borderline/at-risk High Value
        
        if pred_class == 1:
            category = f"{category} ({status})"

    return jsonify({
        "category":   category,
        "confidence": round(prob, 2),
        "score":      max(0, min(100, score)), # Ensure [0,100]
        "status":     status,
    })


@app.route('/explain', methods=['POST'])
def explain():
    if not client:
        print("DEBUG: GROK_API_KEY is missing in environment variables!")
        return jsonify({"error": "Grok API not configured on server"}), 500

    data = request.json
    r = data.get("recency")
    f = data.get("frequency")
    m = data.get("monetary")
    cat = data.get("category")
    conf = data.get("confidence")

    prompt = f"""
    As a Senior Business Growth Consultant, provide a concise, high-impact analysis for a customer with:
    - Recency: {r} days
    - Frequency: {f} orders
    - Monetary: ₹{m}
    - Segment: {cat}
    - Model Confidence: {conf}%

    Give 3 bullet points:
    1. Key Insight: What does this specific data tell us about the customer's behavior?
    2. Prediction Context: Why is the model likely classifying them as {cat}?
    3. Action Plan: What is the single best strategy to grow this customer's value?
    Keep the tone professional and expert.
    """

    try:
        completion = client.chat.completions.create(
            model="grok-beta",
            messages=[
                {"role": "system", "content": "You are a professional Business Growth Consultant specializing in RFM analysis."},
                {"role": "user", "content": prompt},
            ],
        )
        return jsonify({"explanation": completion.choices[0].message.content})
    except Exception as e:
        print(f"DEBUG: Grok AI Error: {str(e)}")
        return jsonify({"error": f"AI Generation failed: {str(e)}"}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)