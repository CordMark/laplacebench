"""Capture geometry that a bounded candidate set must not truncate away.

`MinimaxAgent.limit_k_best_moves` keeps a fixed-width head of `order_moves`'
ranking. That ranking scores captures, center occupation, and center distance,
so every feature describes what a move *does to the opponent* or *where it
goes*, and none describes what it *saves*. A reply that runs an attacked piece
away, or that blocks the attacker, therefore ranks low and can be cut before it
is ever searched — at minimizing nodes that turns into an opponent model which
assumes the opponent never defends.

This module computes, once per node, the squares involved in the opposing
team's immediate captures, so the bound can keep every reply that answers one.
It reads the position only; it never mutates it.
"""

from typing import Any, Dict, Set, Tuple


Square = Tuple[int, int]

_ADJACENT = ((-1, 0), (1, 0), (0, -1), (0, 1))


def _has_adjacent_capture_partner(
    board,
    board_size: int,
    row: int,
    column: int,
    mover: int,
) -> bool:
    """Whether a piece landing here could capture anything at all.

    Sandwich capture scans outward from the destination and needs the first
    square in some direction to hold a piece the mover does not own; surrounded
    capture inspects the same four neighbours. Both therefore require one
    non-mover piece directly adjacent, so this rejects most moves before the
    much more expensive capture simulation runs.
    """
    for row_delta, column_delta in _ADJACENT:
        adjacent_row = row + row_delta
        adjacent_column = column + column_delta
        if not (
            0 <= adjacent_row < board_size
            and 0 <= adjacent_column < board_size
        ):
            continue
        neighbor = board[adjacent_row][adjacent_column]
        if neighbor and neighbor.get("player") != mover:
            return True
    return False


def immediate_capture_geometry(
    agent,
    game_state: Dict[str, Any],
    analysis,
) -> Tuple[Set[Square], Set[Square]]:
    """Return (evadable own squares, squares that deny an incoming capture).

    The first set holds squares of the side to move's own pieces that some
    opposing-team move would capture, so every move leaving such a square is an
    evasion. The second holds each such attacker's destination plus the empty
    squares it slides across, so a move landing on one of them denies that
    attack by occupancy.

    Both sets depend only on the position, which keeps the resulting candidate
    set a pure function of (position, depth) and therefore keeps transposition
    entries consistent.
    """
    board = game_state["board"]
    board_size = analysis.board_size
    side = game_state["currentPlayer"]
    own_team_players = agent.teams[agent.get_player_team(side)]
    opposing_players = agent.teams[
        "B" if agent.get_player_team(side) == "A" else "A"
    ]

    evadable: Set[Square] = set()
    denial: Set[Square] = set()

    for opponent in opposing_players:
        for move in analysis.get_player_moves(opponent, agent):
            from_row, from_column = move["from"]
            mover = board[from_row][from_column]
            if not mover or mover.get("isDead", False):
                # Dead pieces move but never capture.
                continue
            to_row, to_column = move["to"]
            if not _has_adjacent_capture_partner(
                board,
                board_size,
                to_row,
                to_column,
                opponent,
            ):
                continue
            captured = agent.simulate_captures_in_place(
                game_state,
                move["from"],
                move["to"],
                opponent,
            )
            if not captured:
                continue

            hits_own_team = False
            for row, column in captured:
                victim = board[row][column]
                if not victim or victim.get("player") not in own_team_players:
                    continue
                hits_own_team = True
                if victim.get("player") == side:
                    # Only the side to move can walk this piece away.
                    evadable.add((row, column))
            if not hits_own_team:
                continue

            denial.add((to_row, to_column))
            row_step = (to_row > from_row) - (to_row < from_row)
            column_step = (to_column > from_column) - (to_column < from_column)
            row, column = from_row + row_step, from_column + column_step
            while (row, column) != (to_row, to_column):
                denial.add((row, column))
                row += row_step
                column += column_step

    return evadable, denial
