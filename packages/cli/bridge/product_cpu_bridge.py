"""LaplaceBench <-> bundled product CPU bridge (product-cpu-bridge-v1).

The package contains byte-exact, commit-addressed product CPU snapshots. This
process verifies the package-trusted index, policy manifest, file set, and
every source digest before importing one policy. It never reads a product
checkout or network resource at runtime.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.abc
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import time
from types import MappingProxyType
from typing import Any

sys.dont_write_bytecode = True


BRIDGE_ROOT = Path(__file__).resolve().parent
TRUSTED_INDEX = BRIDGE_ROOT / "trusted_product_cpu_policies.json"
VENDOR_ROOT = BRIDGE_ROOT / "vendor"
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")


def _read_json(path: Path) -> tuple[bytes, dict[str, Any]]:
    raw = path.read_bytes()
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"{path.name} must contain an object")
    return raw, parsed


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class _SnapshotImporter(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    """Import the exact bytes that passed digest verification."""

    def __init__(self, sources: dict[str, bytes], policy_root: Path):
        self._sources = MappingProxyType(dict(sources))
        self._policy_root = policy_root

    def _relative(self, fullname: str) -> tuple[str, bool] | None:
        module_path = fullname.replace(".", "/")
        package = f"{module_path}/__init__.py"
        if package in self._sources:
            return package, True
        module = f"{module_path}.py"
        if module in self._sources:
            return module, False
        return None

    def find_spec(self, fullname: str, path=None, target=None):
        found = self._relative(fullname)
        if found is None:
            return None
        relative, is_package = found
        return importlib.util.spec_from_loader(
            fullname,
            self,
            origin=str(self._policy_root / relative),
            is_package=is_package,
        )

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        found = self._relative(module.__name__)
        if found is None:
            raise ImportError(f"verified source missing for {module.__name__}")
        relative, _ = found
        code = compile(
            self._sources[relative],
            str(self._policy_root / relative),
            "exec",
            dont_inherit=True,
        )
        exec(code, module.__dict__)


def _verified_policy_snapshot(policy: str):
    if sys.version_info < (3, 11):
        raise RuntimeError(
            f"Python 3.11+ is required (found {sys.version.split()[0]})"
        )

    _, trusted = _read_json(TRUSTED_INDEX)
    if trusted.get("schema") != "laplace-bundled-product-cpu-index-v1":
        raise ValueError("unsupported trusted product CPU index schema")
    policies = trusted.get("policies")
    if not isinstance(policies, dict) or policy not in policies:
        raise ValueError(f"unsupported bundled product CPU policy: {policy}")
    anchor = policies[policy]
    if not isinstance(anchor, dict):
        raise ValueError(f"malformed trusted policy anchor: {policy}")

    bundle_dir = anchor.get("bundle_dir")
    if (
        not isinstance(bundle_dir, str)
        or not re.fullmatch(r"generations/[0-9a-f]{64}/" + re.escape(policy), bundle_dir)
    ):
        raise ValueError(f"bundled {policy} bundle directory is malformed")
    policy_root = VENDOR_ROOT / bundle_dir
    manifest_path = policy_root / "manifest.json"
    manifest_raw, manifest = _read_json(manifest_path)
    if _sha256(manifest_raw) != anchor.get("manifest_sha256"):
        raise ValueError(f"bundled {policy} manifest digest mismatch")
    if manifest.get("schema") != "laplace-bundled-product-cpu-policy-v1":
        raise ValueError(f"unsupported bundled {policy} manifest schema")
    if manifest.get("policy_version") != policy:
        raise ValueError(f"bundled {policy} manifest policy_version mismatch")
    for key in ("command_role", "product_commit"):
        if manifest.get(key) != anchor.get(key):
            raise ValueError(f"bundled {policy} manifest {key} mismatch")
    commit = anchor.get("product_commit")
    if not isinstance(commit, str) or not FULL_SHA.fullmatch(commit):
        raise ValueError(f"bundled {policy} product commit is not a full SHA")

    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        raise ValueError(f"bundled {policy} manifest has no files")
    expected = set(files)
    actual = {
        source.relative_to(policy_root).as_posix()
        for source in (policy_root / "agents").rglob("*.py")
        if source.is_file()
    }
    if actual != expected:
        raise ValueError(
            f"bundled {policy} Python file set mismatch: "
            f"expected={sorted(expected)}, actual={sorted(actual)}"
        )
    snapshot: dict[str, bytes] = {}
    for relative, expected_digest in sorted(files.items()):
        if (
            not isinstance(relative, str)
            or not relative.startswith("agents/")
            or not isinstance(expected_digest, str)
            or not re.fullmatch(r"[0-9a-f]{64}", expected_digest)
        ):
            raise ValueError(f"bundled {policy} manifest file entry is malformed")
        source = policy_root / relative
        source_bytes = source.read_bytes()
        if _sha256(source_bytes) != expected_digest:
            raise ValueError(f"bundled {policy} source digest mismatch: {relative}")
        snapshot[relative] = source_bytes

    return anchor, policy_root, snapshot


def _load_policy(policy: str):
    anchor, policy_root, snapshot = _verified_policy_snapshot(policy)

    importer = _SnapshotImporter(snapshot, policy_root)
    sys.meta_path.insert(0, importer)
    levels = importlib.import_module("agents.cpu_levels")
    minimax = importlib.import_module("agents.minimax")
    weights = importlib.import_module("agents.weight_profiles")

    if getattr(levels, "CPU_POLICY_VERSION", None) != policy:
        raise ValueError(f"bundled {policy} active policy mismatch")
    visible_symbol = anchor.get("visible_tiers_symbol")
    resolver_symbol = anchor.get("level_resolver_symbol")
    visible_tiers = getattr(levels, visible_symbol, None)
    resolver = getattr(levels, resolver_symbol, None)
    if not isinstance(visible_tiers, tuple) or not callable(resolver):
        raise ValueError(f"bundled {policy} registry symbols are unavailable")
    return anchor, visible_tiers, resolver, minimax.MinimaxAgent, weights.WEIGHT_PROFILES


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", required=True)
    args = parser.parse_args()

    anchor, visible_tiers, get_cpu_level, MinimaxAgent, weight_profiles = _load_policy(
        args.policy
    )
    for tier in visible_tiers:
        if tier.profile_name not in weight_profiles:
            raise ValueError(f"missing profile: {tier.profile_name}")
        agent = MinimaxAgent(
            profile_name=tier.profile_name,
            error_policy="raise",
            strict_profile=True,
        )
        if agent.weight_profile_name != tier.profile_name:
            raise ValueError(f"profile resolution mismatch: {tier.profile_name}")

    visible = {tier.level_id: tier for tier in visible_tiers}
    emit = sys.stdout
    print(
        json.dumps(
            {
                "t": "hello",
                "protocol": "product-cpu-bridge-v1",
                "policy_version": args.policy,
                "product_commit": anchor["product_commit"],
                "distribution": "bundled",
                "python": sys.version,
                "visible_tiers": [
                    {
                        "level_id": tier.level_id,
                        "profile_name": tier.profile_name,
                        "p95_limit_seconds": tier.p95_limit_seconds,
                    }
                    for tier in visible_tiers
                ],
            }
        ),
        file=emit,
        flush=True,
    )

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            op = req.get("op")
            level_id = req.get("level_id")
            if level_id not in visible:
                raise ValueError(f"level_id not a visible tier: {level_id}")
            profile = get_cpu_level(level_id).profile_name
            state = req["state"]
            started = time.monotonic()
            if op == "move":
                seed = req.get("seed")
                agent = MinimaxAgent(
                    profile_name=profile, strict_profile=True, seed=seed
                )
                with contextlib.redirect_stdout(io.StringIO()):
                    prediction = agent.predict(state)
                if prediction is None:
                    raise ValueError("no legal move for acting player")
                resp = {
                    "id": req_id,
                    "move": {
                        "from": list(prediction["from"]),
                        "to": list(prediction["to"]),
                    },
                    "seed_used": seed,
                    "elapsed_ms": round((time.monotonic() - started) * 1000),
                }
            elif op == "score_roots":
                agent = MinimaxAgent(profile_name=profile, strict_profile=True)
                with contextlib.redirect_stdout(io.StringIO()):
                    analysis = agent.score_root_moves_for_analysis(state)
                resp = {
                    "id": req_id,
                    "depth": analysis["depth"],
                    "roots": [
                        {
                            "move": root["move"],
                            "value": root["value"],
                            "rank": root["rank"],
                            "selectionClass": root["selectionClass"],
                            "immediateWin": root["immediateWin"],
                            "unsafe": root["unsafe"],
                        }
                        for root in analysis["roots"]
                    ],
                    "elapsed_ms": round((time.monotonic() - started) * 1000),
                }
            else:
                raise ValueError(f"unknown op: {op}")
        except Exception as exc:  # protocol errors answer, never kill the process
            resp = {"id": req_id, "error": f"{type(exc).__name__}: {exc}"}
        print(json.dumps(resp), file=emit, flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
