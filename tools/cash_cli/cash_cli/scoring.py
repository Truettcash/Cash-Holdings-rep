from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence


def _num(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if number != number or number in (float("inf"), float("-inf")):
        return 0.0
    return number


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value if value == value else 0.0))


def _tier(overall: float, fit: float, data: float, contact: float) -> str:
    if overall >= 70 and fit >= 60 and data >= 82 and contact >= 82:
        return "A"
    if overall >= 60 and fit >= 50 and data >= 78 and contact >= 78:
        return "B"
    if overall >= 52 and fit >= 44 and data >= 68 and contact >= 70:
        return "C"
    return "hold"


@dataclass(frozen=True)
class ScoreResult:
    update: dict[str, Any]
    explanation: dict[str, Any]
    research: dict[str, Any]


def score_prospect(bundle: Mapping[str, Any]) -> ScoreResult:
    """Pure local port of prospect-score-v2 economics/routing math.

    Database reads and writes are deliberately kept outside this function so the
    scoring core can be tested locally and later reused by a long-running worker.
    """
    p = dict(bundle.get("profile") or {})
    contacts: Sequence[Mapping[str, Any]] = bundle.get("contacts") or []
    provider_keys = {str(x) for x in (bundle.get("provider_keys") or [])}
    policy = dict(bundle.get("policy") or {})

    best = dict(contacts[0]) if contacts else {}
    contact_q = _num(best.get("contact_quality_score"))
    dm = _num(best.get("decision_maker_score"))
    confidence = _clamp(_num(p.get("confidence")) * 100)
    evidence = _clamp(_num(p.get("evidence_quality_score")))
    coverage = max(1.0, _num(p.get("source_coverage_count")))
    coverage_score = _clamp(coverage * 28)
    data_suff = _clamp(
        evidence * 0.42
        + coverage_score * 0.18
        + contact_q * 0.22
        + confidence * 0.18
    )
    uncertainty = _clamp(100 - data_suff)

    sig = dict(p.get("signals") or {})
    quote = 1 if sig.get("has_quote_or_estimate_cta") else 0
    booking = 1 if sig.get("has_booking") else 0
    form = 1 if sig.get("has_form") else 0
    commerce = 1 if sig.get("has_commerce") else 0
    service_mentions = _num(sig.get("service_mentions"))
    locations = _num(sig.get("location_mentions"))
    ops = _num(p.get("operations_complexity_score"))
    conv = _num(p.get("conversion_gap_score"))
    site = _num(p.get("website_quality_score"))
    brand_mat = _num(p.get("brand_maturity_score"))
    contactability = _num(p.get("contactability_score"))
    visibility = _num(p.get("market_visibility_score"))

    structural_boost = _clamp(
        quote * 14
        + booking * 8
        + form * 5
        + commerce * 5
        + min(10, service_mentions * 0.8)
        + min(8, locations * 1.2)
    )
    operational_friction = _clamp(
        ops * 0.48 + conv * 0.27 + structural_boost * 0.25
    )
    brand_gap = _clamp(
        conv * 0.46 + (100 - site) * 0.34 + (100 - brand_mat) * 0.20
    )
    traffic_relevant = _clamp(
        (28 if p.get("best_fit") == "truett-cash" else 12)
        + (12 if brand_gap > 70 else 0)
        + (8 if visibility > 60 else 0)
    )
    athrty = _clamp(
        operational_friction * 0.50
        + ops * 0.21
        + conv * 0.10
        + contactability * 0.08
        + evidence * 0.07
        + dm * 0.04
    )
    truett = _clamp(
        brand_gap * 0.47
        + conv * 0.20
        + (100 - site) * 0.10
        + contactability * 0.08
        + evidence * 0.08
        + visibility * 0.04
        + dm * 0.03
    )
    routed_brand = "authority-systems" if athrty >= truett else "truett-cash"
    routed_fit = max(athrty, truett)
    overall = _clamp(
        routed_fit * 0.74 + data_suff * 0.16 + contactability * 0.10
    )
    prospect_tier = _tier(overall, routed_fit, data_suff, contact_q)
    priority = _clamp(
        routed_fit * 0.42
        + overall * 0.26
        + data_suff * 0.14
        + contact_q * 0.10
        + visibility * 0.04
        + dm * 0.04
    )

    provider_order = policy.get("provider_order")
    if not isinstance(provider_order, list):
        provider_order = ["google_places", "dataforseo"]
    existing_paid = provider_keys.intersection(
        {"google_places", "dataforseo", "semrush"}
    )
    next_provider = next(
        (
            x
            for x in provider_order
            if x in {"google_places", "dataforseo"} and x not in existing_paid
        ),
        None,
    )
    min_priority = _num(policy.get("paid_enrichment_min_priority") or 72)
    min_uncertainty = _num(policy.get("paid_enrichment_min_uncertainty") or 25)
    max_uncertainty = _num(policy.get("paid_enrichment_max_uncertainty") or 70)
    base_paid = (
        priority >= min_priority
        and uncertainty >= min_uncertainty
        and uncertainty <= max_uncertainty
        and prospect_tier != "hold"
    )
    paid_worthwhile = bool(base_paid and next_provider)
    if paid_worthwhile:
        paid_reason = (
            "strong prospect but public evidence is still thin"
            if coverage < 2
            else f"one {next_provider} lookup could materially change ranking or outreach angle"
        )
    else:
        paid_reason = None

    if "semrush" in existing_paid:
        cost_tier = "premium_optional"
    elif existing_paid.intersection({"google_places", "dataforseo"}):
        cost_tier = "cheap_paid"
    else:
        cost_tier = "free"

    explanation = {
        "version": "cashos-prospect-v2.1-local",
        "routing": {
            "brand_key": routed_brand,
            "fit_score": routed_fit,
            "tier": prospect_tier,
        },
        "athrty": {
            "fit": athrty,
            "operational_friction": operational_friction,
            "operations_complexity": ops,
            "conversion_gap": conv,
        },
        "truett_cash": {
            "fit": truett,
            "brand_gap": brand_gap,
            "website_quality": site,
            "conversion_gap": conv,
        },
        "data": {
            "sufficiency": data_suff,
            "uncertainty": uncertainty,
            "coverage": coverage,
            "contact_quality": contact_q,
            "decision_maker_score": dm,
            "evidence_quality": evidence,
        },
        "economics": {
            "paid_enrichment_recommended": paid_worthwhile,
            "next_provider": next_provider,
            "reason": paid_reason,
            "traffic_required": False,
            "research_cost_tier": cost_tier,
            "provider_ladder": provider_order,
        },
    }

    update = {
        "athrty_fit_score": athrty,
        "truett_fit_score": truett,
        "overall_score": overall,
        "best_fit": "athrty" if routed_brand == "authority-systems" else "truett-cash",
        "operational_friction_score": operational_friction,
        "brand_gap_score": brand_gap,
        "data_sufficiency_score": data_suff,
        "decision_uncertainty_score": uncertainty,
        "traffic_relevance_score": traffic_relevant,
        "commercial_priority_score": priority,
        "prospect_tier": prospect_tier,
        "research_cost_tier": cost_tier,
        "paid_enrichment_recommended": paid_worthwhile,
        "paid_enrichment_reason": paid_reason,
        "score_version": "cashos-prospect-v2-local",
    }
    research = {
        "paid_enrichment_recommended": paid_worthwhile,
        "next_provider": next_provider,
        "reason": paid_reason,
        "priority": priority,
        "uncertainty": uncertainty,
        "data_sufficiency": data_suff,
        "routed_brand": routed_brand,
    }
    return ScoreResult(
        update=update,
        explanation=explanation,
        research=research,
    )
