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

Data: the live Supabase catalog when SUPABASE_URL + SUPABASE_ANON_KEY are set
in the environment, otherwise the CSV fixtures in ml/data/. Those fixtures were
exported from src/lib/mock-data.ts, which was deleted on 2026-08-31 — they are
ten items and two users, kept only so this file still runs offline. Anything
you intend to believe about ranking quality has to come from the live pull.

Export the two variables (they are the same values app.json feeds the client)
and re-run to score against the real ~500-item catalog:

    export SUPABASE_URL=https://<ref>.supabase.co
    export SUPABASE_ANON_KEY=<anon key>
    python recommend.py

Run:  python recommend.py   (prints demo output and self-checks)
"""

from __future__ import annotations  # PEP 604 unions on Python 3.9

import json
import os
import urllib.parse
import urllib.request

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pathlib import Path

DATA = Path(__file__).parent / "data"

# The CSVs store list columns pipe-joined; PostgREST hands back real arrays.
LIST_COLUMNS = ("ingredients", "tags", "allergens")


def _fetch(base: str, key: str, path: str, params: dict[str, str]):
    """One anon-key PostgREST GET. urllib, so ml/ needs no extra dependency."""
    url = f"{base.rstrip('/')}/rest/v1/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def load_supabase(base: str, key: str):
    """Live catalog + order history, shaped exactly like the CSV fixtures."""
    items = pd.DataFrame(_fetch(base, key, "menu_items", {
        "select": "id,name,category,price,spice_level,is_halal,is_vegetarian,is_jay,"
                  "ingredients,tags,allergens",
        "is_available": "eq.true",
    }))
    # order_items carries the item + quantity; orders carries who bought it.
    # Only real demand counts, matching get_trending_items/get_because_you_ordered.
    rows = _fetch(base, key, "order_items", {
        "select": "menu_item_id,quantity,orders!inner(user_id,status)",
        "orders.status": "in.(accepted,ready,completed)",
    })
    orders = pd.DataFrame([
        {"user_id": r["orders"]["user_id"], "menu_item_id": r["menu_item_id"], "quantity": r["quantity"]}
        for r in rows
    ], columns=["user_id", "menu_item_id", "quantity"])

    for col in LIST_COLUMNS:
        items[col] = items[col].apply(lambda v: "|".join(v or []))
    return items.fillna(""), orders


# ── 1. Load ──────────────────────────────────────────────────────────────────

def load_data():
    base = os.environ.get("SUPABASE_URL")
    # menu_items is public-read so the anon key is enough for the catalog, but
    # orders/order_items are RLS-scoped to auth.uid() — an anon key reads zero
    # rows there and the collaborative sections come back empty. Set
    # SUPABASE_SERVICE_ROLE_KEY too (locally, never in the app) to score
    # against real order history.
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if base and key:
        return load_supabase(base, key)
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
    matches = items.index[items["id"] == item_id]
    if len(matches) == 0:
        raise KeyError(f"no menu item {item_id!r} in the loaded catalog")
    idx = matches[0]
    scores = cosine_similarity(food_vecs[idx], food_vecs).ravel()
    scores[idx] = -1  # never recommend the item itself
    top = scores.argsort()[::-1][:k]
    return items.iloc[top][["id", "name"]].assign(score=scores[top])


# ── 4. User Vector + personalised ranking ────────────────────────────────────

def user_vector(user_id: str, items: pd.DataFrame, orders: pd.DataFrame, food_vecs):
    """Quantity-weighted mean of the vectors of everything the user ordered.

    Returns an all-zero vector for a user with no usable history — a fresh
    account, or one whose orders are all for items that have since been
    delisted. Both cases used to raise (IndexError on the missing item,
    then a divide-by-zero on the empty weights) instead of degrading to
    "no signal", which is what a cold start actually is.
    """
    hist = orders[orders["user_id"] == user_id]
    positions = {item_id: i for i, item_id in enumerate(items["id"])}
    pairs = [(positions[mid], q) for mid, q in zip(hist["menu_item_id"], hist["quantity"])
             if mid in positions]
    if not pairs:
        return np.zeros((1, food_vecs.shape[1]))

    idxs = [i for i, _ in pairs]
    weights = np.array([q for _, q in pairs], dtype=float)
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
    require_jay: bool = False,
):
    """Rank all items against the user vector, then filter by hard constraints.

    Hard filters are halal / vegetarian / jay / budget only. Allergies are
    deliberately NOT a filter: the app warns before Add to Cart rather than
    hiding the dish (CLAUDE.md, changed 2026-09-02), so this returns a
    `has_allergen` flag for the caller to badge instead. Filtering here would
    have made the reference implementation contradict what ships.
    """
    uvec = user_vector(user_id, items, orders, food_vecs)
    scored = items.assign(score=cosine_similarity(uvec, food_vecs).ravel())

    # hard filters — dietary rules and budget beat taste
    if budget_max is not None:
        scored = scored[scored["price"] <= budget_max]
    if require_halal:
        scored = scored[scored["is_halal"] == 1]
    if require_vegetarian:
        scored = scored[scored["is_vegetarian"] == 1]
    if require_jay:
        scored = scored[scored["is_jay"] == 1]

    # warn, don't hide
    scored = scored.assign(has_allergen=scored["allergens"].apply(
        lambda a: any(al in a.split("|") for al in (allergies or []))
    ))

    return scored.nlargest(k, "score")[["id", "name", "price", "score", "has_allergen"]]


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
    # Tie-break on item id, not on dict insertion order: `peers` holds sets of
    # strings, whose iteration order changes with PYTHONHASHSEED, so a plain
    # sort on count alone returned a different top-k on every process. At this
    # scale nearly every candidate ties at one or two co-orders.
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:k]
    result = items[items["id"].isin([mid for mid, _ in ranked])][["id", "name"]].copy()
    result["co_orders"] = result["id"].map(dict(ranked))
    return result.sort_values("co_orders", ascending=False)


# ── Demo + self-checks ───────────────────────────────────────────────────────

def demo():
    items, orders = load_data()
    food_vecs = build_food_vectors(items)
    print(f"catalog: {len(items)} items, {orders['user_id'].nunique()} users with order history\n")

    # Pick the subjects out of whatever loaded rather than hard-coding fixture
    # ids — the same run has to work against ml/data/*.csv and against the live
    # KMUTT catalog, whose ids are uuids.
    anchor = items["id"].iloc[0]
    busiest = orders["user_id"].value_counts()
    anchor_name = items.loc[items["id"] == anchor, "name"].iloc[0]
    # No readable order history — an anon-key pull, since orders is RLS-scoped.
    # Content-based ranking still works; the collaborative half has no input.
    top_user = busiest.index[0] if len(busiest) else "nobody-has-this-id"
    peer_user = busiest.index[1] if len(busiest) > 1 else top_user

    print(f"── Similar to {anchor_name} ──")
    sim = similar_foods(anchor, items, food_vecs)
    print(sim.to_string(index=False))
    assert anchor not in sim["id"].values, "item must not recommend itself"
    assert len(sim) == 3

    print(f"\n── Recommended for {top_user} (peanut allergy, budget ≤ ฿60) ──")
    recs = recommend_for_user(
        top_user, items, orders, food_vecs, allergies=["peanuts"], budget_max=60
    )
    print(recs.to_string(index=False))
    assert (recs["price"] <= 60).all(), "budget filter failed"
    # Allergies warn, they don't hide — a peanut dish may still be listed, but
    # it has to be flagged so the UI can badge it.
    peanut_ids = set(items.loc[items["allergens"].str.split("|").apply(lambda a: "peanuts" in a), "id"])
    listed_peanut = recs[recs["id"].isin(peanut_ids)]
    assert listed_peanut["has_allergen"].all(), "peanut item must be flagged, not hidden"

    print(f"\n── Recommended for {top_user} (vegetarian, jay) ──")
    strict = recommend_for_user(
        top_user, items, orders, food_vecs, require_vegetarian=True, require_jay=True
    )
    print(strict.to_string(index=False) if len(strict) else "(nothing matches)")
    assert set(strict["id"]) <= set(items.loc[items["is_vegetarian"] == 1, "id"]), "vegetarian filter failed"

    print("\n── Cold start: a user with no order history ──")
    cold = recommend_for_user("nobody-has-this-id", items, orders, food_vecs)
    assert len(cold) > 0, "cold start must degrade to a ranking, not raise"
    assert (cold["score"] == 0).all(), "no history means no taste signal"
    print(f"{len(cold)} items, all score 0 — no signal, no crash")

    print(f"\n── Because you ordered … ({peer_user}) ──")
    byo = because_you_ordered(peer_user, items, orders)
    print(byo.to_string(index=False) if len(byo) else "(no peers share an item)")
    assert not set(byo["id"]) & set(
        orders.loc[orders["user_id"] == peer_user, "menu_item_id"]
    ), "must not recommend items the user already ordered"
    # Ties are everywhere at campus volume; the id tie-break has to make the
    # top-k reproducible across processes (set iteration order is hash-seeded).
    assert list(byo["id"]) == list(because_you_ordered(peer_user, items, orders)["id"])

    print("\nall self-checks passed ✓")


if __name__ == "__main__":
    demo()
