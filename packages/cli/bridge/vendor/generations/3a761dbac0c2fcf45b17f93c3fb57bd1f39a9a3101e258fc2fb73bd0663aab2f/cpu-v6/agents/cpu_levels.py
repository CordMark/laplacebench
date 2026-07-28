"""Canonical product CPU level registry.

The public ``level_1`` ... ``level_13`` identifiers are stable transport
values.  Their profile mapping is versioned so API responses and offline
evaluation artifacts can identify the exact product policy they exercised.
"""

from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal, Mapping, Tuple


CPU_V1_POLICY_VERSION = "cpu-v1"
CPU_V2_POLICY_VERSION = "cpu-v2"
CPU_V3_POLICY_VERSION = "cpu-v3"
CPU_V4_POLICY_VERSION = "cpu-v4"
CPU_V5_POLICY_VERSION = "cpu-v5"
CPU_V6_POLICY_VERSION = "cpu-v6"
# cpu-v5 is registered but NOT active: its promotion evidence was rejected at the
# implementation checkpoint (the expansion sample was defined after an adverse
# initial result). It stays as the historical record of that decision.
#
# cpu-v6 IS active. Its pre-registered sample - size, seeds and bar all fixed in
# the approved plan before a game ran - scored 0.7000 against level_5 with a
# paired 95% lower bound of 0.5899, and 0.8375 against level_4, at p95 6.5804s
# inside the declared 10s budget, with all 80 logs canonically replayed and
# attested. `v6_admission.admit` verifies every one of those mechanically.
# Levels 1-5 keep the exact profiles and budgets cpu-v4 admitted; the change is
# an appended sixth tier, so no admitted tier moved.
CPU_POLICY_VERSION = CPU_V6_POLICY_VERSION
CPU_POLICY_VERSIONS: Tuple[str, ...]

CpuLevelId = Literal[
    "level_1",
    "level_2",
    "level_3",
    "level_4",
    "level_5",
    "level_6",
    "level_7",
    "level_8",
    "level_9",
    "level_10",
    "level_11",
    "level_12",
    "level_13",
]


@dataclass(frozen=True)
class CpuLevel:
    """One stable product level and the versioned profile it selects."""

    level_id: CpuLevelId
    profile_name: str


@dataclass(frozen=True)
class CpuVisibleTier:
    """One user-visible ordinal tier in the active product policy."""

    level_id: CpuLevelId
    visible_rank: int
    source_raw_rank: int
    profile_name: str
    p95_limit_seconds: float


CPU_V1_LEVELS: Tuple[CpuLevel, ...] = (
    CpuLevel("level_1", "balanced_beginner"),
    CpuLevel("level_2", "balanced_novice"),
    CpuLevel("level_3", "reach_pressure_beginner"),
    CpuLevel("level_4", "reach_pressure_novice"),
    CpuLevel("level_5", "balanced_weakest"),
    CpuLevel("level_6", "balanced_weaker"),
    CpuLevel("level_7", "reach_pressure_weakest"),
    CpuLevel("level_8", "reach_pressure"),
    CpuLevel("level_9", "balanced"),
    CpuLevel("level_10", "material_guard"),
    CpuLevel("level_11", "death_focus"),
    CpuLevel("level_12", "death_focus_mutated_best_tuned_candidate_1"),
    CpuLevel("level_13", "expert"),
)

CPU_V2_LEVELS: Tuple[CpuLevel, ...] = tuple(
    CpuLevel(level.level_id, "practical_expert_v2")
    if level.level_id == "level_12"
    else level
    for level in CPU_V1_LEVELS
)
CPU_V3_LEVELS: Tuple[CpuLevel, ...] = tuple(
    CpuLevel(level.level_id, "practical_expert_v3")
    if level.level_id == "level_13"
    else level
    for level in CPU_V2_LEVELS
)
CPU_V4_VISIBLE_TIERS: Tuple[CpuVisibleTier, ...] = (
    CpuVisibleTier("level_1", 1, 1, "practical_tier_1", 0.25),
    CpuVisibleTier("level_2", 2, 2, "practical_tier_2", 0.25),
    CpuVisibleTier("level_3", 3, 3, "practical_tier_3", 0.50),
    CpuVisibleTier("level_4", 4, 5, "practical_tier_5", 1.20),
    CpuVisibleTier("level_5", 5, 7, "practical_expert_v3", 1.80),
)

def _ordinal_levels(
    visible_tiers: Tuple[CpuVisibleTier, ...],
) -> Tuple[CpuLevel, ...]:
    """Map the visible prefix one-to-one and alias the rest to the strongest."""
    visible_by_id = {tier.level_id: tier for tier in visible_tiers}
    top_profile = visible_tiers[-1].profile_name
    return tuple(
        CpuLevel(
            level.level_id,
            (
                visible_by_id[level.level_id].profile_name
                if level.level_id in visible_by_id
                else top_profile
            ),
        )
        for level in CPU_V1_LEVELS
    )


CPU_V4_LEVELS: Tuple[CpuLevel, ...] = _ordinal_levels(CPU_V4_VISIBLE_TIERS)

# cpu-v5 keeps the admitted v4 ladder and replaces only the strongest tier with
# the tactical-candidate-reserve profile. The declared p95 budget rises for that
# tier alone; tiers 1-4 keep their admitted budgets and profiles.
CPU_V5_VISIBLE_TIERS: Tuple[CpuVisibleTier, ...] = tuple(
    CpuVisibleTier(
        tier.level_id,
        tier.visible_rank,
        tier.source_raw_rank,
        "practical_expert_v4",
        3.00,
    )
    if tier.level_id == "level_5"
    else tier
    for tier in CPU_V4_VISIBLE_TIERS
)
CPU_V5_LEVELS: Tuple[CpuLevel, ...] = _ordinal_levels(CPU_V5_VISIBLE_TIERS)

# cpu-v6 adds a sixth visible tier rather than redefining one: level_1..level_5
# keep the profiles and budgets they were admitted with, and level_6 becomes the
# new strongest tier. level_7..level_13 follow the existing `_ordinal_levels`
# rule and alias to it, as they already alias to whatever the strongest tier is.
# cpu-v6 branches from the admitted cpu-v4 ladder, not from cpu-v5: cpu-v5's
# candidate was rejected as an Lv.5 *replacement*, which says nothing against the
# profile itself, and it is reused here as the search basis one tier higher.
CPU_V6_VISIBLE_TIERS: Tuple[CpuVisibleTier, ...] = CPU_V4_VISIBLE_TIERS + (
    CpuVisibleTier("level_6", 6, 8, "practical_expert_v5", 10.00),
)
CPU_V6_LEVELS: Tuple[CpuLevel, ...] = _ordinal_levels(CPU_V6_VISIBLE_TIERS)

# Everything the product serves is selected from CPU_POLICY_VERSION, so changing
# that one line genuinely changes the policy. Assigning the active ladder and
# level map to a specific version's tuple instead would make a rollback advertise
# the old version while still serving the new ladder.
_LEVELS_BY_POLICY: Mapping[str, Tuple[CpuLevel, ...]] = MappingProxyType(
    {
        CPU_V1_POLICY_VERSION: CPU_V1_LEVELS,
        CPU_V2_POLICY_VERSION: CPU_V2_LEVELS,
        CPU_V3_POLICY_VERSION: CPU_V3_LEVELS,
        CPU_V4_POLICY_VERSION: CPU_V4_LEVELS,
        CPU_V5_POLICY_VERSION: CPU_V5_LEVELS,
        CPU_V6_POLICY_VERSION: CPU_V6_LEVELS,
    }
)
# cpu-v1..cpu-v3 predate the ordinal ladder and expose every transport ID.
_VISIBLE_TIERS_BY_POLICY: Mapping[str, Tuple[CpuVisibleTier, ...]] = MappingProxyType(
    {
        CPU_V4_POLICY_VERSION: CPU_V4_VISIBLE_TIERS,
        CPU_V5_POLICY_VERSION: CPU_V5_VISIBLE_TIERS,
        CPU_V6_POLICY_VERSION: CPU_V6_VISIBLE_TIERS,
    }
)

CPU_VISIBLE_TIERS: Tuple[CpuVisibleTier, ...] = _VISIBLE_TIERS_BY_POLICY[
    CPU_POLICY_VERSION
]
CPU_VISIBLE_LEVEL_IDS: Tuple[CpuLevelId, ...] = tuple(
    tier.level_id for tier in CPU_VISIBLE_TIERS
)
CPU_DEFAULT_LEVEL_ID: CpuLevelId = "level_3"
CPU_LEVELS: Tuple[CpuLevel, ...] = _LEVELS_BY_POLICY[CPU_POLICY_VERSION]
CPU_LEVEL_IDS: Tuple[CpuLevelId, ...] = tuple(
    level.level_id for level in CPU_LEVELS
)
LEVEL_PROFILE_ORDER: Tuple[str, ...] = tuple(
    level.profile_name for level in CPU_LEVELS
)
CPU_LEVELS_BY_ID: Mapping[CpuLevelId, CpuLevel] = MappingProxyType(
    {level.level_id: level for level in CPU_LEVELS}
)
CPU_V1_LEVELS_BY_ID: Mapping[CpuLevelId, CpuLevel] = MappingProxyType(
    {level.level_id: level for level in CPU_V1_LEVELS}
)
CPU_V2_LEVELS_BY_ID: Mapping[CpuLevelId, CpuLevel] = MappingProxyType(
    {level.level_id: level for level in CPU_V2_LEVELS}
)
CPU_V3_LEVELS_BY_ID: Mapping[CpuLevelId, CpuLevel] = MappingProxyType(
    {level.level_id: level for level in CPU_V3_LEVELS}
)
CPU_V4_LEVELS_BY_ID: Mapping[CpuLevelId, CpuLevel] = MappingProxyType(
    {level.level_id: level for level in CPU_V4_LEVELS}
)
CPU_V5_LEVELS_BY_ID: Mapping[CpuLevelId, CpuLevel] = MappingProxyType(
    {level.level_id: level for level in CPU_V5_LEVELS}
)
CPU_V6_LEVELS_BY_ID: Mapping[CpuLevelId, CpuLevel] = MappingProxyType(
    {level.level_id: level for level in CPU_V6_LEVELS}
)
CPU_LEVELS_BY_POLICY: Mapping[
    str, Mapping[CpuLevelId, CpuLevel]
] = MappingProxyType(
    {
        CPU_V1_POLICY_VERSION: CPU_V1_LEVELS_BY_ID,
        CPU_V2_POLICY_VERSION: CPU_V2_LEVELS_BY_ID,
        CPU_V3_POLICY_VERSION: CPU_V3_LEVELS_BY_ID,
        CPU_V4_POLICY_VERSION: CPU_V4_LEVELS_BY_ID,
        CPU_V5_POLICY_VERSION: CPU_V5_LEVELS_BY_ID,
        CPU_V6_POLICY_VERSION: CPU_V6_LEVELS_BY_ID,
    }
)
CPU_POLICY_VERSIONS = tuple(CPU_LEVELS_BY_POLICY)
LEVEL_DIFFICULTIES: Mapping[CpuLevelId, str] = MappingProxyType(
    {
        level_id: level.profile_name
        for level_id, level in CPU_LEVELS_BY_ID.items()
    }
)


def get_cpu_level(level_id: CpuLevelId) -> CpuLevel:
    """Resolve a validated public level identifier to its policy profile."""

    return CPU_LEVELS_BY_ID[level_id]


def get_cpu_v1_level(level_id: CpuLevelId) -> CpuLevel:
    """Resolve the frozen pre-improvement mapping for replay and rollback."""

    return CPU_V1_LEVELS_BY_ID[level_id]


def get_cpu_v2_level(level_id: CpuLevelId) -> CpuLevel:
    """Resolve the frozen cpu-v2 mapping for replay and rollback."""

    return CPU_V2_LEVELS_BY_ID[level_id]


def get_cpu_v3_level(level_id: CpuLevelId) -> CpuLevel:
    """Resolve the frozen cpu-v3 mapping."""

    return CPU_V3_LEVELS_BY_ID[level_id]


def get_cpu_v4_level(level_id: CpuLevelId) -> CpuLevel:
    """Resolve the frozen ordinal cpu-v4 mapping."""

    return CPU_V4_LEVELS_BY_ID[level_id]


def get_cpu_v5_level(level_id: CpuLevelId) -> CpuLevel:
    """Resolve the current ordinal cpu-v5 mapping."""

    return CPU_V5_LEVELS_BY_ID[level_id]


def get_cpu_level_for_policy(
    policy_version: str,
    level_id: CpuLevelId,
) -> CpuLevel:
    """Resolve any frozen/current product policy without implicit fallback."""

    return CPU_LEVELS_BY_POLICY[policy_version][level_id]
