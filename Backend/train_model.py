import pandas as pd
import numpy as np
import pickle

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report

from xgboost import XGBClassifier

print("🔥 FINAL CLV MODEL (BINARY HIGH ACCURACY)\n")

# -----------------------------
# LOAD DATA
# -----------------------------
df = pd.read_csv("data.csv", encoding='ISO-8859-1')

# -----------------------------
# CLEAN DATA
# -----------------------------
df = df.dropna(subset=['Customer ID'])
df = df[(df['Quantity'] > 0) & (df['Price'] > 0)]

df['TotalPrice'] = df['Quantity'] * df['Price']
df['InvoiceDate'] = pd.to_datetime(df['InvoiceDate'])

# -----------------------------
# TIME SPLIT (NO LEAKAGE)
# -----------------------------
split_date = df['InvoiceDate'].quantile(0.7)

past = df[df['InvoiceDate'] <= split_date]
future = df[df['InvoiceDate'] > split_date]

# -----------------------------
# CUSTOMER FEATURES (PAST ONLY)
# -----------------------------
snapshot = past['InvoiceDate'].max() + pd.Timedelta(days=1)

customer = past.groupby('Customer ID').agg({
    'InvoiceDate': [
        lambda x: (snapshot - x.max()).days,   # Recency
        lambda x: (x.max() - x.min()).days     # CustomerAge
    ],
    'Invoice': 'nunique',
    'TotalPrice': ['sum', 'mean'],
    'StockCode': 'nunique',
    'Quantity': 'sum'
})

customer.columns = [
    'Recency',
    'CustomerAge',
    'Frequency',
    'Monetary',
    'AvgOrderValue',
    'ProductDiversity',
    'TotalQuantity'
]

# -----------------------------
# FEATURE ENGINEERING
# -----------------------------
customer['LogMonetary'] = np.log1p(customer['Monetary'])
customer['PurchaseRate'] = customer['Frequency'] / (customer['CustomerAge'] + 1)
customer['ValueDensity'] = customer['Monetary'] / (customer['Recency'] + 1)
customer['BasketSize'] = customer['TotalQuantity'] / (customer['Frequency'] + 1)
customer['DiversityScore'] = customer['ProductDiversity'] / (customer['Frequency'] + 1)

# -----------------------------
# FUTURE TARGET (REAL CLV)
# -----------------------------
future_clv = future.groupby('Customer ID')['TotalPrice'].sum()

data = customer.merge(future_clv, on='Customer ID', how='inner')
data.rename(columns={'TotalPrice': 'FutureCLV'}, inplace=True)

data = data.dropna()
data = data[data['FutureCLV'] > 0]

# -----------------------------
# BINARY SEGMENTATION (KEY FIX)
# -----------------------------
threshold = data['FutureCLV'].quantile(0.7)

def segment(x):
    if x >= threshold:
        return 1   # High Value
    else:
        return 0   # Not High

data['Segment'] = data['FutureCLV'].apply(segment)

# check balance
print("📊 Class Distribution:")
print(data['Segment'].value_counts())

# -----------------------------
# FEATURES / TARGET
# -----------------------------
features = [
    'Recency',
    'CustomerAge',
    'Frequency',
    'LogMonetary',
    'AvgOrderValue',
    'PurchaseRate',
    'ValueDensity',
    'BasketSize',
    'DiversityScore'
]

X = data[features]
y = data['Segment']

# -----------------------------
# SCALE
# -----------------------------
scaler = StandardScaler()
X = scaler.fit_transform(X)

# -----------------------------
# SPLIT
# -----------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.25, random_state=42, stratify=y
)

# -----------------------------
# MODEL
# -----------------------------
model = XGBClassifier(
    n_estimators=150,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    reg_alpha=0.5,
    reg_lambda=1.5,
    random_state=42,
    eval_metric='logloss'
)

# -----------------------------
# TRAIN
# -----------------------------
model.fit(X_train, y_train)

# -----------------------------
# EVALUATE
# -----------------------------
train_pred = model.predict(X_train)
test_pred = model.predict(X_test)

train_acc = accuracy_score(y_train, train_pred)
test_acc = accuracy_score(y_test, test_pred)

print("\n" + "=" * 60)
print("📊 FINAL BINARY MODEL PERFORMANCE")
print("=" * 60)

print(f"Training Accuracy : {train_acc * 100:.2f}%")
print(f"Testing  Accuracy : {test_acc * 100:.2f}%")

print("\nDetailed Report:")
print(classification_report(y_test, test_pred, zero_division=0))

print("=" * 60)

# -----------------------------
# FEATURE IMPORTANCE
# -----------------------------
print("\n🔍 Feature Importance")
for name, val in zip(features, model.feature_importances_):
    print(f"{name}: {val:.3f}")

# -----------------------------
# SAVE
# -----------------------------
pickle.dump(model, open("model.pkl", "wb"))
pickle.dump(scaler, open("scaler.pkl", "wb"))

print("\n✅ FINAL BINARY MODEL SAVED\n")