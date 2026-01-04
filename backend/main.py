import os
from flask import Flask, request, jsonify, abort
from flask_cors import CORS
from firebase_init import db

# Gemini SDK
from google import genai
from google.genai.types import UserContent, ModelContent, Part

app = Flask(__name__)
CORS(app)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def get_uid():
  uid = request.args.get("uid")
  if not uid:
    abort(400, description="uid is required")
  return uid

# ---------- TRANSACTIONS ----------

@app.route("/api/transactions", methods=["POST"])
def add_transaction():
  uid = get_uid()
  data = request.get_json()
  tx = {
    "date": data["date"],
    "type": data["type"],
    "category": data["category"],
    "description": data["description"],
    "amount": float(data["amount"]),
  }
  db.collection("users").document(uid).collection("transactions").add(tx)
  return jsonify({"status": "ok"}), 201

@app.route("/api/transactions", methods=["GET"])
def list_transactions():
  uid = get_uid()
  docs = (
    db.collection("users")
      .document(uid)
      .collection("transactions")
      .order_by("date")
      .stream()
  )
  items = [{**d.to_dict(), "id": d.id} for d in docs]
  return jsonify(items)

@app.route("/api/transactions/<tx_id>", methods=["DELETE"])
def delete_transaction(tx_id):
  uid = get_uid()
  doc_ref = (
    db.collection("users")
      .document(uid)
      .collection("transactions")
      .document(tx_id)
  )
  doc_ref.delete()
  return jsonify({"status": "deleted"}), 200

@app.route("/api/transactions/<tx_id>", methods=["PUT"])
def update_transaction(tx_id):
  uid = get_uid()
  data = request.get_json()
  doc_ref = (
    db.collection("users")
      .document(uid)
      .collection("transactions")
      .document(tx_id)
  )

  update_data = {}
  for field in ["date", "type", "category", "description", "amount"]:
    if field in data:
      update_data[field] = data[field]
  if "amount" in update_data:
    update_data["amount"] = float(update_data["amount"])

  doc_ref.update(update_data)
  return jsonify({"status": "updated"}), 200

# ---------- SUMMARY ----------

@app.route("/api/summary", methods=["GET"])
def summary():
  uid = get_uid()
  docs = (
    db.collection("users")
      .document(uid)
      .collection("transactions")
      .stream()
  )
  balance = 0.0
  income = 0.0
  spending = 0.0
  for d in docs:
    tx = d.to_dict()
    amt = float(tx.get("amount", 0))
    if tx.get("type") == "income":
      income += amt
      balance += amt
    elif tx.get("type") == "expense":
      spending += amt
      balance -= amt
  return jsonify(
    {
      "currentBalance": balance,
      "totalIncome": income,
      "totalSpending": spending,
    }
  )

@app.route("/api/summary/categories", methods=["GET"])
def category_summary():
  uid = get_uid()
  docs = (
    db.collection("users")
      .document(uid)
      .collection("transactions")
      .stream()
  )

  categories = {}
  for d in docs:
    tx = d.to_dict()
    if tx.get("type") != "expense":
      continue
    cat = tx.get("category", "Uncategorized")
    amount = float(tx.get("amount", 0))
    categories[cat] = categories.get(cat, 0.0) + amount

  items = [{"category": cat, "total": total} for cat, total in categories.items()]
  return jsonify(items)

# ---------- GOALS (MONTHLY LIMITS) ----------

@app.route("/api/goals", methods=["GET"])
def list_goals():
  uid = get_uid()
  docs = (
    db.collection("users")
      .document(uid)
      .collection("goals")
      .stream()
  )
  items = [{**d.to_dict(), "id": d.id} for d in docs]
  return jsonify(items)

@app.route("/api/goals", methods=["POST"])
def add_goal():
  uid = get_uid()
  data = request.get_json()
  goal = {
    "name": data["name"],
    "category": data.get("category", "all"),
    "month": data["month"],  # "YYYY-MM"
    "limitAmount": float(data["limitAmount"]),
  }
  db.collection("users").document(uid).collection("goals").add(goal)
  return jsonify({"status": "ok"}), 201

@app.route("/api/goals/with-progress", methods=["GET"])
def goals_with_progress():
  uid = get_uid()
  goals_ref = (
    db.collection("users")
      .document(uid)
      .collection("goals")
      .stream()
  )
  goals = [{**g.to_dict(), "id": g.id} for g in goals_ref]

  tx_ref = (
    db.collection("users")
      .document(uid)
      .collection("transactions")
      .stream()
  )
  txs = [t.to_dict() for t in tx_ref]

  for goal in goals:
    cat = goal.get("category", "all")
    month = goal["month"]  # "YYYY-MM"
    spent = 0.0
    for tx in txs:
      if tx.get("type") != "expense":
        continue
      date_str = tx.get("date")
      if not date_str or not date_str.startswith(month):
        continue
      if cat != "all" and tx.get("category") != cat:
        continue
      spent += float(tx.get("amount", 0))
    goal["spentAmount"] = spent

  return jsonify(goals)

# ---------- AI INSIGHTS (card + bell) ----------

@app.route("/api/ai/insights", methods=["GET"])
def ai_insights():
  uid = get_uid()
  tx_ref = (
    db.collection("users")
      .document(uid)
      .collection("transactions")
      .stream()
  )
  txs = [t.to_dict() for t in tx_ref]

  goals_ref = (
    db.collection("users")
      .document(uid)
      .collection("goals")
      .stream()
  )
  goals = [{**g.to_dict(), "id": g.id} for g in goals_ref]

  total_income = 0.0
  total_expense = 0.0
  by_category = {}

  for tx in txs:
    amt = float(tx.get("amount", 0))
    if tx.get("type") == "income":
      total_income += amt
    elif tx.get("type") == "expense":
      total_expense += amt
      cat = tx.get("category", "other")
      by_category[cat] = by_category.get(cat, 0.0) + amt

  if total_income == 0 and total_expense == 0:
    summary = "No transactions yet. Add income and expenses to get insights."
  else:
    balance_delta = total_income - total_expense
    if balance_delta >= 0:
      summary = (
        f"Your income exceeds expenses by ₹{balance_delta:.0f} "
        f"for the current period."
      )
    else:
      summary = (
        f"Your expenses exceed income by ₹{abs(balance_delta):.0f}. "
        "Reduce non‑essential spending to avoid cash‑flow stress."
      )

  suggestions = []
  alerts = []

  high_flex_cats = ["entertainment", "shopping", "Food", "food"]
  flex_spend = sum(
    amt for cat, amt in by_category.items() if cat in high_flex_cats
  )
  flex_ratio = (flex_spend / total_income * 100) if total_income > 0 else 0
  if total_income > 0 and flex_ratio > 30:
    suggestions.append(
      f"Entertainment and shopping are about {flex_ratio:.0f}% of income. "
      "Try to keep them under 30% and move the difference into savings."
    )
    alerts.append(
      {
        "type": "warning",
        "message": "High lifestyle spending detected (entertainment/shopping).",
      }
    )

  for goal in goals:
    limit = float(goal.get("limitAmount", 0))
    cat = goal.get("category", "all")
    month = goal.get("month")
    spent = 0.0
    for tx in txs:
      if tx.get("type") != "expense":
        continue
      date_str = tx.get("date")
      if not date_str or not month or not date_str.startswith(month):
        continue
      if cat != "all" and tx.get("category") != cat:
        continue
      spent += float(tx.get("amount", 0))
    ratio = (spent / limit * 100) if limit > 0 else 0

    if limit > 0 and ratio >= 100:
      alerts.append(
        {
          "type": "danger",
          "message": f"You have exceeded the limit for '{goal.get('name')}' "
                     f"({ratio:.0f}% of monthly limit).",
        }
      )
    elif limit > 0 and ratio >= 80:
      alerts.append(
        {
          "type": "warning",
          "message": f"'{goal.get('name')}' is at {ratio:.0f}% of its monthly limit.",
        }
      )

  if total_income > 0:
    target_savings = total_income * 0.2
    if (total_income - total_expense) < target_savings:
      suggestions.append(
        "Aim to save at least 20% of income. Trim one or two discretionary "
        "categories next month to reach this level."
      )

  return jsonify(
    {
      "summary": summary,
      "suggestions": suggestions,
      "alerts": alerts,
    }
  )

# ---------- AI CHAT (Gemini) ----------

@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
  uid = get_uid()
  data = request.get_json() or {}
  user_message = data.get("message", "").strip()
  history = data.get("history", [])

  if not user_message:
    return jsonify({"error": "message is required"}), 400

  tx_ref = (
    db.collection("users")
      .document(uid)
      .collection("transactions")
      .stream()
  )
  txs = [t.to_dict() for t in tx_ref]

  goal_docs = (
    db.collection("users")
      .document(uid)
      .collection("goals")
      .stream()
  )
  goals = [g.to_dict() for g in goal_docs]

  total_income = 0.0
  total_expense = 0.0
  by_category = {}
  for tx in txs:
    amt = float(tx.get("amount", 0))
    if tx.get("type") == "income":
      total_income += amt
    elif tx.get("type") == "expense":
      total_expense += amt
      cat = tx.get("category", "other")
      by_category[cat] = by_category.get(cat, 0.0) + amt

  context_text = (
    f"Total income: ₹{total_income:.0f}. "
    f"Total expenses: ₹{total_expense:.0f}. "
    "Spending by category: " +
    ", ".join(f"{cat}=₹{amt:.0f}" for cat, amt in by_category.items())
  )

  goals_text = " | ".join(
    f"{g.get('name')} (cat={g.get('category')}, month={g.get('month')}, limit=₹{g.get('limitAmount')})"
    for g in goals
  ) or "No monthly goals defined."

  system_prompt = (
    "You are a helpful personal finance assistant for an Indian user. "
    "Use the data I give you (income, expenses, goals) to answer questions. "
    "Give specific, practical suggestions. Keep answers short (2–4 sentences).\n\n"
    f"Current snapshot:\n{context_text}\nGoals: {goals_text}"
  )

  gemini_history = []
  gemini_history.append(UserContent(parts=[Part(text=system_prompt)]))

  for turn in history:
    role = turn.get("role")
    content = turn.get("content")
    if not content:
      continue
    if role == "user":
      gemini_history.append(UserContent(parts=[Part(text=content)]))
    elif role == "assistant":
      gemini_history.append(ModelContent(parts=[Part(text=content)]))

  try:
    chat = client.chats.create(
      model="gemini-2.5-flash",
      history=gemini_history,
    )
    response = chat.send_message(user_message)
    answer = response.text
  except Exception as e:
    print("Gemini error:", e)
    return jsonify({"error": "AI request failed"}), 500

  return jsonify({"reply": answer})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)))

