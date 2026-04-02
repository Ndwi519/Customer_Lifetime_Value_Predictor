import { useState, useEffect } from "react";
import "./App.css";

/* ── helpers ─────────────────────────────────────── */
function getCatClass(cat) {
  if (cat.includes("Loyal")) return { badge: "seg-loyal", color: "col-loyal" };
  
  // Use startsWith to distinguish "High Value" from "Not High Value"
  if (cat.startsWith("High Value")) {
    if (cat.includes("At Risk") || cat.includes("Churned") || cat.includes("Sleeping"))
      return { badge: "seg-mid", color: "col-mid" };
    return { badge: "seg-high", color: "col-high" };
  }
  return { badge: "seg-low", color: "col-low" };
}

function getCatMeaning(cat) {
  if (cat.includes("Loyal"))
    return "This customer is exceptionally loyal and buys very frequently. Even if their per-order spend is modest, their lifetime volume and reliability are extremely high. Focus on cross-selling to increase their basket size.";

  if (cat.startsWith("High Value")) {
    if (cat.includes("Churned") || cat.includes("Sleeping"))
      return "This was once a very valuable customer, but they haven't purchased in over a year. They are considered 'Lost' or 'Churned'. A major win-back campaign with a high discount is needed.";
    if (cat.includes("At Risk"))
      return "This is a premium customer who is currently drifting away (no purchase in 6+ months). Prioritise re-engagement immediately to avoid permanent churn.";
    return "This customer is among your most valuable and active. They buy often, spend well, and bought recently. Prioritise retention and exclusive rewards.";
  }
  return "This customer shows lower engagement or spend relative to the dataset. Consider a targeted campaign to increase their lifetime value over time.";
}

function scoreLabel(s) {
  if (s >= 80) return { text: "Excellent", cls: "col-high" };
  if (s >= 55) return { text: "Good",      cls: "col-mid"  };
  if (s >= 30) return { text: "Fair",      cls: ""         };
  return              { text: "Low",       cls: "col-low"  };
}

/* ── validation ──────────────────────────────────── */
function validateForm(form) {
  const r = Number(form.recency);
  const f = Number(form.frequency);
  const m = Number(form.monetary);
  if (!form.recency || !form.frequency || !form.monetary)
    return "⚠  Please fill in all three parameters.";
  if (isNaN(r) || isNaN(f) || isNaN(m))
    return "⚠  All values must be numbers.";
  if (r < 0 || f < 0 || m < 0)
    return "⚠  Values cannot be negative.";
  if (!Number.isInteger(r) || r > 3650)
    return "⚠  Recency must be a whole number of days (max 3650).";
  if (!Number.isInteger(f) || f > 10000)
    return "⚠  Frequency must be a whole number of orders (max 10,000).";
  if (m > 100000000)
    return "⚠  Monetary value seems too large. Please check.";
  return null;
}

const CIRC = 282;

const FIELDS = [
  {
    name: "recency",   label: "Recency",   hint: "Days since last purchase",
    placeholder: "e.g. 14",   max: 365,  letter: "R",
    what:    "How recently did the customer buy from you?",
    how:     "Count the number of days between their last invoice date and today.",
    example: "Last purchase: 6 June → today is 20 June → enter 14",
    tip:     "Lower = better. A customer who bought yesterday scores higher than one from 6 months ago.",
  },
  {
    name: "frequency", label: "Frequency", hint: "Number of unique orders",
    placeholder: "e.g. 8",    max: 50,   letter: "F",
    what:    "How many separate times has the customer placed an order?",
    how:     "Count distinct Invoice numbers linked to this Customer ID.",
    example: "Customer placed 8 separate orders → enter 8",
    tip:     "Higher = better. Repeat buyers are more loyal and more valuable.",
  },
  {
    name: "monetary",  label: "Monetary",  hint: "Total lifetime spend in ₹",
    placeholder: "e.g. 4200", max: 50000, letter: "M",
    what:    "How much has the customer spent in total across all orders?",
    how:     "Sum all (Quantity × Price) values across every invoice for that customer.",
    example: "3 orders × avg ₹1,400 = ₹4,200 → enter 4200",
    tip:     "Higher = better. This is the direct revenue the customer has generated.",
  },
];

/* ── Gauge ───────────────────────────────────────── */
function Gauge({ score }) {
  const offset = CIRC - (score / 100) * CIRC;
  return (
    <div className="gauge-wrap">
      <svg className="gauge-svg" viewBox="0 0 108 108">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#fde68a" />
            <stop offset="50%"  stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fdba74" />
          </linearGradient>
        </defs>
        <circle className="gauge-bg"   cx="54" cy="54" r="45" />
        <circle className="gauge-fill" cx="54" cy="54" r="45"
          style={{ strokeDashoffset: offset }} />
      </svg>
      <div className="gauge-center">
        <span className="gauge-pct">{score}</span>
        <span className="gauge-unit">/ 100</span>
      </div>
    </div>
  );
}

/* ── Confidence Bar ──────────────────────────────── */
function ConfidenceBar({ confidence, category }) {
  // Fix: Show certainty in the PREDICTED class.
  // If prob is 24% for High Value, then it's 76% for "Not High Value".
  const prob = Math.round(confidence * 100);
  const isHighValue = category.startsWith("High Value");
  const pct = isHighValue ? prob : (100 - prob);
  
  const color = pct >= 70 ? "var(--success)"
              : pct >= 45 ? "var(--warn)"
              :             "var(--danger)";
  return (
    <div className="conf-bar-wrap">
      <div className="conf-bar-header">
        <span className="conf-bar-label">{isHighValue ? "Certainty: High Value" : "Certainty: Not High Value"}</span>
        <span className="conf-bar-value" style={{ color }}>{pct}%</span>
      </div>
      <div className="conf-bar-track">
        <div
          className="conf-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="conf-bar-note">
        {pct >= 70
          ? "The model is strongly certain about this classification."
          : pct >= 45
          ? "The customer sits near the boundary, but the model leans this way."
          : "Borderline case; the model is relatively unsure."}
      </p>
    </div>
  );
}

/* ── BarRow ──────────────────────────────────────── */
function BarRow({ label, value, max, desc }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="bar-group">
      <div className="bar-row">
        <span className="bar-key">{label}</span>
        <div className="bar-track">
          <div className="bar-fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <span className="bar-num">{Number(value).toLocaleString("en-IN")}</span>
      </div>
      <p className="bar-desc">{desc}</p>
    </div>
  );
}

/* ── FieldCard ───────────────────────────────────── */
function FieldCard({ field, value, onChange, fieldError }) {
  const [open, setOpen] = useState(false);
  const pct = value ? Math.min((Number(value) / field.max) * 100, 100) : 0;
  return (
    <div className={`field-card ${open ? "field-card--open" : ""} ${fieldError ? "field-card--error" : ""}`}>
      <div className="field-header">
        <div className="field-meta">
          <span className="field-name">{field.label}</span>
          <span className="field-hint">{field.hint}</span>
        </div>
        <button type="button" className="help-toggle" onClick={() => setOpen(o => !o)}>
          {open ? "✕ hide" : "? help"}
        </button>
      </div>
      <div className="field-input-area">
        <input
          id={field.name} name={field.name} type="number"
          placeholder={field.placeholder} value={value}
          onChange={onChange} min="0" autoComplete="off"
        />
      </div>
      <div className="field-progress-row">
        <div className="field-progress">
          <div className="field-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className={`field-progress-pct ${pct > 0 ? "active" : ""}`}>
          {pct > 0 ? `${Math.round(pct)}%` : "—"}
        </span>
      </div>
      <div className="field-guide">
        <div className="guide-inner">
          <div className="guide-row"><span className="guide-key">What</span><span className="guide-val">{field.what}</span></div>
          <div className="guide-row"><span className="guide-key">How</span><span className="guide-val">{field.how}</span></div>
          <div className="guide-row"><span className="guide-key">Example</span><span className="guide-val guide-code">{field.example}</span></div>
          <div className="guide-tip"><span className="tip-dot">◆</span>{field.tip}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Professor Modal (local, no API) ─────────────── */
function buildExplanation(form, result) {
  const r   = Number(form.recency);
  const f   = Number(form.frequency);
  const m   = Number(form.monetary);
  const pct = result ? Math.round(result.confidence * 100) : null;

  const rLabel = r <= 14 ? "extremely recent (within 2 weeks)"
               : r <= 30 ? "very recent (within the last month)"
               : r <= 90 ? "moderately recent (1–3 months ago)"
               : r <= 180 ? "somewhat distant (3–6 months ago)"
               :            "quite distant (over 6 months ago)";
  const rSignal = r <= 30
    ? "This is a strong positive signal — the customer is actively engaged."
    : r <= 90 ? "Acceptable, but re-engagement campaigns could help."
    : "The customer may be drifting away and needs attention.";

  const fLabel = f === 1 ? "a one-time buyer"
               : f <= 3  ? "an occasional buyer"
               : f <= 7  ? "a regular buyer"
               : f <= 15 ? "a frequent buyer"
               :           "a highly loyal repeat buyer";
  const fSignal = f >= 8
    ? "High frequency strongly indicates loyalty and trust in your brand."
    : f >= 4 ? "Moderate frequency — growing engagement with potential to increase."
    : "Low frequency — this customer hasn't formed a purchase habit yet.";

  const mFmt   = Number(m).toLocaleString("en-IN");
  const mLabel = m >= 50000 ? "a premium high-spend customer"
               : m >= 10000 ? "a high-value customer"
               : m >= 3000  ? "a mid-range spender"
               : m >= 500   ? "a low-to-mid spender"
               :              "a low-spend customer";
  const mSignal = m >= 10000
    ? "This level of spending makes the customer highly valuable to the business."
    : m >= 3000 ? "There is real value here with room to grow through upselling."
    : "Monetary value is modest — targeted promotions could increase basket size.";

  const modelLogic = `The model is an XGBoost classifier trained on historical e-commerce data. It takes 9 engineered features derived from your 3 inputs — including log-transformed monetary value, purchase rate, value density, and basket size — then scales them and predicts whether this customer belongs to the top 30% (High Value) or bottom 70% (Not High Value) of future spenders.`;

  const scoreReason = pct !== null
    ? `The model returned a ${pct}% probability of High Value. Recency of ${r} days (${r <= 30 ? "boosting" : "reducing"} the score), frequency of ${f} orders (${f >= 5 ? "positive" : "modest"} contribution), and monetary spend of ₹${mFmt} (${m >= 5000 ? "strong" : "moderate"} revenue signal) combined to produce this result.`
    : "Run a prediction first to see the score reasoning.";

  const action = result && result.category === "High Value"
    ? `Since this is a High Value customer, focus on retention: offer exclusive loyalty rewards, early access to new products, and personalised communication. With ${pct}% model confidence, this classification is ${pct >= 70 ? "reliable" : "plausible but worth monitoring"}.`
    : `This customer is currently classified as Not High Value. A low-cost win-back campaign — such as a personalised discount or re-engagement email — is recommended. Monitor their next purchase within 30 days.`;

  return { rLabel, rSignal, fLabel, fSignal, mFmt, mLabel, mSignal, modelLogic, scoreReason, action, pct };
}

function ProfessorModal({ form, result, onClose, aiInsight, aiLoading, onGenerateAi }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 380);
    return () => clearTimeout(t);
  }, []);
  const e = buildExplanation(form, result);

  return (
    <div className="professor-backdrop" onClick={onClose}>
      <div className="professor-modal" onClick={ev => ev.stopPropagation()}>

        <div className="professor-header">
          <div className="professor-title-row">
            <div className="professor-icon">🎓</div>
            <div>
              <h2 className="professor-title">Model Explanation</h2>
              <p className="professor-subtitle">How ValueSight classified this customer</p>
            </div>
          </div>
          <button className="professor-close" onClick={onClose}>✕</button>
        </div>

        <div className="professor-chips">
          <span className="professor-chip"><span className="chip-label">R</span><span className="chip-val">{form.recency} days</span></span>
          <span className="professor-chip"><span className="chip-label">F</span><span className="chip-val">{form.frequency} orders</span></span>
          <span className="professor-chip"><span className="chip-label">M</span><span className="chip-val">₹{Number(form.monetary).toLocaleString("en-IN")}</span></span>
          {result && (
            <>
              <span className="professor-chip professor-chip--result">
                <span className="chip-label">Segment</span>
                <span className="chip-val">{result.category}</span>
              </span>
              <span className="professor-chip professor-chip--result">
                <span className="chip-label">Confidence</span>
                <span className="chip-val">{e.pct}%</span>
              </span>
            </>
          )}
        </div>

        <div className="professor-body">
          {!visible ? (
            <div className="professor-loading">
              <div className="professor-spinner" />
              <p className="professor-loading-text">Building explanation…</p>
            </div>
          ) : (
            <div className="professor-explanation">

              <div className="explain-section">
                <div className="explain-section-title">1. What is Recency (R)?</div>
                <p className="explain-para">Recency measures how many days have passed since the customer last made a purchase. This customer&apos;s recency is <strong>{form.recency} days</strong>, which is {e.rLabel}.</p>
                <p className="explain-signal">{e.rSignal}</p>
              </div>

              <div className="explain-section">
                <div className="explain-section-title">2. What is Frequency (F)?</div>
                <p className="explain-para">Frequency counts how many separate orders the customer has placed in total. With <strong>{form.frequency} orders</strong>, this customer is {e.fLabel}.</p>
                <p className="explain-signal">{e.fSignal}</p>
              </div>

              <div className="explain-section">
                <div className="explain-section-title">3. What is Monetary Value (M)?</div>
                <p className="explain-para">Monetary value is the total spend across all orders. At <strong>₹{e.mFmt}</strong>, this customer is classified as {e.mLabel}.</p>
                <p className="explain-signal">{e.mSignal}</p>
              </div>

              <div className="explain-section">
                <div className="explain-section-title">4. How Does the XGBoost Model Work?</div>
                <p className="explain-para">{e.modelLogic}</p>
              </div>

              {e.pct !== null && (
                <div className="explain-section">
                  <div className="explain-section-title">5. Why This Score &amp; Segment?</div>
                  <p className="explain-para">{e.scoreReason}</p>
                </div>
              )}

              <div className="explain-section explain-section--action">
                <div className="explain-section-title">{e.pct !== null ? "6." : "5."} Recommended Business Action</div>
                <p className="explain-para">{e.action}</p>
              </div>

              {/* EXTRA AI INSIGHT SECTION */}
              <div className="explain-section explain-section--ai">
                <div className="ai-insight-header">
                  <div className="explain-section-title">✨ Extra AI Insight (Grok)</div>
                  {!aiInsight && !aiLoading && (
                    <button className="ai-gen-btn" onClick={onGenerateAi}>
                      Generate AI Summary
                    </button>
                  )}
                </div>
                
                {aiLoading && (
                  <div className="ai-loading-box">
                    <div className="ai-spinner" />
                    <span>Grok is analyzing your data...</span>
                  </div>
                )}

                {aiInsight && (
                  <div className="ai-insight-box">
                    <div className="ai-insight-text">
                      {aiInsight.split("\n").map((line, i) => (
                        <p key={i} style={{ marginBottom: line.trim() === "" ? "1em" : "0.5em" }}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        <div className="professor-footer">
          <p className="professor-footer-note">✦ Local explanation · XGBoost Binary Classifier</p>
          <button className="professor-done" onClick={onClose}>Done</button>
        </div>

      </div>
    </div>
  );
}

/* ── App ─────────────────────────────────────────── */
export default function App() {
  const [form,        setForm]        = useState({ recency: "", frequency: "", monetary: "" });
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [dark,        setDark]        = useState(() => localStorage.getItem("theme") !== "light");
  const [showProf,    setShowProf]    = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [aiInsight,   setAiInsight]   = useState(null);
  const [aiLoading,   setAiLoading]   = useState(false);

  useEffect(() => {
    document.body.className = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const locked = result || showProf;
    document.body.style.overflow = locked ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [result, showProf]);

  const handleChange = (e) => {
    setError("");
    setFieldErrors(prev => ({ ...prev, [e.target.name]: false }));
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      setFieldErrors({ recency: !form.recency, frequency: !form.frequency, monetary: !form.monetary });
      return;
    }
    setLoading(true); setError(""); setFieldErrors({});
    try {
      const apiUrl = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";
      const res = await fetch(`${apiUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recency:   Number(form.recency),
          frequency: Number(form.frequency),
          monetary:  Number(form.monetary),
        }),
      });
      if (!res.ok) throw new Error("Server error");
      setResult(await res.json());
    } catch { setError("⚠  Could not reach the prediction server."); }
    finally  { setLoading(false); }
  };

  const generateAiInsight = async () => {
    if (!result) return;
    setAiLoading(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";
      const res = await fetch(`${apiUrl}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recency:    Number(form.recency),
          frequency:  Number(form.frequency),
          monetary:   Number(form.monetary),
          category:   result.category,
          confidence: Math.round(result.confidence * 100),
        }),
      });
      const data = await res.json();
      if (data.explanation) {
        setAiInsight(data.explanation);
      } else {
        throw new Error(data.error || "AI Generation failed");
      }
    } catch (err) {
      console.error(err);
      setAiInsight("⚠ Could not generate AI insight at this time.");
    } finally {
      setAiLoading(false);
    }
  };

  const cat = result ? getCatClass(result.category) : null;
  const sl  = result ? scoreLabel(result.score)     : null;

  const barDescs = {
    recency:   `${form.recency} days since last purchase — ${Number(form.recency) <= 30 ? "very recent, great sign" : Number(form.recency) <= 90 ? "moderately recent" : "hasn't bought in a while"}`,
    frequency: `Placed ${form.frequency} unique order${Number(form.frequency) === 1 ? "" : "s"} — ${Number(form.frequency) >= 10 ? "highly loyal repeat buyer" : Number(form.frequency) >= 4 ? "moderate engagement" : "low purchase frequency"}`,
    monetary:  `Total spend of ₹${Number(form.monetary).toLocaleString("en-IN")} — ${Number(form.monetary) >= 10000 ? "high-spend customer" : Number(form.monetary) >= 2000 ? "mid-range spender" : "low total spend so far"}`,
  };

  return (
    <div className="app-wrapper">

      {/* HEADER */}
      <header className="app-header">
        <div className="logo-mark">
          <div className="logo-hex">V</div>
          <span className="logo-text">ValueSight</span>
        </div>
        <button className="theme-btn" onClick={() => setDark(d => !d)}>
          {dark ? "☀ Light" : "◑ Dark"}
        </button>
      </header>

      {/* MAIN */}
      <main className="main-content">

        {/* LEFT */}
        <section className="hero-section">
          <div className="eyebrow">Customer Value Analysis</div>
          <h1 className="hero-title">
            Know your<br />customer&apos;s<br /><span>true value.</span>
          </h1>
          <p className="hero-desc">
            Enter three numbers from a customer&apos;s purchase history to instantly
            classify their value segment and loyalty score using an XGBoost model.
            Tap <strong>? help</strong> on any field if you&apos;re unsure what to enter.
          </p>
          <div className="rfm-pills">
            {FIELDS.map(f => (
              <div className="rfm-pill" key={f.name}>
                <p className="pill-title">{f.label}</p>
                <p className="pill-desc">{f.what}</p>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT */}
        <section className="panel-section">
          <div className="card">
            <p className="card-label">
              {"// RFM Parameters — tap "}
              <span className="card-label-accent">? help</span>
              {" for guidance"}
            </p>
            {FIELDS.map(f => (
              <FieldCard
                key={f.name}
                field={f}
                value={form[f.name]}
                onChange={handleChange}
                fieldError={fieldErrors[f.name]}
              />
            ))}
            {error && <p className="error-msg">{error}</p>}
            <button className="predict-btn" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" style={{ width:14, height:14, border:"2px solid rgba(255,255,255,.25)", borderTopColor:"#fff", borderRadius:"50%", display:"inline-block" }} />
                  Classifying
                  <span><span className="dot1">.</span><span className="dot2">.</span><span className="dot3">.</span></span>
                </>
              ) : "Run Prediction →"}
            </button>
            <button className="explain-inline-btn" onClick={() => setShowProf(true)}>
              🎓 Explain how this model works
            </button>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <span>ValueSight · Customer Intelligence</span>
        <span>XGBoost Binary Classifier · Local endpoint</span>
      </footer>

      {/* RESULT OVERLAY */}
      <div className={`result-overlay ${result ? "show" : ""}`}>
        <div className="result-nav">
          <span className="result-nav-label">{"// Prediction Output"}</span>
          <button className="result-back" onClick={() => setResult(null)}>← Back to inputs</button>
        </div>

        {result && sl && cat && (
          <div className="result-content">

            {/* LEFT — gauge + segment */}
            <div>
              <p className="result-eyebrow">Classification Result</p>

              {/* Score + label */}
              <div className="result-score-hero">
                <Gauge score={result.score} />
                <div className="result-score-info">
                  <p className={`gauge-rating ${sl.cls}`}>{sl.text}</p>
                  <p className="gauge-rating-sub">Value Score</p>
                  <p className="gauge-explain-text">
                    {result.score >= 80  ? "Exceptional — worth investing in heavily."
                    : result.score >= 55 ? "Strong customer with clear room to grow."
                    : result.score >= 30 ? "Moderate engagement — nurture carefully."
                    :                     "Low engagement or high churn risk."}
                  </p>
                </div>
              </div>

              {/* Model confidence bar */}
              <ConfidenceBar confidence={result.confidence} category={result.category} />

              {/* Segment */}
              <div className="segment-card" style={{ marginTop: 20 }}>
                <p className="segment-card-label">Customer Segment</p>
                <div className={`result-badge ${cat.badge}`}>
                  <span className="dot" />{result.category}
                </div>
                <p className="segment-meaning">{getCatMeaning(result.category)}</p>
                {result.status !== "Active" && (
                  <div className="status-warning">
                    ⚠️ Current Activity Status: <strong>{result.status}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — breakdown + interpretation */}
            <div>
              <div className="breakdown-card">
                <p className="breakdown-title">Input Breakdown</p>
                <p className="breakdown-sub">How each metric contributed to this prediction</p>
                <BarRow label="Recency"   value={form.recency}   max={365}   desc={barDescs.recency}   />
                <BarRow label="Frequency" value={form.frequency} max={50}    desc={barDescs.frequency} />
                <BarRow label="Monetary"  value={form.monetary}  max={50000} desc={barDescs.monetary}  />
              </div>

              <div className="score-card">
                <p className="score-card-label">Score Interpretation</p>
                <p className="score-card-text">
                  <strong>Score {result.score}/100</strong>
                  {" with "}
                  <strong>{Math.round(result.confidence > 0.5 ? result.confidence * 100 : (1 - result.confidence) * 100)}% model certainty</strong>
                  {" — derived from recency, frequency, and monetary signals. "}
                  {result.score >= 80 ? "Above 80: rare, highly loyal, high-spending customer."
                  : result.score >= 55 ? "55–79: solid, regularly engaging customer."
                  : result.score >= 30 ? "30–54: moderate engagement. Promotions recommended."
                  : "Below 30: low loyalty or churn risk."}
                </p>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* PROFESSOR MODAL */}
      {showProf && (
        <ProfessorModal
          form={form}
          result={result}
          aiInsight={aiInsight}
          aiLoading={aiLoading}
          onGenerateAi={generateAiInsight}
          onClose={() => setShowProf(false)}
        />
      )}

    </div>
  );
}