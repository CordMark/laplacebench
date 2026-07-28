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
CPU_POLICY_VERSION = CPU_V4_POLICY_VERSION
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
CPU_VISIBLE_LEVEL_IDS: Tuple[CpuLevelId, ...] = tuple(
    tier.level_id for tier in CPU_V4_VISIBLE_TIERS
)
CPU_DEFAULT_LEVEL_ID: CpuLevelId = "level_3"
_CPU_V4_VISIBLE_BY_ID = {
    tier.level_id: tier for tier in CPU_V4_VISIBLE_TIERS
}
_CPU_V4_TOP_PROFILE = CPU_V4_VISIBLE_TIERS[-1].profile_name
CPU_V4_LEVELS: Tuple[CpuLevel, ...] = tuple(
    CpuLevel(
        level.level_id,
        (
            _CPU_V4_VISIBLE_BY_ID[level.level_id].profile_name
            if level.level_id in _CPU_V4_VISIBLE_BY_ID
            else _CPU_V4_TOP_PROFILE
        ),
    )
    for level in CPU_V1_LEVELS
)
CPU_LEVELS: Tuple[CpuLevel, ...] = CPU_V4_LEVELS
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
CPU_LEVELS_BY_POLICY: Mapping[
    str, Mapping[CpuLevelId, CpuLevel]
] = MappingProxyType(
    {
        CPU_V1_POLICY_VERSION: CPU_V1_LEVELS_BY_ID,
        CPU_V2_POLICY_VERSION: CPU_V2_LEVELS_BY_ID,
        CPU_V3_POLICY_VERSION: CPU_V3_LEVELS_BY_ID,
        CPU_V4_POLICY_VERSION: CPU_V4_LEVELS_BY_ID,
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
    """Resolve the current ordinal cpu-v4 mapping."""

    return CPU_V4_LEVELS_BY_ID[level_id]


def get_cpu_level_for_policy(
    policy_version: str,
    level_id: CpuLevelId,
) -> CpuLevel:
    """Resolve any frozen/current product policy without implicit fallback."""

    return CPU_LEVELS_BY_POLICY[policy_version][level_id]
