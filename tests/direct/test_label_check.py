"""Direct-mode tests for the LabelCheck contract."""

import hashlib
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import pytest

from tests.direct.conftest import to_hex

CONTRACT_PATH = "contracts/label_check.py"
GEN = 10**18
OFF = "https://world.openfoodfacts.org"
IMG = "https://images.openfoodfacts.org/images/products"
CODE = "8412170028579"  # Santiveri "0% azúcares" cocoa biscuits
FRONT_BYTES = b"\xff\xd8\xff\xe0 front of the pack"
LABEL_BYTES = b"\xff\xd8\xff\xe0 nutrition table"
INGR_BYTES = b"\xff\xd8\xff\xe0 ingredient list"


def _sha(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()


def _days_from_now(n):
    return (datetime.now(timezone.utc) + timedelta(days=n)).strftime("%Y-%m-%d")


def _path(code):
    return "/".join([code[0:3], code[3:6], code[6:9], code[9:]]) if len(code) > 8 else code


def _product(code=CODE, sugars=0.6, fat=17, salt=0.5, fibre=7, protein=7, kcal=412, unit="g", quantity="200 g",
             countries=("en:spain", "en:france"), edited_days_ago=30, ingredients="Harina integral de trigo, maltitol, cacao",
             front=True, nutrition=True, ingredients_photo=True, status=1, extra=None):
    n = {k: v for k, v in (("sugars_100g", sugars), ("fat_100g", fat), ("salt_100g", salt), ("fiber_100g", fibre),
                           ("proteins_100g", protein), ("energy-kcal_100g", kcal)) if v is not None}
    p = {"code": code, "product_name": "Galletas cacao", "brands": "Santiveri", "lang": "es", "quantity": quantity,
         "product_quantity_unit": unit, "countries_tags": list(countries), "rev": 82,
         "last_modified_t": int(time.time()) - edited_days_ago * 86400, "nutriments": n, "ingredients_text": ingredients}
    if front:
        p["image_front_url"] = f"{IMG}/{_path(code)}/front_es.76.400.jpg"
    if nutrition:
        p["image_nutrition_url"] = f"{IMG}/{_path(code)}/nutrition_es.81.400.jpg"
    if ingredients_photo:
        p["image_ingredients_url"] = f"{IMG}/{_path(code)}/ingredients_es.15.400.jpg"
    p.update(extra or {})
    return {"code": code, "status": status, "product": p if status == 1 else None}


def _mock(direct_vm, pattern, body, status=200, raw=None, content_type=b"application/json"):
    payload = raw if raw is not None else json.dumps(body).encode()
    direct_vm.mock_web(pattern, {"method": "GET", "response": {
        "status": status, "headers": {"Content-Type": content_type}, "body": payload}})


def _setup(direct_vm, product=None, code=CODE, status=200, front="MEETS", label="FAILS", text="FAILS", image_status=200):
    """Mock Open Food Facts and the validators' answers: `front` for the front photo, `label` for the nutrition table
    or ingredient-list photo, `text` for the recorded ingredient text."""
    direct_vm.clear_mocks()
    body = product if product is not None else _product(code)
    _mock(direct_vm, "^" + re.escape(f"{OFF}/api/v2/product/{code}.json?fields="), body, status)
    p = _path(code)
    for name, data in (("front_es.76", FRONT_BYTES), ("nutrition_es.81", LABEL_BYTES), ("ingredients_es.15", INGR_BYTES)):
        _mock(direct_vm, "^" + re.escape(f"{IMG}/{p}/{name}.full.jpg") + "$", None, image_status, raw=data, content_type=b"image/jpeg")
    direct_vm.mock_llm(r"front of a food package", json.dumps({"answer": front}))
    direct_vm.mock_llm(r"nutrition table of a food package", json.dumps({"answer": label}))
    direct_vm.mock_llm(r"ingredient list of a food package", json.dumps({"answer": label}))
    direct_vm.mock_llm(r"as typed into Open Food Facts", json.dumps({"answer": text}))


def _payments(contract, monkeypatch):
    """Record every GEN transfer the contract makes (refunds, rewards, returns) instead of sending it."""
    sent = []

    class Recorder:
        def __init__(self, to):
            self.to = to

        def emit_transfer(self, value):
            sent.append((self.to.as_hex, int(value)))

    monkeypatch.setattr(sys.modules[type(contract).__module__], "_Wallet", Recorder)
    return sent


TERMS = dict(title="EU front-of-pack claims", claims="sugar_free,low_sugar,no_added_sugar,low_salt,high_protein,high_fibre,low_fat",
             countries="", ends=None, reward=GEN // 2, stake=GEN // 10, per_challenger=5)


def _campaign(direct_vm, direct_deploy, sponsor, fund=2 * GEN, **terms):
    direct_vm.sender = sponsor
    contract = direct_deploy(CONTRACT_PATH)
    args = dict(TERMS, ends=_days_from_now(60))
    args.update(terms)
    direct_vm.value = fund
    result = contract.create_campaign(*args.values())
    direct_vm.value = 0
    return contract, result


def _challenge(direct_vm, contract, who, code=CODE, claim="sugar_free", campaign_id="campaign_0", stake=GEN // 10, **setup):
    _setup(direct_vm, code=code, **setup)
    direct_vm.sender, direct_vm.value = who, stake
    result = contract.challenge(campaign_id, code, claim)
    direct_vm.value = 0
    return result


def _expire(contract, challenge_id):
    contract.challenges[challenge_id].window_from = "2000-01-01T00:00:00"


def _wallet(n):
    return (0xC1A1A000 + n).to_bytes(20, "big")


# --- campaigns ---------------------------------------------------------------


def test_campaign_freezes_its_terms(direct_vm, direct_deploy, direct_alice):
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice, countries="en:spain, en:France")
    assert cid == "campaign_0"
    c = contract.get_campaign(cid)
    assert json.loads(c.claims_json)[0] == "sugar_free" and json.loads(c.countries_json) == ["en:spain", "en:france"]
    assert (int(c.reward), int(c.stake), int(c.per_challenger), int(c.n_funders)) == (GEN // 2, GEN // 10, 5, 1)
    assert json.loads(contract.pot(cid))["rewards_left"] == 4
    assert json.loads(contract.totals()) == {"expected_balance": str(2 * GEN)}
    assert json.loads(contract.claim_codes())["no_added_sugar"] == "No added sugars"


@pytest.mark.parametrize("terms, fund, reason", [
    (dict(title="ab"), 2 * GEN, "title must be 3 to 80 characters"),
    (dict(claims=""), 2 * GEN, "claims must be distinct codes"),
    (dict(claims="sugar_free,tasty"), 2 * GEN, "claims must be distinct codes"),
    (dict(claims="sugar_free,sugar_free"), 2 * GEN, "claims must be distinct codes"),
    (dict(countries="Spain"), 2 * GEN, "countries must be up to 10 Open Food Facts country tags"),
    (dict(ends="2026-02-31"), 2 * GEN, "ends must be a real calendar date"),
    (dict(ends="2025-13-01"), 2 * GEN, "ends must be a real calendar date"),
    (dict(ends="2020-01-01"), 2 * GEN, "ends must be today or later"),
    (dict(ends=_days_from_now(400)), 2 * GEN, "within 366 days"),
    (dict(reward=GEN // 20), 2 * GEN, "reward must be at least 0.1 GEN"),
    (dict(stake=0), 2 * GEN, "stake must be at least 0.1 GEN"),
    (dict(per_challenger=0), 2 * GEN, "per_challenger must be a whole number from 1 to 100"),
    ({}, GEN // 4, "fund the campaign with at least one reward"),
])
def test_invalid_campaigns_are_refunded_in_full(direct_vm, direct_deploy, direct_alice, monkeypatch, terms, fund, reason):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    sent = _payments(contract, monkeypatch)
    args = dict(TERMS, ends=_days_from_now(60))
    args.update(terms)
    direct_vm.value = fund
    result = contract.create_campaign(*args.values())
    assert result.startswith("REFUNDED: ") and reason in result
    assert sent == [(to_hex(direct_alice), fund)] and int(contract.campaign_count) == 0


def test_anyone_funds_with_at_least_a_tenth_of_a_gen(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender, direct_vm.value = direct_bob, GEN
    assert contract.fund(cid) == "funded"
    direct_vm.value = GEN // 20
    assert contract.fund(cid) == "REFUNDED: Send at least 0.1 GEN to fund the campaign"
    assert json.loads(contract.get_funders(cid, 0, 200)) == [
        {"address": to_hex(direct_alice), "amount": str(2 * GEN), "refunded": False},
        {"address": to_hex(direct_bob), "amount": str(GEN), "refunded": False}]
    contract.campaigns[cid].ends = "2020-01-01"
    direct_vm.value = GEN
    assert contract.fund(cid) == "REFUNDED: This campaign no longer takes funding"


# --- rulings -----------------------------------------------------------------


def test_a_claim_the_label_does_not_meet_is_upheld(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice)
    chid = _challenge(direct_vm, contract, direct_bob)
    ch = contract.get_challenge(chid)
    assert (ch.ruling, ch.code, int(ch.reward), int(ch.stake)) == ("UPHELD", "misleading", GEN // 2, GEN // 10)
    facts = json.loads(ch.facts_json)
    assert (facts["front_answer"], facts["data_answer"], facts["photo_answer"]) == ("MEETS", "FAILS", "FAILS")
    assert facts["data_detail"] == "sugars 0.6 g, limit 0.5 g" and facts["liquid"] is False
    assert "Galletas cacao carries the claim \"Sugar-free\", which EU law allows only with sugars of at most 0.5 g per 100 g" in ch.why
    pot = json.loads(contract.pot(cid))
    assert (pot["pot"], pot["reserved"], pot["stakes_open"]) == (str(3 * GEN // 2), str(GEN // 2), str(GEN // 10))
    assert json.loads(contract.totals())["expected_balance"] == str(2 * GEN + GEN // 10)


def test_a_claim_the_label_meets_is_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    ch = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, product=_product(sugars=0.4), label="MEETS"))
    assert (ch.ruling, ch.code, int(ch.reward)) == ("REJECTED", "claim_met", 0)
    assert "qualifies" in ch.why


def test_a_claim_not_printed_on_the_pack_is_rejected_without_reading_the_label(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    ch = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, claim="low_salt", front="FAILS"))
    assert (ch.ruling, ch.code) == ("REJECTED", "not_claimed")
    assert [p["kind"] for p in json.loads(ch.evidence_json)[0]["photos"]] == ["front"]


def test_record_and_photo_disagreeing_decide_nothing(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Gullón's record says 5 g of sugars; the printed table says <0.5 g: no one is accused on a typo."""
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    ch = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, product=_product(sugars=5), label="MEETS"))
    assert (ch.ruling, ch.code, int(ch.reward)) == ("UNCLEAR", "data_conflict", 0)
    assert "record: FAILS, photo: MEETS" in ch.why


@pytest.mark.parametrize("setup, ruling, code", [
    (dict(status=503), "UNCLEAR", "unreachable"),
    (dict(product={"code": CODE, "status": 0, "status_verbose": "product not found"}, status=404), "REJECTED", "unknown_product"),
    (dict(product=_product(edited_days_ago=1)), "UNCLEAR", "recently_edited"),
    (dict(product=_product(front=False)), "UNCLEAR", "no_front_photo"),
    (dict(product=_product(front=False, extra={"image_front_url": "https://evil.example/front.400.jpg"})), "UNCLEAR", "no_front_photo"),
    (dict(image_status=500), "UNCLEAR", "no_front_photo"),
    (dict(front="UNCLEAR"), "UNCLEAR", "front_unclear"),
    (dict(product=_product(sugars=None)), "UNCLEAR", "no_data"),
    (dict(product=_product(nutrition=False)), "UNCLEAR", "no_label_photo"),
    (dict(label="UNCLEAR"), "UNCLEAR", "label_unclear"),
])
def test_missing_or_unreadable_evidence_never_decides(direct_vm, direct_deploy, direct_alice, direct_bob, setup, ruling, code):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    ch = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, **setup))
    assert (ch.ruling, ch.code, int(ch.reward)) == (ruling, code, 0)


def test_countries_limit_where_a_campaign_applies(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice, countries="en:united-kingdom")
    ch = contract.get_challenge(_challenge(direct_vm, contract, direct_bob))
    assert (ch.ruling, ch.code) == ("REJECTED", "outside_countries")
    assert "en:united-kingdom" in ch.why


def test_no_added_sugar_reads_the_recorded_ingredients_and_the_ingredient_photo(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    upheld = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, claim="no_added_sugar",
                                               product=_product(ingredients="Farine, eau, sucre de canne, levure")))
    assert (upheld.ruling, upheld.code) == ("UPHELD", "misleading")
    facts = json.loads(upheld.facts_json)
    assert (facts["label_photo_kind"], facts["ingredients"]) == ("ingredient list", "Farine, eau, sucre de canne, levure")
    packet = json.loads(upheld.evidence_json)[0]
    assert packet["ingredients_sha256"] == _sha("Farine, eau, sucre de canne, levure")
    assert [p["sha256"] for p in packet["photos"]] == [_sha(FRONT_BYTES), _sha(INGR_BYTES)]
    # The English text on record mentions cane sugar but the printed list does not (La Boulangère): no decision.
    conflict = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, code="3760049797909", claim="no_added_sugar",
                                                 product=_product("3760049797909"), text="FAILS", label="MEETS"))
    assert (conflict.ruling, conflict.code) == ("UNCLEAR", "data_conflict")


def test_liquids_use_the_per_100_ml_thresholds(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    drink = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, claim="low_sugar",
                                              product=_product(sugars=3, unit="ml", quantity="1 l")))
    assert (drink.ruling, json.loads(drink.facts_json)["data_detail"]) == ("UPHELD", "sugars 3 g, limit 2.5 g")
    assert "per 100 ml" in json.loads(drink.facts_json)["rule"]
    solid = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, code="3017624010701", claim="low_sugar",
                                              product=_product("3017624010701", sugars=3), label="MEETS"))
    assert (solid.ruling, json.loads(solid.facts_json)["data_detail"]) == ("REJECTED", "sugars 3 g, limit 5 g")


@pytest.mark.parametrize("claim, values, answer, detail", [
    ("sugar_free", dict(sugars_100g=0.5), "MEETS", "sugars 0.5 g, limit 0.5 g"),
    ("fat_free", dict(fat_100g=0.6), "FAILS", "fat 0.6 g, limit 0.5 g"),
    ("low_salt", dict(salt_100g=1.4), "FAILS", "salt 1.4 g, limit 0.3 g"),
    ("high_fibre", dict(fiber_100g=5.9, **{"energy-kcal_100g": 455}), "FAILS", "fibre 5.9 g = 1.30 g per 100 kcal, at least 6 g or 3 g per 100 kcal"),
    ("high_fibre", dict(fiber_100g=4, **{"energy-kcal_100g": 120}), "MEETS", "fibre 4 g = 3.33 g per 100 kcal, at least 6 g or 3 g per 100 kcal"),
    ("source_of_fibre", dict(fiber_100g=3), "MEETS", "fibre 3 g, at least 3 g"),
    ("high_protein", dict(proteins_100g=29, **{"energy-kcal_100g": 595}), "FAILS", "protein 29 g x 4 = 19.5% of 595 kcal, at least 20%"),
    ("source_of_protein", dict(proteins_100g=29, **{"energy-kcal_100g": 595}), "MEETS", "protein 29 g x 4 = 19.5% of 595 kcal, at least 12%"),
    ("high_protein", dict(proteins_100g=10), "NO_DATA", "no protein or energy value"),
    ("low_fat", dict(fat_100g="n/a"), "NO_DATA", "no fat value"),
])
def test_nutrient_rules_are_decided_in_code(direct_vm, direct_deploy, direct_alice, claim, values, answer, detail):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    module = sys.modules[type(contract).__module__]
    assert module.data_check(claim, values, False) == (answer, detail)


# --- filing rules ------------------------------------------------------------


@pytest.mark.parametrize("args, stake, reason", [
    (("campaign_9", CODE, "sugar_free"), GEN // 10, "No campaign with id campaign_9"),
    (("campaign_0", "12345", "sugar_free"), GEN // 10, "barcode must be 8 to 14 digits"),
    (("campaign_0", CODE, "fat_free"), GEN // 10, "This campaign covers: sugar_free"),
    (("campaign_0", CODE, "sugar_free"), GEN // 5, "stakes exactly 100000000000000000 wei"),
])
def test_bad_challenges_are_refunded(direct_vm, direct_deploy, direct_alice, direct_bob, monkeypatch, args, stake, reason):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    sent = _payments(contract, monkeypatch)
    _setup(direct_vm)
    direct_vm.sender, direct_vm.value = direct_bob, stake
    result = contract.challenge(*args)
    assert result.startswith("REFUNDED: ") and reason in result
    assert sent == [(to_hex(direct_bob), stake)] and int(contract.challenge_count) == 0


def test_a_funder_cannot_challenge_their_own_campaign(direct_vm, direct_deploy, direct_alice):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    assert _challenge(direct_vm, contract, direct_alice) == "REFUNDED: A funder cannot be paid by their own campaign"


def test_one_open_challenge_one_upheld_and_three_tries_per_product_and_claim(direct_vm, direct_deploy, direct_alice, direct_bob,
                                                                           direct_charlie):
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice)
    first = _challenge(direct_vm, contract, direct_bob, front="UNCLEAR")
    assert _challenge(direct_vm, contract, direct_charlie).startswith(f"REFUNDED: {first} on this product and claim is still open")
    for _ in range(2):
        _expire(contract, contract.challenge_for(cid, CODE, "sugar_free"))
        contract.settle(contract.challenge_for(cid, CODE, "sugar_free"))
        assert _challenge(direct_vm, contract, direct_bob, front="UNCLEAR").startswith("challenge_")
    _expire(contract, contract.challenge_for(cid, CODE, "sugar_free"))
    contract.settle(contract.challenge_for(cid, CODE, "sugar_free"))
    assert _challenge(direct_vm, contract, direct_bob) == "REFUNDED: This product and claim have been challenged in this campaign 3 times"
    # A different claim on the same product is its own count; once upheld it cannot be challenged again.
    upheld = _challenge(direct_vm, contract, direct_charlie, claim="high_protein", product=_product(protein=7, kcal=412))
    assert contract.get_challenge(upheld).ruling == "UPHELD"
    _expire(contract, upheld)
    contract.settle(upheld)
    assert _challenge(direct_vm, contract, direct_bob, claim="high_protein").startswith("REFUNDED: This claim on this product was already upheld")


def test_a_challenger_is_paid_for_at_most_per_challenger_upheld_claims(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice, per_challenger=1)
    assert contract.get_challenge(_challenge(direct_vm, contract, direct_bob)).ruling == "UPHELD"
    ch = contract.get_challenge(_challenge(direct_vm, contract, direct_bob, claim="high_protein"))
    assert (ch.ruling, ch.code) == ("REJECTED", "upheld_cap")


def test_an_empty_pot_takes_no_challenges(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice, fund=GEN // 2)
    _challenge(direct_vm, contract, direct_bob)
    assert _challenge(direct_vm, contract, direct_charlie, claim="high_protein") == "REFUNDED: This campaign's pot is empty"


# --- settling and contesting -------------------------------------------------


def test_settling_pays_returns_or_keeps_the_stake(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, monkeypatch):
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice)
    sent = _payments(contract, monkeypatch)
    upheld = _challenge(direct_vm, contract, direct_bob)
    rejected = _challenge(direct_vm, contract, direct_charlie, claim="low_salt", front="FAILS")
    unclear = _challenge(direct_vm, contract, direct_charlie, claim="high_fibre", front="UNCLEAR")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only a funder can pay early"):
        contract.settle(upheld)
    direct_vm.sender = direct_alice
    assert contract.settle(upheld) == "paid"  # the sponsor pays at once
    with direct_vm.expect_revert("only the challenger can accept early"):
        contract.settle(rejected)
    direct_vm.sender = direct_charlie
    assert contract.settle(rejected) == "stake_to_pot"  # the challenger accepts at once
    _expire(contract, unclear)
    direct_vm.sender = direct_bob
    assert contract.settle(unclear) == "stake_returned"  # anyone, after the window
    with direct_vm.expect_revert("already settled"):
        contract.settle(unclear)
    assert sent == [(to_hex(direct_bob), GEN // 10 + GEN // 2), (to_hex(direct_charlie), GEN // 10)]
    c = contract.get_campaign(cid)
    assert (int(c.pot), int(c.reserved), int(c.paid_total), int(c.stakes_kept), int(c.stakes_open)) == (
        3 * GEN // 2 + GEN // 10, 0, GEN // 2, GEN // 10, 0)
    assert (int(c.n_upheld), int(c.n_rejected), int(c.n_unclear), int(c.n_pending)) == (1, 1, 1, 0)
    assert json.loads(contract.totals())["expected_balance"] == str(3 * GEN // 2 + GEN // 10)


def test_each_side_contests_once_and_a_fresh_reading_can_change_the_ruling(direct_vm, direct_deploy, direct_alice, direct_bob,
                                                                          direct_charlie):
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender, direct_vm.value = direct_charlie, GEN
    contract.fund(cid)
    direct_vm.value = 0
    chid = _challenge(direct_vm, contract, direct_bob)
    _setup(direct_vm, label="MEETS")  # the label photo was replaced by a clearer one
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only a funder of this campaign can contest an upheld challenge"):
        contract.contest(chid)
    direct_vm.sender = direct_charlie  # a co-funder
    assert contract.contest(chid) == "UNCLEAR"
    assert json.loads(contract.pot(cid))["reserved"] == "0"
    with direct_vm.expect_revert("Only the challenger can contest"):
        contract.contest(chid)
    _setup(direct_vm)
    direct_vm.sender = direct_bob
    assert contract.contest(chid) == "UPHELD"
    with direct_vm.expect_revert("The funders have already contested"):
        direct_vm.sender = direct_alice
        contract.contest(chid)
    ch = contract.get_challenge(chid)
    assert [s["event"] for s in json.loads(ch.timeline_json)] == ["filed", "contested", "contested"]
    assert len(json.loads(ch.evidence_json)) == 3
    _expire(contract, chid)
    with direct_vm.expect_revert("window has closed"):
        contract.contest(chid)


# --- closing -----------------------------------------------------------------


def test_close_returns_the_pot_and_kept_stakes_pro_rata(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie,
                                                       monkeypatch):
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice)
    sent = _payments(contract, monkeypatch)
    direct_vm.sender, direct_vm.value = direct_bob, GEN
    contract.fund(cid)
    direct_vm.value = 0
    rejected = _challenge(direct_vm, contract, direct_charlie, front="FAILS")
    with direct_vm.expect_revert("Challenges can be filed until"):
        contract.close(cid)
    contract.campaigns[cid].ends = "2020-01-01"
    with direct_vm.expect_revert("Settle the open challenges first"):
        contract.close(cid)
    _expire(contract, rejected)
    contract.settle(rejected)
    with direct_vm.expect_revert("Close the campaign first"):
        contract.refund(cid, to_hex(direct_bob))
    returnable = 3 * GEN + GEN // 10
    assert contract.close(cid) == str(returnable)
    direct_vm.sender = direct_charlie  # anyone sends a funder their share, always to that funder
    assert contract.refund(cid, to_hex(direct_alice)) == str(returnable * 2 // 3)
    with direct_vm.expect_revert("has already been returned"):
        contract.refund(cid, to_hex(direct_alice))
    with direct_vm.expect_revert("did not fund campaign_0"):
        contract.refund(cid, to_hex(direct_charlie))
    assert contract.refund(cid, to_hex(direct_bob)) == str(returnable - returnable * 2 // 3)
    assert sum(a for _, a in sent) == returnable and json.loads(contract.totals())["expected_balance"] == "0"
    with direct_vm.expect_revert("already closed"):
        contract.close(cid)


def test_stress_hundreds_of_funders_and_challenges_still_close_and_repay_everyone(direct_vm, direct_deploy, direct_alice,
                                                                                 direct_bob, monkeypatch):
    """300 minimum top-ups from 300 wallets and 120 rejected challenges (40 products, each to the try cap). Closing
    reads no challenge and no funder, every funder is repaid by their own refund, and every wei leaves the contract."""
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice)
    sent = _payments(contract, monkeypatch)
    for i in range(300):
        direct_vm.sender, direct_vm.value = _wallet(i), GEN // 10 + i
        assert contract.fund(cid) == "funded"
    direct_vm.value = 0
    funded = 2 * GEN + sum(GEN // 10 + i for i in range(300))
    for k in range(40):
        code = str(5000000000000 + k)
        for _ in range(3):
            chid = _challenge(direct_vm, contract, direct_bob, code=code, product=_product(code), front="FAILS")
            _expire(contract, chid)
            contract.settle(chid)
    c = contract.get_campaign(cid)
    assert (int(c.n_funders), int(c.n_challenges), int(c.stakes_kept)) == (301, 120, 120 * GEN // 10)
    assert len(c.history_json) < 4000
    contract.campaigns[cid].ends = "2020-01-01"
    reads = {"n": 0}
    real = type(contract.challenges).__getitem__
    per_item = lambda k: str(k).startswith("challenge_") or "|" in str(k)
    monkeypatch.setattr(type(contract.challenges), "__getitem__",
                        lambda m, k: (reads.__setitem__("n", reads["n"] + per_item(k)), real(m, k))[1])
    before = len(sent)
    assert contract.close(cid) == str(funded + 120 * GEN // 10)
    assert reads["n"] == 0 and len(sent) == before
    monkeypatch.setattr(type(contract.challenges), "__getitem__", real)
    rows = json.loads(contract.get_funders(cid, 0, 200)) + json.loads(contract.get_funders(cid, 200, 200))
    assert len(rows) == 301
    for row in rows:
        assert int(contract.refund(cid, row["address"])) > 0
    assert sum(a for _, a in sent[before:]) == funded + 120 * GEN // 10
    assert json.loads(contract.totals()) == {"expected_balance": "0"}


# --- evidence and registry ---------------------------------------------------


def test_every_reading_keeps_an_evidence_packet(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, _ = _campaign(direct_vm, direct_deploy, direct_alice)
    ch = contract.get_challenge(_challenge(direct_vm, contract, direct_bob))
    packet = json.loads(ch.evidence_json)[0]
    assert packet["record"] == f"{OFF}/product/{CODE}" and packet["rev"] == 82
    assert packet["source"].startswith(f"{OFF}/api/v2/product/{CODE}.json?fields=code,product_name")
    assert packet["photos"] == [
        {"kind": "front", "url": f"{IMG}/841/217/002/8579/front_es.76.400.jpg", "sha256": _sha(FRONT_BYTES), "answer": "MEETS"},
        {"kind": "nutrition table", "url": f"{IMG}/841/217/002/8579/nutrition_es.81.400.jpg", "sha256": _sha(LABEL_BYTES), "answer": "FAILS"}]
    assert packet["facts_sha256"] == _sha(ch.facts_json)
    body = {k: v for k, v in packet.items() if k != "packet_sha256"}
    assert packet["packet_sha256"] == _sha(json.dumps(body, sort_keys=True))
    assert json.loads(ch.timeline_json)[0]["evidence"] == packet["packet_sha256"]


def test_registry_reads_in_one_call(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, cid = _campaign(direct_vm, direct_deploy, direct_alice)
    _challenge(direct_vm, contract, direct_bob)
    _challenge(direct_vm, contract, direct_bob, claim="low_salt", front="FAILS")
    assert [c.id for c in contract.get_campaigns(0, 200)] == ["campaign_0"]
    assert [c.id for c in contract.get_challenges(0, 200)] == ["challenge_0", "challenge_1"]
    assert contract.challenge_for(cid, CODE, "low_salt") == "challenge_1"
    assert contract.explain_challenge("challenge_1").startswith("REJECTED: Validators looked at the front")
