"""Eatzy recommendation pipeline — capstone demo scale.

Implements the CLAUDE.md User Vector approach:
  1. Food Vectors : TF-IDF over each item's ingredients + tags + category
  2. User Vector  : quantity-weighted mean of the food vectors the user ordered
  3. Score        : cosine similarity between User Vector and every Food Vector
  4. Rank & filter: drop allergens / dietary conflicts / over-budget, take top-N

Also provides:
  - similar_foods()       : content-based "Similar Foods" (item -> items)
  - because_you_ordered() : collaborative filtering via item co-occurrence
                            across users' order histories

Data: CSV fixtures in ml/data/, exported from src/lib/mock-data.ts.
ponytail: swap load_data() to Supabase queries (menu_items, order_items)
when the DB is live — everything below the loader stays the same.

Run:  python recommend.py   (prints demo output and self-checks)
"""

from __future__ import annotations  # PEP 604 unions on Python 3.9

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pathlib import Path

DATA = Path(__file__).parent / "data"


# ── 1. Load ──────────────────────────────────────────────────────────────────

def load_data():
    items = pd.read_csv(DATA / "menu_items.csv").fillna("")
    orders = pd.read_csv(DATA / "orders.csv")
    return items, orders


# ── 2. Food Vectors (TF-IDF) ─────────────────────────────────────────────────

def build_food_vectors(items: pd.DataFrame):
    """One text document per item: ingredients + tags + category."""
    docs = (
        items["ingredients"].str.replace("|", " ", regex=False)
        + " " + items["tags"].str.replace("|", " ", regex=False)
        + " " + items["category"]
    )
    vectorizer = TfidfVectorizer()
    matrix = vectorizer.fit_transform(docs)  # shape: (n_items, n_terms)
    return matrix


# ── 3. Similar Foods (content-based) ─────────────────────────────────────────

def similar_foods(item_id: str, items: pd.DataFrame, food_vecs, k: int = 3):
    """Top-k items most similar to item_id by TF-IDF cosine."""
    idx = items.index[items["id"] == item_id][0]
    scores = cosine_similarity(food_vecs[idx], food_vecs).ravel()
    scores[idx] = -1  # never recommend the item itself
    top = scores.argsort()[::-1][:k]
    return items.iloc[top][["id", "name"]].assign(score=scores[top])


# ── 4. User Vector + personalised ranking ────────────────────────────────────

def user_vector(user_id: str, items: pd.DataFrame, orders: pd.DataFrame, food_vecs):
    """Quantity-weighted mean of the vectors of everything the user ordered."""
    hist = orders[orders["user_id"] == user_id]
    idxs = [items.index[items["id"] == mid][0] for mid in hist["menu_item_id"]]
    weights = hist["quantity"].to_numpy()
    mat = food_vecs[idxs].toarray()
    return (mat * weights[:, None]).sum(axis=0, keepdims=True) / weights.sum()


def recommend_for_user(
    user_id: str,
    items: pd.DataFrame,
    orders: pd.DataFrame,
    food_vecs,
    k: int = 5,
    allergies: list[str] | None = None,
    budget_max: float | None = None,
    require_halal: bool = False,
    require_vegetarian: bool = False,
):
    """Rank all items against the user vector, then filter by hard constraints."""
    uvec = user_vector(user_id, items, orders, food_vecs)
    scored = items.assign(score=cosine_similarity(uvec, food_vecs).ravel())

    # hard filters — safety and budget beat taste
    if allergies:
        bad = scored["allergens"].apply(
            lambda a: any(al in a.split("|") for al in allergies)
        )
        scored = scored[~bad]
    if budget_max is not None:
        scored = scored[scored["price"] <= budget_max]
    if require_halal:
        scored = scored[scored["is_halal"] == 1]
    if require_vegetarian:
        scored = scored[scored["is_vegetarian"] == 1]

    return scored.nlargest(k, "score")[["id", "name", "price", "score"]]


# ── 5. Because You Ordered (collaborative, item co-occurrence) ───────────────

def because_you_ordered(user_id: str, items: pd.DataFrame, orders: pd.DataFrame, k: int = 3):
    """Items that other users ordered alongside the items this user ordered.

    ponytail: plain co-occurrence counts — enough at campus scale; swap for
    matrix factorisation only if the item catalogue grows past a few hundred.
    """
    mine = set(orders.loc[orders["user_id"] == user_id, "menu_item_id"])
    others = orders[orders["user_id"] != user_id]
    # users who share at least one item with me
    peers = others.groupby("user_id")["menu_item_id"].apply(set)
    peers = peers[peers.apply(lambda s: bool(s & mine))]
    # count how often each item I *haven't* ordered appears among peers
    counts: dict[str, int] = {}
    for basket in peers:
        for mid in basket - mine:
            counts[mid] = counts.get(mid, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])[:k]
    result = items[items["id"].isin([mid for mid, _ in ranked])][["id", "name"]].copy()
    result["co_orders"] = result["id"].map(dict(ranked))
    return result.sort_values("co_orders", ascending=False)


# ── Demo + self-checks ───────────────────────────────────────────────────────

def demo():
    items, orders = load_data()
    food_vecs = build_food_vectors(items)

    print("── Similar to Pad Thai (m001) ──")
    sim = similar_foods("m001", items, food_vecs)
    print(sim.to_string(index=False))
    assert "m001" not in sim["id"].values, "item must not recommend itself"
    assert len(sim) == 3

    print("\n── Recommended for u1 (peanut allergy, budget ≤ ฿60) ──")
    recs = recommend_for_user(
        "u1", items, orders, food_vecs, allergies=["peanuts"], budget_max=60
    )
    print(recs.to_string(index=False))
    assert "m001" not in recs["id"].values, "peanut item must be filtered"
    assert "m004" not in recs["id"].values, "peanut item must be filtered"
    assert (recs["price"] <= 60).all(), "budget filter failed"

    print("\n── Because you ordered … (u2) ──")
    byo = because_you_ordered("u2", items, orders)
    print(byo.to_string(index=False))
    assert not set(byo["id"]) & set(
        orders.loc[orders["user_id"] == "u2", "menu_item_id"]
    ), "must not recommend items the user already ordered"

    print("\nall self-checks passed ✓")


if __name__ == "__main__":
    demo()
