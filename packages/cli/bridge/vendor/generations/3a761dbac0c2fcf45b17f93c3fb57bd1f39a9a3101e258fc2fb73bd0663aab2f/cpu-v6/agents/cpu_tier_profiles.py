"""Candidate profiles for the ordinal cpu-v4 product ladder."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Dict, Mapping


@dataclass(frozen=True)
class RawCpuTier:
    raw_rank: int
    profile_name: str
    p95_limit_seconds: float


RAW_CPU_TIERS = (
    RawCpuTier(1, "practical_tier_1", 0.25),
    RawCpuTier(2, "practical_tier_2", 0.25),
    RawCpuTier(3, "practical_tier_3", 0.50),
    RawCpuTier(4, "practical_tier_4", 0.90),
    RawCpuTier(5, "practical_tier_5", 1.20),
    RawCpuTier(6, "practical_tier_6", 1.80),
    RawCpuTier(7, "practical_expert_v3", 1.80),
)

RAW_CPU_TIER_BY_PROFILE: Mapping[str, RawCpuTier] = MappingProxyType(
    {tier.profile_name: tier for tier in RAW_CPU_TIERS}
)


def _profile(
    base: Dict[str, Any],
    *,
    depths: tuple[int, int, int],
    k_multiplier: float,
    randomness: float,
    random_top_n: int,
    q_depths: tuple[int, int, int],
) -> Dict[str, Any]:
    profile = copy.deepcopy(base)
    search = profile["search"]
    for phase, depth in zip(("early", "mid", "late"), depths):
        search[f"{phase}_depth"] = depth
    for key in (
        "early_k_d1",
        "early_k_d2",
        "early_k_d3",
        "mid_k_d1",
        "mid_k_d2",
        "mid_k_d3",
        "late_k_d1",
        "late_k_d2",
        "late_k_d3",
    ):
        search[key] = max(2, int(round(search[key] * k_multiplier)))
    for phase, depth in zip(("early", "mid", "late"), q_depths):
        search[f"{phase}_q_depth"] = depth
    search.update(
        {
            "canonical_capture_simulation": True,
            "randomness": randomness,
            "random_top_n": random_top_n,
            "reject_immediate_terminal_replies": False,
            "root_formation_tiebreak": False,
        }
    )
    return profile


def build_cpu_tier_profiles(
    practical_v2: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    """Build six lower tiers from the practical-expert evaluation family."""
    specs = {
        "practical_tier_1": ((1, 1, 1), 0.25, 0.75, 5, (0, 0, 0)),
        "practical_tier_2": ((1, 2, 2), 0.35, 0.50, 4, (0, 1, 1)),
        "practical_tier_3": ((2, 2, 2), 0.50, 0.30, 3, (1, 1, 1)),
        "practical_tier_4": ((2, 3, 3), 0.65, 0.10, 3, (1, 1, 1)),
        "practical_tier_5": ((3, 3, 3), 0.80, 0.00, 3, (2, 1, 1)),
        "practical_tier_6": ((3, 4, 4), 1.00, 0.00, 3, (2, 1, 1)),
    }
    profiles = {
        name: _profile(
            practical_v2,
            depths=depths,
            k_multiplier=k_multiplier,
            randomness=randomness,
            random_top_n=top_n,
            q_depths=q_depths,
        )
        for name, (depths, k_multiplier, randomness, top_n, q_depths)
        in specs.items()
    }
    # Near-top keeps the proven immediate-loss guard; the strongest tier adds
    # the exact-root formation tie-break that differentiates cpu-v3.
    profiles["practical_tier_6"]["search"][
        "reject_immediate_terminal_replies"
    ] = True
    return profiles
