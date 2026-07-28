import copy

from .cpu_tier_profiles import build_cpu_tier_profiles

WEIGHT_PROFILES = {
    "balanced": {
        "search": {
            "early_depth": 3,
            "mid_depth": 4,
            "late_depth": 4,
            "high_stakes_depth_bonus": 0,
            "high_stakes_k_multiplier": 1.2,
            "randomness": 0.0,
            "random_top_n": 3,
            "early_k_d1": 20,
            "early_k_d2": 12,
            "early_k_d3": 8,
            "mid_k_d1": 16,
            "mid_k_d2": 10,
            "mid_k_d3": 6,
            "late_k_d1": 12,
            "late_k_d2": 8,
            "late_k_d3": 5,
        },
        "early": {
            "team_material": 18,
            "center_ownership": 35,
            "center_completion": 50,
            "center_stability": 25,
            "center_reach": 12,
            "dead_progress": 20,
            "color_survival": 28,
            "formation_safety": 4,
            "mobility": 1,
        },
        "mid": {
            "team_material": 22,
            "center_ownership": 50,
            "center_completion": 70,
            "center_stability": 35,
            "center_reach": 8,
            "dead_progress": 28,
            "color_survival": 36,
            "formation_safety": 4,
            "mobility": 1,
        },
        "late": {
            "team_material": 28,
            "center_ownership": 70,
            "center_completion": 90,
            "center_stability": 45,
            "center_reach": 4,
            "dead_progress": 40,
            "color_survival": 50,
            "formation_safety": 3,
            "mobility": 0,
        },
    },
    "center_focus": {
        "search": {
            "early_depth": 3,
            "mid_depth": 4,
            "late_depth": 4,
            "high_stakes_depth_bonus": 0,
            "high_stakes_k_multiplier": 1.2,
            "randomness": 0.0,
            "random_top_n": 3,
            "early_k_d1": 20,
            "early_k_d2": 12,
            "early_k_d3": 8,
            "mid_k_d1": 16,
            "mid_k_d2": 10,
            "mid_k_d3": 6,
            "late_k_d1": 12,
            "late_k_d2": 8,
            "late_k_d3": 5,
        },
        "early": {
            "team_material": 14,
            "center_ownership": 55,
            "center_completion": 80,
            "center_stability": 35,
            "center_reach": 18,
            "dead_progress": 16,
            "color_survival": 22,
            "formation_safety": 3,
            "mobility": 0,
        },
        "mid": {
            "team_material": 18,
            "center_ownership": 70,
            "center_completion": 100,
            "center_stability": 45,
            "center_reach": 12,
            "dead_progress": 20,
            "color_survival": 26,
            "formation_safety": 3,
            "mobility": 0,
        },
        "late": {
            "team_material": 22,
            "center_ownership": 90,
            "center_completion": 130,
            "center_stability": 55,
            "center_reach": 6,
            "dead_progress": 26,
            "color_survival": 30,
            "formation_safety": 2,
            "mobility": 0,
        },
    },
    "death_focus": {
        "search": {
            "early_depth": 3,
            "mid_depth": 4,
            "late_depth": 4,
            "high_stakes_depth_bonus": 0,
            "high_stakes_k_multiplier": 1.2,
            "randomness": 0.0,
            "random_top_n": 3,
            "early_k_d1": 20,
            "early_k_d2": 12,
            "early_k_d3": 8,
            "mid_k_d1": 16,
            "mid_k_d2": 10,
            "mid_k_d3": 6,
            "late_k_d1": 12,
            "late_k_d2": 8,
            "late_k_d3": 5,
        },
        "early": {
            "team_material": 22,
            "center_ownership": 25,
            "center_completion": 35,
            "center_stability": 18,
            "center_reach": 8,
            "dead_progress": 40,
            "color_survival": 45,
            "formation_safety": 6,
            "mobility": 1,
        },
        "mid": {
            "team_material": 26,
            "center_ownership": 30,
            "center_completion": 45,
            "center_stability": 22,
            "center_reach": 6,
            "dead_progress": 55,
            "color_survival": 60,
            "formation_safety": 6,
            "mobility": 1,
        },
        "late": {
            "team_material": 30,
            "center_ownership": 35,
            "center_completion": 55,
            "center_stability": 26,
            "center_reach": 4,
            "dead_progress": 70,
            "color_survival": 80,
            "formation_safety": 5,
            "mobility": 0,
        },
    },
    "reach_pressure": {
        "search": {
            "early_depth": 3,
            "mid_depth": 4,
            "late_depth": 4,
            "high_stakes_depth_bonus": 0,
            "high_stakes_k_multiplier": 1.2,
            "randomness": 0.0,
            "random_top_n": 3,
            "early_k_d1": 20,
            "early_k_d2": 12,
            "early_k_d3": 8,
            "mid_k_d1": 16,
            "mid_k_d2": 10,
            "mid_k_d3": 6,
            "late_k_d1": 12,
            "late_k_d2": 8,
            "late_k_d3": 5,
        },
        "early": {
            "team_material": 14,
            "center_ownership": 30,
            "center_completion": 40,
            "center_stability": 18,
            "center_reach": 30,
            "dead_progress": 12,
            "color_survival": 16,
            "formation_safety": 2,
            "mobility": 3,
        },
        "mid": {
            "team_material": 16,
            "center_ownership": 40,
            "center_completion": 55,
            "center_stability": 24,
            "center_reach": 26,
            "dead_progress": 14,
            "color_survival": 18,
            "formation_safety": 2,
            "mobility": 2,
        },
        "late": {
            "team_material": 18,
            "center_ownership": 50,
            "center_completion": 70,
            "center_stability": 30,
            "center_reach": 18,
            "dead_progress": 16,
            "color_survival": 20,
            "formation_safety": 2,
            "mobility": 1,
        },
    },
    "material_guard": {
        "search": {
            "early_depth": 3,
            "mid_depth": 4,
            "late_depth": 4,
            "high_stakes_depth_bonus": 0,
            "high_stakes_k_multiplier": 1.2,
            "randomness": 0.0,
            "random_top_n": 3,
            "early_k_d1": 20,
            "early_k_d2": 12,
            "early_k_d3": 8,
            "mid_k_d1": 16,
            "mid_k_d2": 10,
            "mid_k_d3": 6,
            "late_k_d1": 12,
            "late_k_d2": 8,
            "late_k_d3": 5,
        },
        "early": {
            "team_material": 32,
            "center_ownership": 22,
            "center_completion": 30,
            "center_stability": 16,
            "center_reach": 6,
            "dead_progress": 18,
            "color_survival": 34,
            "formation_safety": 8,
            "mobility": 2,
        },
        "mid": {
            "team_material": 38,
            "center_ownership": 26,
            "center_completion": 36,
            "center_stability": 18,
            "center_reach": 4,
            "dead_progress": 22,
            "color_survival": 40,
            "formation_safety": 8,
            "mobility": 1,
        },
        "late": {
            "team_material": 44,
            "center_ownership": 30,
            "center_completion": 42,
            "center_stability": 20,
            "center_reach": 2,
            "dead_progress": 26,
            "color_survival": 48,
            "formation_safety": 7,
            "mobility": 0,
        },
    },
    "death_focus_mutated_best": {
        "search": {
            "early_depth": 3,
            "mid_depth": 4,
            "late_depth": 4,
            "high_stakes_depth_bonus": 0,
            "high_stakes_k_multiplier": 1.2,
            "randomness": 0.0,
            "random_top_n": 3,
            "early_k_d1": 20,
            "early_k_d2": 12,
            "early_k_d3": 8,
            "mid_k_d1": 16,
            "mid_k_d2": 10,
            "mid_k_d3": 6,
            "late_k_d1": 12,
            "late_k_d2": 8,
            "late_k_d3": 5,
        },
        "early": {
            "team_material": 19.606,
            "center_ownership": 27.151,
            "center_completion": 33.233,
            "center_stability": 16.463,
            "center_reach": 7.266,
            "dead_progress": 40,
            "color_survival": 45,
            "formation_safety": 5.724,
            "mobility": 1.076,
        },
        "mid": {
            "team_material": 24.008,
            "center_ownership": 30.588,
            "center_completion": 46.5,
            "center_stability": 21.326,
            "center_reach": 6.069,
            "dead_progress": 55,
            "color_survival": 60,
            "formation_safety": 5.37,
            "mobility": 0.894,
        },
        "late": {
            "team_material": 27.883,
            "center_ownership": 36.515,
            "center_completion": 54.044,
            "center_stability": 24.84,
            "center_reach": 4.082,
            "dead_progress": 70,
            "color_survival": 80,
            "formation_safety": 4.944,
            "mobility": 0.0,
        },
    },
    "death_focus_mutated_best_tuned_candidate_1": {
        "search": {
            "early_depth": 3,
            "mid_depth": 4,
            "late_depth": 4,
            "high_stakes_depth_bonus": 0,
            "high_stakes_k_multiplier": 1.2,
            "randomness": 0.0,
            "random_top_n": 3,
            "early_k_d1": 20,
            "early_k_d2": 12,
            "early_k_d3": 8,
            "mid_k_d1": 16,
            "mid_k_d2": 10,
            "mid_k_d3": 6,
            "late_k_d1": 12,
            "late_k_d2": 8,
            "late_k_d3": 5,
        },
        "early": {
            "team_material": 21.465,
            "center_ownership": 24.55,
            "center_completion": 34.047,
            "center_stability": 17.149,
            "center_reach": 6.988,
            "dead_progress": 40.573,
            "color_survival": 39.098,
            "formation_safety": 4.968,
            "mobility": 0.981,
        },
        "mid": {
            "team_material": 25.307,
            "center_ownership": 29.924,
            "center_completion": 43.907,
            "center_stability": 21.873,
            "center_reach": 5.984,
            "dead_progress": 51.696,
            "color_survival": 65.299,
            "formation_safety": 5.691,
            "mobility": 0.825,
        },
        "late": {
            "team_material": 28.506,
            "center_ownership": 36.791,
            "center_completion": 60.126,
            "center_stability": 26.55,
            "center_reach": 3.822,
            "dead_progress": 80.084,
            "color_survival": 70.834,
            "formation_safety": 4.823,
            "mobility": 0.0,
        },
    },
    # ==========================================================================
    # Expert Profile (Level 13) - Strongest AI, tuned for ~60s response time
    # ==========================================================================
    "expert": {
        "search": {
            "early_depth": 4,
            "mid_depth": 4,
            "late_depth": 5,
            "high_stakes_depth_bonus": 0,
            "high_stakes_k_multiplier": 1.2,
            "randomness": 0.0,
            "random_top_n": 3,
            "early_k_d1": 24,
            "early_k_d2": 16,
            "early_k_d3": 10,
            "mid_k_d1": 20,
            "mid_k_d2": 14,
            "mid_k_d3": 8,
            "late_k_d1": 16,
            "late_k_d2": 12,
            "late_k_d3": 6,
        },
        "early": {
            "team_material": 21.465,
            "center_ownership": 24.55,
            "center_completion": 34.047,
            "center_stability": 17.149,
            "center_reach": 6.988,
            "dead_progress": 40.573,
            "color_survival": 39.098,
            "formation_safety": 4.968,
            "mobility": 0.981,
        },
        "mid": {
            "team_material": 25.307,
            "center_ownership": 29.924,
            "center_completion": 43.907,
            "center_stability": 21.873,
            "center_reach": 5.984,
            "dead_progress": 51.696,
            "color_survival": 65.299,
            "formation_safety": 5.691,
            "mobility": 0.825,
        },
        "late": {
            "team_material": 28.506,
            "center_ownership": 36.791,
            "center_completion": 60.126,
            "center_stability": 26.55,
            "center_reach": 3.822,
            "dead_progress": 80.084,
            "color_survival": 70.834,
            "formation_safety": 4.823,
            "mobility": 0.0,
        },
    },
}

_WEAK_VARIANT_SUFFIXES = (
    "_beginner", "_novice", "_weakest", "_weaker", "_random"
)
_BASE_PROFILES = {
    name: profile
    for name, profile in WEIGHT_PROFILES.items()
    if not name.endswith(_WEAK_VARIANT_SUFFIXES)
}


def _clamp_int(value: float, minimum: int) -> int:
    return max(minimum, int(round(value)))


def _make_weak_variant(
    profile: dict,
    depth_delta: int,
    k_multiplier: float,
    randomness_delta: float
) -> dict:
    variant = copy.deepcopy(profile)
    search = variant.get("search", {})

    for key in ("early_depth", "mid_depth", "late_depth"):
        if key in search:
            search[key] = max(1, int(search[key] + depth_delta))

    for key in (
        "early_k_d1", "early_k_d2", "early_k_d3",
        "mid_k_d1", "mid_k_d2", "mid_k_d3",
        "late_k_d1", "late_k_d2", "late_k_d3",
    ):
        if key in search:
            search[key] = _clamp_int(search[key] * k_multiplier, 2)

    randomness = float(search.get("randomness", 0.0))
    search["randomness"] = max(0.0, min(1.0, randomness + randomness_delta))
    search["random_top_n"] = max(2, int(search.get("random_top_n", 3)))

    variant["search"] = search
    return variant


for name, profile in _BASE_PROFILES.items():
    # Super weak variants for beginners
    WEIGHT_PROFILES[f"{name}_beginner"] = _make_weak_variant(
        profile,
        depth_delta=-2,
        k_multiplier=0.4,
        randomness_delta=0.5,
    )
    WEIGHT_PROFILES[f"{name}_novice"] = _make_weak_variant(
        profile,
        depth_delta=-2,
        k_multiplier=0.5,
        randomness_delta=0.3,
    )
    # Standard weak variants
    WEIGHT_PROFILES[f"{name}_weakest"] = _make_weak_variant(
        profile,
        depth_delta=-1,
        k_multiplier=0.6,
        randomness_delta=0.2,
    )
    WEIGHT_PROFILES[f"{name}_weaker"] = _make_weak_variant(
        profile,
        depth_delta=-1,
        k_multiplier=0.8,
        randomness_delta=0.0,
    )
    WEIGHT_PROFILES[f"{name}_random"] = _make_weak_variant(
        profile,
        depth_delta=0,
        k_multiplier=1.0,
        randomness_delta=0.2,
    )


# Practical expert candidate: retain level 12's proven strategic weights and
# search budget, but remove the disproportionately expensive whole-board
# formation term. Center tactics remain explicitly evaluated, and tree
# transitions opt into the canonical dead-piece capture rule.
WEIGHT_PROFILES["practical_expert_v2"] = copy.deepcopy(
    WEIGHT_PROFILES["death_focus_mutated_best_tuned_candidate_1"]
)
WEIGHT_PROFILES["practical_expert_v2"]["search"]["canonical_capture_simulation"] = True
for _phase in ("early", "mid", "late"):
    WEIGHT_PROFILES["practical_expert_v2"][_phase]["formation_safety"] = 0.0


# Level 13 candidate: preserve v2 scoring and reject roots that permit an
# immediate terminal reply when at least one safe baseline root exists.
WEIGHT_PROFILES["practical_expert_v3"] = copy.deepcopy(
    WEIGHT_PROFILES["practical_expert_v2"]
)
WEIGHT_PROFILES["practical_expert_v3"]["search"].update(
    {
        "reject_immediate_terminal_replies": True,
        "root_formation_tiebreak": True,
    }
)


# Experimental lower tiers share practical_expert_v2's evaluation weights.
# Product level registration happens only after ladder admission.
WEIGHT_PROFILES.update(
    build_cpu_tier_profiles(WEIGHT_PROFILES["practical_expert_v2"])
)
