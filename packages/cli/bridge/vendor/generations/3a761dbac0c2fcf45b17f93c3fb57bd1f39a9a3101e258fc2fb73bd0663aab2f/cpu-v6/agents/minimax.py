import copy
import math
import os
import random
import time
from dataclasses import asdict, dataclass, field
from typing import Dict, Any, List, Literal, Tuple, Optional
from .base import BaseModel
from .tactical_candidates import immediate_capture_geometry
from .weight_profiles import WEIGHT_PROFILES


ErrorPolicy = Literal["fallback", "raise"]
PRODUCTION_ERROR_POLICY: ErrorPolicy = "fallback"
EVALUATION_ERROR_POLICY: ErrorPolicy = "raise"


@dataclass
class SearchStats:
    """Mutable, single-search instrumentation returned as a detached snapshot."""

    profile_name: str
    seed: Optional[int]
    requested_depth: int = 0
    baseline_depth: int = 0
    root_moves: int = 0
    evaluated_root_moves: int = 0
    rejected_immediate_loss_roots: int = 0
    root_tiebreak_candidates: int = 0
    nodes: int = 0
    minimax_nodes: int = 0
    quiescence_nodes: int = 0
    cutoffs: int = 0
    transposition_lookups: int = 0
    transposition_hits: int = 0
    transposition_stores: int = 0
    repetition_hits: int = 0
    terminal_nodes: int = 0
    leaf_evaluations: int = 0
    effective_depth: int = 0
    selected_evaluation: Optional[float] = None
    randomized_selection: bool = False
    fallback_used: bool = False
    completed: bool = False
    elapsed_seconds: float = 0.0
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    selected_root_formation_pressure: Optional[float] = None
    scored_moves: List[Dict[str, Any]] = field(default_factory=list)

    def snapshot(self) -> Dict[str, Any]:
        """Return data that cannot mutate this collector or a later search."""
        return copy.deepcopy(asdict(self))


class MinimaxSearchError(RuntimeError):
    """Strict-evaluation error carrying the failed search's instrumentation."""

    def __init__(self, message: str, stats: Dict[str, Any]):
        super().__init__(message)
        self.stats = stats


class MoveUndoInfo:
    """Stores information needed to undo a move."""

    def __init__(self):
        # Board changes
        self.from_row: int = 0
        self.from_col: int = 0
        self.to_row: int = 0
        self.to_col: int = 0
        self.moved_piece: Optional[Dict[str, Any]] = None
        self.destination_piece: Optional[Dict[str, Any]] = None  # Usually None
        self.captured_pieces: List[Tuple[int, int, Dict[str, Any]]] = []  # (row, col, piece_data)

        # Game state changes
        self.previous_current_player: int = 0
        self.previous_captured_pieces: List[int] = []
        self.previous_eliminated_players: List[bool] = []

        # Track pieces whose isDead status was changed
        # (row, col, originally had isDead key, original value)
        self.pieces_made_dead: List[Tuple[int, int, bool, bool]] = []


class BoardAnalysis:
    """Cached analysis of board state to avoid redundant computations."""

    def __init__(self, game_state: Dict[str, Any]):
        self.board = game_state['board']
        self.board_size = game_state['boardSize']
        self.current_player = game_state['currentPlayer']
        self.eliminated_players = game_state['eliminatedPlayers']

        # Cache all piece information in single scan
        self.piece_counts = [0, 0, 0, 0]  # Player 1-4 piece counts
        self.dead_piece_counts = [0, 0, 0, 0]  # Dead piece counts
        self.piece_positions = [[], [], [], []]  # Positions for each player

        # Perform single board scan
        for r in range(self.board_size):
            for c in range(self.board_size):
                piece = self.board[r][c]
                if piece:
                    player_idx = piece['player'] - 1
                    self.piece_positions[player_idx].append((r, c))
                    if piece.get('isDead', False):
                        self.dead_piece_counts[player_idx] += 1
                    else:
                        self.piece_counts[player_idx] += 1

        # Cache move generation (will be populated lazily)
        self._cached_moves = {}
        self._cached_mobility = {}

    def get_player_piece_count(self, player: int) -> int:
        """Get piece count for a specific player."""
        return self.piece_counts[player - 1] + self.dead_piece_counts[player - 1]

    def get_team_piece_count(self, team_players: List[int]) -> float:
        """Get total piece count for a team."""
        count = 0.0
        for player in team_players:
            player_idx = player - 1
            count += self.piece_counts[player_idx]  # Live pieces count as 1.0
            count += self.dead_piece_counts[player_idx] * 0.5  # Dead pieces count as 0.5
        return count

    def get_player_moves(self, player: int, minimax_agent) -> List[Dict[str, Any]]:
        """Get cached moves for a player."""
        if player not in self._cached_moves:
            moves = []
            for row, column in self.piece_positions[player - 1]:
                destinations = minimax_agent.get_valid_moves_for_piece(
                    self.board,
                    row,
                    column,
                    self.board_size,
                )
                for destination in destinations:
                    moves.append(
                        {
                            "from": [row, column],
                            "to": destination,
                            "description": (
                                f"({row},{column}) → "
                                f"({destination[0]},{destination[1]})"
                            ),
                        }
                    )
            self._cached_moves[player] = moves
        return self._cached_moves[player]

    def get_team_mobility(self, team_players: List[int], minimax_agent) -> int:
        """Get cached mobility for a team."""
        if frozenset(team_players) not in self._cached_mobility:
            total_moves = 0
            for player in team_players:
                moves = self.get_player_moves(player, minimax_agent)
                total_moves += len(moves)
            self._cached_mobility[frozenset(team_players)] = total_moves
        return self._cached_mobility[frozenset(team_players)]


class TranspositionTable:
    """Transposition table for caching position evaluations."""

    def __init__(self, max_size=100000):
        self.table = {}
        self.max_size = max_size

    def get(self, hash_key, depth, alpha, beta):
        """Get cached evaluation if available and valid."""
        if hash_key not in self.table:
            return None

        entry = self.table[hash_key]
        if entry['depth'] >= depth:
            value = entry['value']
            flag = entry['flag']

            if flag == 'EXACT':
                return value
            elif flag == 'LOWER' and value >= beta:
                return value
            elif flag == 'UPPER' and value <= alpha:
                return value

        return None

    def store(self, hash_key, depth, value, alpha, beta):
        """Store evaluation in transposition table."""
        if len(self.table) >= self.max_size:
            # Simple replacement: remove oldest entries
            keys_to_remove = list(self.table.keys())[:self.max_size // 4]
            for key in keys_to_remove:
                del self.table[key]

        # Determine flag based on alpha-beta bounds
        if value <= alpha:
            flag = 'UPPER'
        elif value >= beta:
            flag = 'LOWER'
        else:
            flag = 'EXACT'

        self.table[hash_key] = {
            'depth': depth,
            'value': value,
            'flag': flag
        }

    def clear(self):
        """Clear the transposition table."""
        self.table.clear()


class MinimaxAgent(BaseModel):
    """Team-based minimax policy for the 4-player game.
    Teams: A (Red:1 + Yellow:3) vs B (Blue:2 + Green:4)
    """
    BRANCH_STATS_ENABLED = False
    BRANCH_STATS = {"phase": {}, "phase_depth": {}}

    def __init__(
        self,
        profile_name: Optional[str] = None,
        weight_profiles: Optional[Dict[str, Dict[str, Dict[str, float]]]] = None,
        seed: Optional[int] = None,
        error_policy: ErrorPolicy = PRODUCTION_ERROR_POLICY,
        strict_profile: bool = False,
    ):
        super().__init__()
        if error_policy not in ("fallback", "raise"):
            raise ValueError("error_policy must be 'fallback' or 'raise'")

        # Board/Rule constants (8x8 fixed rules)
        self.center_cells = [(3, 3), (3, 4), (4, 3), (4, 4)]
        self.dead_capture_threshold = 3  # A color is "dead" after 3 captures

        self.weight_profiles = weight_profiles or WEIGHT_PROFILES
        env_profile = os.environ.get("MINIMAX_PROFILE", "balanced")
        self.weight_profile_name = profile_name or env_profile
        if self.weight_profile_name not in self.weight_profiles:
            if strict_profile:
                raise ValueError(
                    f"unknown minimax profile: {self.weight_profile_name}"
                )
            self.weight_profile_name = "balanced"

        self.seed = seed
        self.error_policy = error_policy
        self._rng = random.Random(seed)
        self.dead_piece_value = 0.65

        # Team mappings
        self.teams = {
            'A': [1, 3],  # Red + Yellow
            'B': [2, 4],  # Blue + Green
        }

        # Transposition table for caching evaluations
        self.transposition_table = TranspositionTable()

        # Repetition handling
        self.repetition_penalty = 50.0

    def hash_position(self, game_state: Dict[str, Any]) -> int:
        """Create a hash key for the current position using fast tuple hashing."""
        board = game_state['board']
        board_size = game_state['boardSize']
        current_player = game_state['currentPlayer']
        eliminated_players = game_state['eliminatedPlayers']

        # Create a tuple representation for fast hashing
        board_tuple = []
        for row in range(board_size):
            for col in range(board_size):
                piece = board[row][col]
                if piece:
                    # Encode: player (1-4) + isDead flag (8 if dead)
                    val = piece['player']
                    if piece.get('isDead', False):
                        val += 8
                    board_tuple.append(val)
                else:
                    board_tuple.append(0)

        # Include current player and eliminated status in hash
        board_tuple.append(current_player)
        board_tuple.extend(1 if e else 0 for e in eliminated_players)
        
        return hash(tuple(board_tuple))

    def predict(
        self,
        game_state: Dict[str, Any],
        *,
        include_search_stats: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Make a move prediction based on the current game state."""
        print("MinimaxAgent predicting move...")

        if include_search_stats:
            best_move, search_stats = self.get_best_move_with_stats(game_state)
        else:
            # Keep the historical prediction contract: each request starts fresh.
            self.transposition_table.clear()
            best_move = self.get_best_move(game_state)
            search_stats = None

        if best_move is None:
            return None

        prediction = {
            'from': best_move['from'],
            'to': best_move['to']
        }
        if search_stats is not None:
            prediction["search_stats"] = search_stats
        return prediction

    def get_best_move(self, game_state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get a move without collecting instrumentation (production default)."""
        best_move, _ = self._execute_search(game_state, collect_stats=False)
        return best_move

    def get_best_move_with_stats(
        self,
        game_state: Dict[str, Any],
        *,
        clear_transposition_table: bool = True,
    ) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
        """Atomically return a move and request-local search statistics."""
        if clear_transposition_table:
            self.transposition_table.clear()
        best_move, stats = self._execute_search(game_state, collect_stats=True)
        assert stats is not None
        return best_move, stats

    def score_root_moves_for_analysis(
        self,
        game_state: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Rank every legal root under a deterministic evaluation profile."""
        before = copy.deepcopy(game_state)
        self.transposition_table.clear()
        original_player = game_state["currentPlayer"]
        valid_moves = self.get_all_valid_moves(game_state)
        if not valid_moves:
            return {"depth": 0, "roots": []}

        analysis = BoardAnalysis(game_state)
        search_depth = self.get_search_depth(analysis, game_state)
        scored = self._score_root_moves(
            game_state,
            valid_moves,
            search_depth,
            original_player,
            set(),
            None,
        )
        annotated = []
        original_team = self.get_player_team(original_player)
        for value, move in scored:
            undo = self.make_move(game_state, move)
            try:
                immediate_win = self.check_win_state(game_state) == original_team
            finally:
                self.unmake_move(game_state, undo)
            annotated.append(
                {
                    "move": {
                        "from": list(move["from"]),
                        "to": list(move["to"]),
                    },
                    "value": float(value),
                    "immediateWin": immediate_win,
                    "unsafe": self._root_allows_immediate_opponent_win(
                        game_state,
                        move,
                        original_player,
                    ),
                    "formationPressure": 0.0,
                }
            )

        has_immediate = any(item["immediateWin"] for item in annotated)
        has_safe = any(not item["unsafe"] for item in annotated)
        value_groups: Dict[Tuple[int, float], List[Dict[str, Any]]] = {}
        for item in annotated:
            if has_immediate:
                selection_class = 2 if item["immediateWin"] else 0
            elif has_safe:
                selection_class = 1 if not item["unsafe"] else 0
            else:
                selection_class = 1
            item["selectionClass"] = selection_class
            value_groups.setdefault(
                (selection_class, item["value"]),
                [],
            ).append(item)

        for tied in value_groups.values():
            if len(tied) < 2:
                continue
            for item in tied:
                item["formationPressure"] = float(
                    self._root_formation_pressure(
                        game_state,
                        item["move"],
                        original_player,
                    )
                )

        preferences = [
            (
                item["selectionClass"],
                item["value"],
                item["formationPressure"],
            )
            for item in annotated
        ]
        for item, preference in zip(annotated, preferences):
            item["rank"] = 1 + sum(
                other > preference for other in preferences
            )

        if game_state != before:
            raise AssertionError("analysis root scorer mutated its input")
        return {"depth": search_depth, "roots": annotated}

    def _execute_search(
        self,
        game_state: Dict[str, Any],
        *,
        collect_stats: bool,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        stats = (
            SearchStats(profile_name=self.weight_profile_name, seed=self.seed)
            if collect_stats or self.error_policy == "raise"
            else None
        )
        started_at = time.perf_counter() if stats is not None else 0.0

        try:
            best_move = self._search_best_move(game_state, stats)
            if stats is not None:
                stats.completed = True
                stats.elapsed_seconds = time.perf_counter() - started_at
            return best_move, stats.snapshot() if collect_stats and stats is not None else None
        except Exception as error:
            if stats is not None:
                stats.error_type = type(error).__name__
                stats.error_message = str(error)
                stats.elapsed_seconds = time.perf_counter() - started_at

            if self.error_policy == "raise":
                strict_stats = stats.snapshot() if stats is not None else {}
                raise MinimaxSearchError(
                    f"Minimax search failed: {type(error).__name__}: {error}",
                    strict_stats,
                ) from error

            print(f"Error in get_best_move: {error}")
            valid_moves = self.get_all_valid_moves(game_state)
            fallback = valid_moves[0] if valid_moves else None
            if stats is not None:
                stats.fallback_used = fallback is not None
                stats.completed = False
                stats.elapsed_seconds = time.perf_counter() - started_at
            return fallback, stats.snapshot() if collect_stats and stats is not None else None

    def _search_best_move(
        self,
        game_state: Dict[str, Any],
        stats: Optional[SearchStats],
    ) -> Optional[Dict[str, Any]]:
        original_player = game_state['currentPlayer']
        valid_moves = self.get_all_valid_moves(game_state)
        if stats is not None:
            stats.root_moves = len(valid_moves)

        if len(valid_moves) == 0:
            print(f"Player {original_player}: No valid moves available")
            return None

        if len(valid_moves) == 1:
            print(f"Player {original_player}: Only one move available")
            return valid_moves[0]

        # Determine search depth based on phase and high-stakes positions
        analysis = BoardAnalysis(game_state)
        search_depth = self.get_search_depth(analysis, game_state)
        if stats is not None:
            stats.requested_depth = search_depth
            stats.baseline_depth = search_depth

        visited_hashes = set()
        scored_moves = self._score_root_moves(
            game_state,
            valid_moves,
            search_depth,
            original_player,
            visited_hashes,
            stats,
        )
        search = self.get_search_settings()
        if search.get("reject_immediate_terminal_replies", False):
            immediate = self._first_immediate_winning_root(
                game_state,
                scored_moves,
                original_player,
            )
            if immediate is not None:
                best_value, best_move = immediate
                final_scored_moves = [immediate]
            else:
                baseline_ranked = sorted(
                    scored_moves,
                    key=lambda item: item[0],
                    reverse=True,
                )
                safe_roots = [
                    item
                    for item in baseline_ranked
                    if not self._root_allows_immediate_opponent_win(
                        game_state,
                        item[1],
                        original_player,
                    )
                ]
                final_scored_moves = safe_roots or baseline_ranked
                if stats is not None and safe_roots:
                    stats.rejected_immediate_loss_roots = (
                        len(baseline_ranked) - len(safe_roots)
                    )
                best_value, best_move = final_scored_moves[0]
                if search.get("root_formation_tiebreak", False):
                    tied_best = [
                        item
                        for item in final_scored_moves
                        if item[0] == best_value
                    ]
                    if len(tied_best) > 1:
                        formation_ranked = [
                            (
                                self._root_formation_pressure(
                                    game_state,
                                    move,
                                    original_player,
                                ),
                                value,
                                move,
                            )
                            for value, move in tied_best
                        ]
                        formation, best_value, best_move = max(
                            formation_ranked,
                            key=lambda item: item[0],
                        )
                        if stats is not None:
                            stats.root_tiebreak_candidates = len(tied_best)
                            stats.selected_root_formation_pressure = formation
        else:
            best_value, best_move = max(
                scored_moves,
                key=lambda item: item[0],
            )
            final_scored_moves = scored_moves

        randomness = float(search.get("randomness", 0.0))
        top_n = int(search.get("random_top_n", 3))
        ranked_moves = (
            sorted(final_scored_moves, key=lambda item: item[0], reverse=True)
            if randomness > 0.0 or stats is not None
            else []
        )
        if randomness > 0.0 and len(final_scored_moves) > 1:
            pool = ranked_moves[:max(1, min(top_n, len(ranked_moves)))]
            if self._rng.random() < randomness:
                best_value, best_move = self._rng.choice(pool)
                if stats is not None:
                    stats.randomized_selection = True
            else:
                best_value, best_move = pool[0]

        if stats is not None:
            stats.selected_evaluation = best_value
            stats.scored_moves = self._serialize_scored_moves(ranked_moves)

        print(f"Player {original_player} best move: {best_move['description']} (eval: {best_value:.1f})")

        return best_move

    def _score_root_moves(
        self,
        game_state: Dict[str, Any],
        moves: List[Dict[str, Any]],
        search_depth: int,
        original_player: int,
        visited_hashes: set,
        stats: Optional[SearchStats],
    ) -> List[Tuple[float, Dict[str, Any]]]:
        """Score root moves at one depth while always restoring the state."""
        scored_moves: List[Tuple[float, Dict[str, Any]]] = []
        for move in moves:
            undo_info = self.make_move(game_state, move)
            try:
                value = self.minimax(
                    game_state,
                    search_depth - 1,
                    -math.inf,
                    math.inf,
                    False,
                    original_player,  # Use original player for evaluation
                    visited_hashes,
                    _stats=stats,
                    _ply=1,
                )
            finally:
                self.unmake_move(game_state, undo_info)

            scored_moves.append((value, move))
            if stats is not None:
                stats.evaluated_root_moves += 1
        return scored_moves

    @staticmethod
    def _serialize_scored_moves(
        scored_moves: List[Tuple[float, Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        return [
            {
                "from": list(move["from"]),
                "to": list(move["to"]),
                "evaluation": value,
            }
            for value, move in scored_moves
        ]

    def _first_immediate_winning_root(
        self,
        game_state: Dict[str, Any],
        scored_moves: List[Tuple[float, Dict[str, Any]]],
        original_player: int,
    ) -> Optional[Tuple[float, Dict[str, Any]]]:
        """Return the first legal-order root that wins immediately."""
        original_team = self.get_player_team(original_player)
        for value, move in scored_moves:
            undo_info = self.make_move(game_state, move)
            try:
                if self.check_win_state(game_state) == original_team:
                    return value, move
            finally:
                self.unmake_move(game_state, undo_info)
        return None

    def _root_allows_immediate_opponent_win(
        self,
        game_state: Dict[str, Any],
        root_move: Dict[str, Any],
        original_player: int,
    ) -> bool:
        """Whether the opponent has a terminal reply after one root move."""
        original_team = self.get_player_team(original_player)
        opponent_team = "B" if original_team == "A" else "A"
        root_undo = self.make_move(game_state, root_move)
        try:
            for reply in self.get_all_valid_moves(game_state):
                reply_undo = self.make_move(game_state, reply)
                try:
                    if self.check_win_state(game_state) == opponent_team:
                        return True
                finally:
                    self.unmake_move(game_state, reply_undo)
        finally:
            self.unmake_move(game_state, root_undo)
        return False

    def _root_formation_pressure(
        self,
        game_state: Dict[str, Any],
        root_move: Dict[str, Any],
        original_player: int,
    ) -> float:
        """Evaluate existing formation pressure once for an exact root tie."""
        original_team = self.get_player_team(original_player)
        opponent_team = "B" if original_team == "A" else "A"
        undo_info = self.make_move(game_state, root_move)
        try:
            analysis = BoardAnalysis(game_state)
            _, formation_pressure = self.evaluate_tactical_capture_pressure(
                game_state,
                analysis,
                self.teams[original_team],
                self.teams[opponent_team],
            )
            return formation_pressure
        finally:
            self.unmake_move(game_state, undo_info)

    def get_all_valid_moves(self, game_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get all valid moves for the current player."""
        board = game_state['board']
        current_player = game_state['currentPlayer']
        board_size = game_state['boardSize']
        valid_moves = []

        for row in range(board_size):
            for col in range(board_size):
                piece = board[row][col]
                if piece and piece.get('player') == current_player:
                    piece_moves = self.get_valid_moves_for_piece(board, row, col, board_size)
                    for move in piece_moves:
                        valid_moves.append({
                            'from': [row, col],
                            'to': move,
                            'description': f"({row},{col}) → ({move[0]},{move[1]})"
                        })

        return valid_moves

    def get_valid_moves_for_piece(
        self,
        board: List[List[Any]],
        row: int,
        col: int,
        board_size: int
    ) -> List[Tuple[int, int]]:
        """Get valid moves for a specific piece."""
        valid_moves = []

        # Check all four directions
        directions = [[0, 1], [0, -1], [1, 0], [-1, 0]]

        for dr, dc in directions:
            r = row + dr
            c = col + dc

            while 0 <= r < board_size and 0 <= c < board_size and not board[r][c]:
                valid_moves.append((r, c))
                r += dr
                c += dc

        return valid_moves

    def order_moves(
        self,
        game_state: Dict[str, Any],
        moves: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Order moves to improve alpha-beta pruning efficiency.
        
        Lightweight scoring for move ordering - avoids expensive make/unmake operations.
        """
        move_scores = []
        board = game_state['board']
        board_size = game_state['boardSize']
        current_player = game_state['currentPlayer']
        center_half = board_size // 2

        for move in moves:
            score = 0
            to_row, to_col = move['to']

            # Priority 1: Capture moves (cheap simulation)
            from_row, from_col = move["from"]
            moving_piece = board[from_row][from_col]
            captured_positions = (
                []
                if moving_piece and moving_piece.get("isDead", False)
                else self.simulate_captures_in_place(
                    game_state,
                    move['from'],
                    move['to'],
                    current_player
                )
            )
            capture_count = len(captured_positions)
            score += capture_count * 100

            # Priority 2: Moves to center cells (instant win potential)
            if (to_row, to_col) in self.center_cells:
                score += 50

            # Priority 3: Center proximity
            center_distance = abs(to_row - center_half) + abs(to_col - center_half)
            score -= center_distance * 2

            # Priority 4: Bonus for capturing enemy center pieces
            for r, c in captured_positions:
                if (r, c) in self.center_cells:
                    score += 200

            move_scores.append((score, move))

        # Sort by score descending (best moves first)
        move_scores.sort(key=lambda x: x[0], reverse=True)
        return [move for _, move in move_scores]

    def minimax(
        self,
        game_state: Dict[str, Any],
        depth: int,
        alpha: float,
        beta: float,
        maximizing: bool,
        eval_for_player: int,
        visited_hashes: set,
        *,
        _stats: Optional[SearchStats] = None,
        _ply: int = 0,
    ) -> float:
        """Minimax algorithm with alpha-beta pruning and transposition table."""
        if _stats is not None:
            _stats.nodes += 1
            _stats.minimax_nodes += 1
            _stats.effective_depth = max(_stats.effective_depth, _ply)

        position_hash = self.hash_position(game_state)
        if position_hash in visited_hashes:
            if _stats is not None:
                _stats.repetition_hits += 1
            return -self.repetition_penalty

        visited_hashes.add(position_hash)
        try:
            # Check transposition table first
            if _stats is not None:
                _stats.transposition_lookups += 1
            cached_value = self.transposition_table.get(position_hash, depth, alpha, beta)
            if cached_value is not None:
                if _stats is not None:
                    _stats.transposition_hits += 1
                return cached_value

            original_alpha = alpha

            # Terminal conditions
            if self.is_game_over(game_state):
                if _stats is not None:
                    _stats.terminal_nodes += 1
                value = self.evaluate_terminal(game_state, eval_for_player, depth)
                self.transposition_table.store(position_hash, depth, value, original_alpha, beta)
                if _stats is not None:
                    _stats.transposition_stores += 1
                return value

            if depth == 0:
                # Determine quiescence depth based on phase (fast piece count)
                q_depth = self._get_quiescence_depth(game_state)
                value = self.quiescence_search(
                    game_state,
                    eval_for_player,
                    q_depth,
                    alpha,
                    beta,
                    _stats=_stats,
                    _ply=_ply,
                )
                self.transposition_table.store(position_hash, depth, value, original_alpha, beta)
                if _stats is not None:
                    _stats.transposition_stores += 1
                return value

            current_team = self.get_player_team(game_state['currentPlayer'])
            eval_team = self.get_player_team(eval_for_player)
            is_teammate = current_team == eval_team

            # If current player is on our team, maximize; otherwise minimize
            # Create analysis once per node for reuse
            node_analysis = BoardAnalysis(game_state)

            legal_moves = self.get_all_valid_moves(game_state)
            if not legal_moves:
                # Having no legal move is a pass in this game, not a loss:
                # `advance_no_legal_move` hands the turn on and only two
                # consecutive timeouts eliminate a player. Without this branch
                # the move loop below never runs and the initial -inf (or +inf
                # when minimizing) is returned and cached, so the search invents
                # a total defeat or a total victory. Advance the turn the same
                # way `make_move` does and search the resulting position.
                #
                # The pass consumes one ply, which also bounds the recursion:
                # a position where every player is stuck walks back round to the
                # mover, whose hash is already in `visited_hashes`.
                #
                # Timeout-driven elimination is deliberately NOT modelled here.
                # The search state (`agent_state`) does not carry
                # `consecutiveTimeouts` and `hash_position` does not hash it, so
                # representing it would mean extending both — which changes every
                # transposition key for every profile. That is a separate slice;
                # see the plan's non-goals.
                previous_player = game_state["currentPlayer"]
                for _ in range(4):
                    game_state["currentPlayer"] = (
                        game_state["currentPlayer"] % 4
                    ) + 1
                    if self.has_any_piece(game_state, game_state["currentPlayer"]):
                        break
                try:
                    value = self.minimax(
                        game_state,
                        depth - 1,
                        alpha,
                        beta,
                        not maximizing,
                        eval_for_player,
                        visited_hashes,
                        _stats=_stats,
                        _ply=_ply + 1,
                    )
                finally:
                    game_state["currentPlayer"] = previous_player
                self.transposition_table.store(
                    position_hash, depth, value, original_alpha, beta
                )
                if _stats is not None:
                    _stats.transposition_stores += 1
                return value

            if is_teammate:
                max_eval = -math.inf
                moves = legal_moves
                self.record_branching(game_state, depth, len(moves), node_analysis)
                moves = self.order_moves(game_state, moves)
                moves = self.limit_k_best_moves(game_state, moves, depth, node_analysis)

                for move in moves:
                    undo_info = self.make_move(game_state, move)
                    try:
                        eval_value = self.minimax(
                            game_state,
                            depth - 1,
                            alpha,
                            beta,
                            not maximizing,
                            eval_for_player,
                            visited_hashes,
                            _stats=_stats,
                            _ply=_ply + 1,
                        )
                    finally:
                        self.unmake_move(game_state, undo_info)

                    max_eval = max(max_eval, eval_value)
                    alpha = max(alpha, eval_value)
                    if beta <= alpha:
                        if _stats is not None:
                            _stats.cutoffs += 1
                        break

                # Store in transposition table
                self.transposition_table.store(position_hash, depth, max_eval, original_alpha, beta)
                if _stats is not None:
                    _stats.transposition_stores += 1
                return max_eval

            min_eval = math.inf
            moves = legal_moves
            self.record_branching(game_state, depth, len(moves), node_analysis)
            moves = self.order_moves(game_state, moves)
            moves = self.limit_k_best_moves(game_state, moves, depth, node_analysis)

            for move in moves:
                undo_info = self.make_move(game_state, move)
                try:
                    eval_value = self.minimax(
                        game_state,
                        depth - 1,
                        alpha,
                        beta,
                        not maximizing,
                        eval_for_player,
                        visited_hashes,
                        _stats=_stats,
                        _ply=_ply + 1,
                    )
                finally:
                    self.unmake_move(game_state, undo_info)

                min_eval = min(min_eval, eval_value)
                beta = min(beta, eval_value)
                if beta <= alpha:
                    if _stats is not None:
                        _stats.cutoffs += 1
                    break

            # Store in transposition table
            self.transposition_table.store(position_hash, depth, min_eval, original_alpha, beta)
            if _stats is not None:
                _stats.transposition_stores += 1
            return min_eval
        finally:
            visited_hashes.discard(position_hash)

    def evaluate_position(
        self,
        game_state: Dict[str, Any],
        for_player: int,
        depth_left: int = 0
    ) -> float:
        """Evaluate the game position from a player's perspective."""
        # Create cached board analysis (single scan replaces multiple scans)
        analysis = BoardAnalysis(game_state)

        my_team = self.get_player_team(for_player)
        enemy_team = 'B' if my_team == 'A' else 'A'
        my_team_players = self.teams[my_team]
        enemy_team_players = self.teams[enemy_team]

        win_state = self.check_win_state(game_state)
        win_score = 1_000_000.0
        if win_state == my_team:
            return win_score + (depth_left * 1000)
        if win_state == enemy_team:
            return -win_score - (depth_left * 1000)

        phase = self.get_phase(analysis)
        profile = self.weight_profiles[self.weight_profile_name]
        weights = profile[phase]

        score = 0.0

        team_material = self.get_team_material_value(analysis, my_team_players)
        enemy_material = self.get_team_material_value(analysis, enemy_team_players)
        score += weights["team_material"] * (team_material - enemy_material)

        center_ownership = self.evaluate_center_ownership(game_state, my_team_players, enemy_team_players)
        score += weights["center_ownership"] * center_ownership

        center_completion = self.evaluate_center_completion(game_state, my_team_players, enemy_team_players)
        score += weights["center_completion"] * center_completion

        if weights["formation_safety"] == 0:
            center_stability = self.evaluate_center_stability(
                game_state,
                analysis,
                my_team_players,
                enemy_team_players,
            )
            formation_safety = 0.0
        else:
            center_stability, formation_safety = self.evaluate_tactical_capture_pressure(
                game_state,
                analysis,
                my_team_players,
                enemy_team_players,
            )
        score += weights["center_stability"] * center_stability

        center_reach = self.evaluate_center_reach(analysis, my_team_players, enemy_team_players)
        score += weights["center_reach"] * center_reach

        dead_progress = self.evaluate_dead_progress(
            analysis, my_team_players, enemy_team_players, game_state['boardSize'])
        score += weights["dead_progress"] * dead_progress

        color_survival = self.evaluate_color_survival(
            analysis, my_team_players, enemy_team_players, game_state['boardSize'])
        score += weights["color_survival"] * color_survival

        score += weights["formation_safety"] * formation_safety

        mobility = analysis.get_team_mobility(my_team_players, self) - \
            analysis.get_team_mobility(enemy_team_players, self)
        score += weights["mobility"] * mobility

        return score

    def evaluate_terminal(self, game_state: Dict[str, Any], for_player: int, depth: int) -> float:
        """Prefer quicker wins and slower losses."""
        my_team = self.get_player_team(for_player)
        enemy_team = 'B' if my_team == 'A' else 'A'
        win_state = self.check_win_state(game_state)

        win_score = 1_000_000.0
        if win_state == my_team:
            return win_score + (depth * 1000)
        if win_state == enemy_team:
            return -win_score - (depth * 1000)
        return 0.0

    def quiescence_search(
        self,
        game_state: Dict[str, Any],
        eval_for_player: int,
        depth: int,
        alpha: float,
        beta: float,
        *,
        _stats: Optional[SearchStats] = None,
        _ply: int = 0,
    ) -> float:
        """Extend search for capture moves to avoid evaluating unstable positions."""
        if _stats is not None:
            _stats.nodes += 1
            _stats.quiescence_nodes += 1
            _stats.leaf_evaluations += 1
            _stats.effective_depth = max(_stats.effective_depth, _ply)

        stand_pat = self.evaluate_position(game_state, eval_for_player, depth)
        if depth == 0:
            return stand_pat

        current_team = self.get_player_team(game_state["currentPlayer"])
        eval_team = self.get_player_team(eval_for_player)
        is_teammate = current_team == eval_team

        if is_teammate:
            if stand_pat >= beta:
                if _stats is not None:
                    _stats.cutoffs += 1
                return stand_pat
            alpha = max(alpha, stand_pat)
        else:
            if stand_pat <= alpha:
                if _stats is not None:
                    _stats.cutoffs += 1
                return stand_pat
            beta = min(beta, stand_pat)

        capture_moves = self.get_capture_moves(game_state)
        if not capture_moves:
            return stand_pat

        # Limit capture moves to avoid explosion in late game
        capture_moves = self.order_moves(game_state, capture_moves)
        max_captures = 6  # Only consider top 6 capture moves
        if len(capture_moves) > max_captures:
            capture_moves = capture_moves[:max_captures]

        if is_teammate:
            best = stand_pat
            for move in capture_moves:
                undo_info = self.make_move(game_state, move)
                try:
                    score = self.quiescence_search(
                        game_state,
                        eval_for_player,
                        depth - 1,
                        alpha,
                        beta,
                        _stats=_stats,
                        _ply=_ply + 1,
                    )
                finally:
                    self.unmake_move(game_state, undo_info)
                if score > best:
                    best = score
                if score > alpha:
                    alpha = score
                if alpha >= beta:
                    if _stats is not None:
                        _stats.cutoffs += 1
                    break
            return best

        best = stand_pat
        for move in capture_moves:
            undo_info = self.make_move(game_state, move)
            try:
                score = self.quiescence_search(
                    game_state,
                    eval_for_player,
                    depth - 1,
                    alpha,
                    beta,
                    _stats=_stats,
                    _ply=_ply + 1,
                )
            finally:
                self.unmake_move(game_state, undo_info)
            if score < best:
                best = score
            if score < beta:
                beta = score
            if alpha >= beta:
                if _stats is not None:
                    _stats.cutoffs += 1
                break
        return best

    def get_capture_moves(self, game_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Return only moves that result in at least one capture."""
        moves = self.get_all_valid_moves(game_state)
        capture_moves = []
        current_player = game_state["currentPlayer"]
        for move in moves:
            from_row, from_col = move["from"]
            moving_piece = game_state["board"][from_row][from_col]
            if moving_piece and moving_piece.get("isDead", False):
                continue
            captured_positions = self.simulate_captures_in_place(
                game_state,
                move["from"],
                move["to"],
                current_player,
            )
            if captured_positions:
                capture_moves.append(move)
        return capture_moves

    def evaluate_death_risk_cached(self, analysis: BoardAnalysis, team_players: List[int]) -> float:
        """Evaluate death risk for a team using cached data."""
        risk = 0.0

        for player in team_players:
            pieces = analysis.get_player_piece_count(player)

            if pieces <= 3:
                risk += 30  # Already dead
            elif pieces == 4:
                risk += 10  # Critical danger
            elif pieces == 5:
                risk += 3   # High risk

        return risk

    @classmethod
    def enable_branch_stats(cls, enabled: bool = True) -> None:
        cls.BRANCH_STATS_ENABLED = enabled

    @classmethod
    def reset_branch_stats(cls) -> None:
        cls.BRANCH_STATS = {"phase": {}, "phase_depth": {}}

    @classmethod
    def format_branch_stats(cls) -> str:
        def summarize(counts: List[int]) -> str:
            if not counts:
                return "n=0"
            sorted_counts = sorted(counts)
            n = len(sorted_counts)
            mean = sum(sorted_counts) / n
            if n % 2 == 1:
                median = sorted_counts[n // 2]
            else:
                median = (sorted_counts[n // 2 - 1] + sorted_counts[n // 2]) / 2
            p90_index = max(0, math.ceil(n * 0.9) - 1)
            p90 = sorted_counts[p90_index]
            max_value = sorted_counts[-1]
            return f"n={n} avg={mean:.2f} median={median:.2f} p90={p90} max={max_value}"

        lines = ["branching summary:"]
        for phase in sorted(cls.BRANCH_STATS["phase"].keys()):
            counts = cls.BRANCH_STATS["phase"][phase]
            lines.append(f"- phase {phase}: {summarize(counts)}")

        for key in sorted(cls.BRANCH_STATS["phase_depth"].keys()):
            counts = cls.BRANCH_STATS["phase_depth"][key]
            lines.append(f"- {key}: {summarize(counts)}")

        return "\n".join(lines)

    def record_branching(
        self,
        game_state: Dict[str, Any],
        depth: int,
        move_count: int,
        analysis: Optional[BoardAnalysis] = None
    ) -> None:
        if not self.BRANCH_STATS_ENABLED:
            return
        if analysis is None:
            analysis = BoardAnalysis(game_state)
        phase = self.get_phase(analysis)
        phase_map = self.BRANCH_STATS["phase"].setdefault(phase, [])
        phase_map.append(move_count)
        phase_depth_key = f"{phase}:d{depth}"
        phase_depth_map = self.BRANCH_STATS["phase_depth"].setdefault(phase_depth_key, [])
        phase_depth_map.append(move_count)

    def limit_k_best_moves(
        self,
        game_state: Dict[str, Any],
        moves: List[Dict[str, Any]],
        depth: int,
        analysis: Optional[BoardAnalysis] = None
    ) -> List[Dict[str, Any]]:
        """Limit exploration to top-K moves based on phase and depth."""
        if analysis is None:
            analysis = BoardAnalysis(game_state)
        phase = self.get_phase(analysis)
        high_stakes = self.is_high_stakes_position(game_state, analysis)

        search = self.get_search_settings()
        if phase == "early":
            if depth >= 3:
                limit = search["early_k_d3"]
            elif depth == 2:
                limit = search["early_k_d2"]
            else:
                limit = search["early_k_d1"]
        elif phase == "mid":
            if depth >= 3:
                limit = search["mid_k_d3"]
            elif depth == 2:
                limit = search["mid_k_d2"]
            else:
                limit = search["mid_k_d1"]
        else:
            if depth >= 3:
                limit = search["late_k_d3"]
            elif depth == 2:
                limit = search["late_k_d2"]
            else:
                limit = search["late_k_d1"]

        if high_stakes:
            limit = max(1, int(limit * search["high_stakes_k_multiplier"]))

        if len(moves) <= limit:
            return moves
        if not search.get("tactical_candidate_reserve", False):
            return moves[:limit]

        # The top-K head is ranked by capture/center features only, so a reply
        # that saves an attacked piece or blocks the attacker can rank far
        # below the cut. Keep the head as the search budget and add back every
        # move that answers an immediate capture, so no capture-relevant legal
        # reply is discarded before it is searched.
        evadable, denial = immediate_capture_geometry(self, game_state, analysis)
        if not evadable and not denial:
            return moves[:limit]
        return [
            move
            for index, move in enumerate(moves)
            if index < limit
            or tuple(move["from"]) in evadable
            or tuple(move["to"]) in denial
        ]

    def get_search_settings(self) -> Dict[str, float]:
        """Get search configuration for current profile."""
        profile = self.weight_profiles[self.weight_profile_name]
        search = profile.get("search")
        if search:
            return search
        return {
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
            "tactical_candidate_reserve": False,
        }

    def get_phase(self, analysis: BoardAnalysis) -> str:
        """Determine phase by total pieces remaining on board."""
        total_pieces = sum(analysis.piece_counts) + sum(analysis.dead_piece_counts)
        dead_players = 0
        for player_eliminated in analysis.eliminated_players:
            if player_eliminated:
                dead_players += 1

        if total_pieces >= 20:
            return "early"
        if total_pieces >= 16 and dead_players == 0:
            return "mid"
        return "late"

    def _get_quiescence_depth(self, game_state: Dict[str, Any]) -> int:
        """Get quiescence search depth based on game phase (fast calculation)."""
        board = game_state['board']
        board_size = game_state['boardSize']
        
        # Quick piece count without full BoardAnalysis
        piece_count = 0
        for r in range(board_size):
            for c in range(board_size):
                if board[r][c]:
                    piece_count += 1
        
        # Reduce quiescence depth in late game to avoid timeout
        search = self.get_search_settings()
        if piece_count >= 20:
            return int(search.get("early_q_depth", 2))
        elif piece_count >= 14:
            return int(search.get("mid_q_depth", 1))
        else:
            return int(search.get("late_q_depth", 1))

    def check_win_state(self, game_state: Dict[str, Any]) -> Optional[str]:
        """Return winning team ('A'/'B') if any win condition is met."""
        board = game_state['board']
        board_size = game_state['boardSize']

        team_a_dead = 0
        team_b_dead = 0

        for player in [1, 2, 3, 4]:
            total_pieces = 0
            for r in range(board_size):
                for c in range(board_size):
                    piece = board[r][c]
                    if piece and piece.get('player') == player:
                        total_pieces += 1

            captured = (board_size - 2) - total_pieces
            if captured >= self.dead_capture_threshold:
                if player in self.teams['A']:
                    team_a_dead += 1
                else:
                    team_b_dead += 1

        if team_a_dead >= 2:
            return 'B'
        if team_b_dead >= 2:
            return 'A'

        center_team = None
        for r, c in self.center_cells:
            piece = board[r][c]
            if not piece:
                center_team = None
                break
            piece_team = self.get_player_team(piece.get('player', 0))
            if center_team is None:
                center_team = piece_team
            elif piece_team != center_team:
                center_team = None
                break

        return center_team

    def get_search_depth(self, analysis: BoardAnalysis, game_state: Dict[str, Any]) -> int:
        """Determine search depth based on phase and high-stakes positions."""
        phase = self.get_phase(analysis)
        search = self.get_search_settings()
        if phase == "late":
            base = search["late_depth"]
        elif phase == "mid":
            base = search["mid_depth"]
        else:
            base = search["early_depth"]

        if self.is_high_stakes_position(game_state, analysis):
            return min(base + search["high_stakes_depth_bonus"], 6)
        return base

    def is_high_stakes_position(self, game_state: Dict[str, Any], analysis: BoardAnalysis) -> bool:
        """Heuristic: increase depth when close to victory or defeat."""
        board = game_state["board"]
        board_size = game_state["boardSize"]

        team_counts = {"A": 0, "B": 0}
        for r, c in self.center_cells:
            piece = board[r][c]
            if not piece:
                continue
            team_counts[self.get_player_team(piece.get("player", 0))] += 1
        if team_counts["A"] >= 3 or team_counts["B"] >= 3:
            return True

        start_count = board_size - 2
        for team, players in self.teams.items():
            dead_like = 0
            for player in players:
                player_idx = player - 1
                total_pieces = analysis.piece_counts[player_idx] + analysis.dead_piece_counts[player_idx]
                captured = max(0, start_count - total_pieces)
                if captured >= 2:
                    dead_like += 1
            if dead_like >= 2:
                return True

        return False

    def is_center_immediate_win(
        self,
        game_state: Dict[str, Any],
        team_players: List[int]
    ) -> bool:
        """Check if a team can complete center control in one move."""
        analysis = BoardAnalysis(game_state)
        center_set = set(self.center_cells)
        for player in team_players:
            moves = analysis.get_player_moves(player, self)
            for move in moves:
                if tuple(move["to"]) not in center_set:
                    continue
                undo_info = self.make_move(game_state, move)
                try:
                    win_state = self.check_win_state(game_state)
                finally:
                    self.unmake_move(game_state, undo_info)
                if win_state == self.get_player_team(player):
                    return True
        return False

    def get_team_material_value(self, analysis: BoardAnalysis, team_players: List[int]) -> float:
        """Value team material with a discount for dead pieces."""
        value = 0.0
        for player in team_players:
            player_idx = player - 1
            value += analysis.piece_counts[player_idx]
            value += analysis.dead_piece_counts[player_idx] * self.dead_piece_value
        return value

    def evaluate_center_ownership(
        self,
        game_state: Dict[str, Any],
        team_players: List[int],
        enemy_players: List[int]
    ) -> float:
        """Evaluate control of the center cells."""
        board = game_state['board']
        team_count = 0
        enemy_count = 0
        for r, c in self.center_cells:
            piece = board[r][c]
            if piece:
                if piece.get('player') in team_players:
                    team_count += 1
                elif piece.get('player') in enemy_players:
                    enemy_count += 1
        return float(team_count - enemy_count)

    def evaluate_center_completion(
        self,
        game_state: Dict[str, Any],
        team_players: List[int],
        enemy_players: List[int]
    ) -> float:
        """Reward positions that are close to completing center control."""
        board = game_state['board']
        team_count = 0
        enemy_count = 0
        empty_count = 0
        for r, c in self.center_cells:
            piece = board[r][c]
            if not piece:
                empty_count += 1
                continue
            if piece.get('player') in team_players:
                team_count += 1
            elif piece.get('player') in enemy_players:
                enemy_count += 1

        if team_count == 4:
            return 10.0
        if enemy_count == 4:
            return -10.0

        score = 0.0
        if team_count == 3:
            score += 6.0 if empty_count == 1 else 3.0
        elif team_count == 2 and enemy_count == 0:
            score += 2.0

        if enemy_count == 3:
            score -= 6.0 if empty_count == 1 else 3.0
        elif enemy_count == 2 and team_count == 0:
            score -= 2.0

        return score

    def evaluate_center_stability(
        self,
        game_state: Dict[str, Any],
        analysis: BoardAnalysis,
        team_players: List[int],
        enemy_players: List[int]
    ) -> float:
        """Evaluate how safe center control pieces are."""
        board = game_state['board']
        threatened = 0.0
        safe = 0.0

        for r, c in self.center_cells:
            piece = board[r][c]
            if not piece or piece.get('player') not in team_players:
                continue

            if self.is_piece_immediately_capturable(game_state, analysis, (r, c), enemy_players):
                threatened += 1.0
            else:
                safe += 1.0

        return safe - threatened

    def evaluate_center_reach(
        self,
        analysis: BoardAnalysis,
        team_players: List[int],
        enemy_players: List[int]
    ) -> float:
        """Evaluate reachability of center in one move."""
        team_reach = 0
        enemy_reach = 0
        center_set = set(self.center_cells)

        for player in team_players:
            moves = analysis.get_player_moves(player, self)
            for move in moves:
                if tuple(move['to']) in center_set:
                    team_reach += 1

        for player in enemy_players:
            moves = analysis.get_player_moves(player, self)
            for move in moves:
                if tuple(move['to']) in center_set:
                    enemy_reach += 1

        return float(team_reach - enemy_reach)

    def evaluate_dead_progress(
        self,
        analysis: BoardAnalysis,
        team_players: List[int],
        enemy_players: List[int],
        board_size: int
    ) -> float:
        """Evaluate progress toward making two enemy colors dead."""
        start_count = board_size - 2
        score = 0.0

        def progress_for(player: int) -> float:
            player_idx = player - 1
            total_pieces = analysis.piece_counts[player_idx] + analysis.dead_piece_counts[player_idx]
            captured = max(0, start_count - total_pieces)
            return min(captured, self.dead_capture_threshold) / self.dead_capture_threshold

        for player in enemy_players:
            score += progress_for(player)
            if progress_for(player) >= 1.0:
                score += 0.5

        for player in team_players:
            score -= progress_for(player)
            if progress_for(player) >= 1.0:
                score -= 0.5

        return score

    def evaluate_color_survival(
        self,
        analysis: BoardAnalysis,
        team_players: List[int],
        enemy_players: List[int],
        board_size: int
    ) -> float:
        """Evaluate how close each color is to becoming dead."""
        start_count = board_size - 2

        def risk_for(player: int) -> float:
            player_idx = player - 1
            total_pieces = analysis.piece_counts[player_idx] + analysis.dead_piece_counts[player_idx]
            captured = max(0, start_count - total_pieces)
            if captured >= 3:
                return 6.0
            if captured == 2:
                return 3.0
            if captured == 1:
                return 1.0
            return 0.0

        my_risk = sum(risk_for(player) for player in team_players)
        enemy_risk = sum(risk_for(player) for player in enemy_players)
        return enemy_risk - my_risk

    def evaluate_formation_safety(
        self,
        game_state: Dict[str, Any],
        analysis: BoardAnalysis,
        team_players: List[int],
        enemy_players: List[int]
    ) -> float:
        """Light penalty/bonus for immediate threats across the board."""
        my_threats = self.count_immediate_threats_cached(game_state, analysis, team_players, enemy_players)
        enemy_threats = self.count_immediate_threats_cached(game_state, analysis, enemy_players, team_players)
        return enemy_threats - my_threats

    def evaluate_tactical_capture_pressure(
        self,
        game_state: Dict[str, Any],
        analysis: BoardAnalysis,
        team_players: List[int],
        enemy_players: List[int],
    ) -> Tuple[float, float]:
        """Compute center safety and formation pressure from one capture pass."""

        def capture_pressure(
            attacking_players: List[int],
            target_players: List[int],
            collect_positions: bool,
        ) -> Tuple[float, set]:
            pressure = 0.0
            captured_targets = set()
            for attacker in attacking_players:
                for move in analysis.get_player_moves(attacker, self):
                    from_row, from_column = move["from"]
                    board = game_state["board"]
                    moving_piece = board[from_row][from_column]
                    if moving_piece and moving_piece.get("isDead", False):
                        continue
                    to_row, to_column = move["to"]
                    can_capture = False
                    for row_delta, column_delta in (
                        (-1, 0),
                        (1, 0),
                        (0, -1),
                        (0, 1),
                    ):
                        adjacent_row = to_row + row_delta
                        adjacent_column = to_column + column_delta
                        if not (
                            0 <= adjacent_row < analysis.board_size
                            and 0 <= adjacent_column < analysis.board_size
                        ):
                            continue
                        adjacent = board[adjacent_row][adjacent_column]
                        if adjacent and adjacent.get("player") != attacker:
                            can_capture = True
                            break
                    if not can_capture:
                        # Both sandwich and surrounded captures require an
                        # opponent directly adjacent to the destination.
                        continue
                    captured_positions = self.simulate_captures_in_place(
                        game_state,
                        move["from"],
                        move["to"],
                        attacker,
                    )
                    for row, column in captured_positions:
                        piece = game_state["board"][row][column]
                        if not piece or piece.get("player") not in target_players:
                            continue
                        pressure += 0.5 if piece.get("isDead", False) else 1.0
                        if collect_positions:
                            captured_targets.add((row, column))
            return pressure, captured_targets

        my_threats, enemy_capture_targets = capture_pressure(
            enemy_players,
            team_players,
            True,
        )
        enemy_threats, _ = capture_pressure(
            team_players,
            enemy_players,
            False,
        )
        safe = threatened = 0.0
        for row, column in self.center_cells:
            piece = game_state["board"][row][column]
            if not piece or piece.get("player") not in team_players:
                continue
            if (row, column) in enemy_capture_targets:
                threatened += 1.0
            else:
                safe += 1.0
        return safe - threatened, enemy_threats - my_threats

    def is_piece_immediately_capturable(
        self,
        game_state: Dict[str, Any],
        analysis: BoardAnalysis,
        position: Tuple[int, int],
        enemy_players: List[int]
    ) -> bool:
        """Check if a piece at position can be captured by any enemy in one move."""
        target_r, target_c = position
        for enemy_player in enemy_players:
            enemy_moves = analysis.get_player_moves(enemy_player, self)
            for move in enemy_moves:
                from_row, from_column = move["from"]
                moving_piece = game_state["board"][from_row][from_column]
                if moving_piece and moving_piece.get("isDead", False):
                    continue
                captured_positions = self.simulate_captures_in_place(
                    game_state,
                    move['from'],
                    move['to'],
                    enemy_player
                )
                for r, c in captured_positions:
                    if r == target_r and c == target_c:
                        return True
        return False

    def count_immediate_threats_cached(
        self,
        game_state: Dict[str, Any],
        analysis: BoardAnalysis,
        team_players: List[int],
        enemy_players: List[int]
    ) -> float:
        """Count immediate threats to a team using cached moves."""
        threats = 0.0

        # Check each enemy piece for potential captures
        for enemy_player in enemy_players:
            enemy_moves = analysis.get_player_moves(enemy_player, self)

            for move in enemy_moves:
                from_row, from_column = move["from"]
                moving_piece = game_state["board"][from_row][from_column]
                if moving_piece and moving_piece.get("isDead", False):
                    continue
                captured_positions = self.simulate_captures_in_place(
                    game_state,
                    move['from'],
                    move['to'],
                    enemy_player
                )

                # Count how many of our team's pieces would be captured
                for r, c in captured_positions:
                    piece = game_state['board'][r][c]
                    if piece and piece.get('player') in team_players:
                        threats += 0.5 if piece.get('isDead', False) else 1.0

        return threats

    def count_immediate_captures_cached(
        self,
        game_state: Dict[str, Any],
        analysis: BoardAnalysis,
        team_players: List[int],
        enemy_players: List[int]
    ) -> float:
        """Count immediate capture opportunities for a team using cached moves."""
        captures = 0.0

        # Check each team piece for potential captures
        for player in team_players:
            moves = analysis.get_player_moves(player, self)

            for move in moves:
                from_row, from_column = move["from"]
                moving_piece = game_state["board"][from_row][from_column]
                if moving_piece and moving_piece.get("isDead", False):
                    continue
                captured_positions = self.simulate_captures_in_place(
                    game_state,
                    move['from'],
                    move['to'],
                    player
                )

                # Count enemy pieces that would be captured
                for r, c in captured_positions:
                    piece = game_state['board'][r][c]
                    if piece and piece.get('player') in enemy_players:
                        captures += 0.5 if piece.get('isDead', False) else 1.0

        return captures

    def evaluate_center_control(self, game_state: Dict[str, Any], team_players: List[int]) -> float:
        """Evaluate center control for a team."""
        center_cells = [(3, 3), (3, 4), (4, 3), (4, 4)]
        board = game_state['board']

        controlled_cells = 0
        for r, c in center_cells:
            piece = board[r][c]
            if piece and piece.get('player') in team_players:
                controlled_cells += 1.0

        if controlled_cells >= 2:
            controlled_cells += 0.5
        if controlled_cells >= 3:
            controlled_cells += 1.5
        if controlled_cells == 4:
            controlled_cells += 1000.0

        return controlled_cells

    def get_player_team(self, player: int) -> str:
        """Get which team a player belongs to."""
        return 'A' if player in self.teams['A'] else 'B'

    def simulate_captures(
        self,
        game_state: Dict[str, Any],
        from_pos: List[int],
        to_pos: List[int],
        player: int
    ) -> List[Tuple[int, int]]:
        """Simulate captures for a move."""
        # Use the more efficient in-place simulation
        return self.simulate_captures_in_place(game_state, from_pos, to_pos, player)

    def check_captures(
        self,
        state: Dict[str, Any],
        row: int,
        col: int,
        player: int
    ) -> List[Tuple[int, int]]:
        """Check for both surrounded and sandwich captures."""
        # First check for surrounded captures
        surrounded_captures = self.check_surrounded_captures(
            state['board'],
            row,
            col,
            player,
            state['boardSize']
        )

        # Keep track of already captured positions
        captured_positions = set(surrounded_captures)

        # Then check for sandwich captures
        sandwich_captures = self.check_sandwich_captures(
            state['board'],
            row,
            col,
            player,
            state['boardSize'],
            captured_positions
        )

        # Combine all captures
        return surrounded_captures + sandwich_captures

    def check_sandwich_captures(
        self,
        board: List[List[Any]],
        row: int,
        col: int,
        player: int,
        board_size: int,
        already_captured: set
    ) -> List[Tuple[int, int]]:
        """Check for sandwich captures in all four directions."""
        captured = []

        # Keep the historical right/left/down/up ordering while avoiding four
        # tiny Python function calls for every simulated move.
        for row_dir, col_dir in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            opponent_positions = []
            current_row = row + row_dir
            current_col = col + col_dir
            while (
                0 <= current_row < board_size
                and 0 <= current_col < board_size
                and board[current_row][current_col]
            ):
                piece = board[current_row][current_col]
                if piece.get("player") == player:
                    for position in opponent_positions:
                        if position not in already_captured:
                            captured.append(position)
                            already_captured.add(position)
                    break
                opponent_positions.append((current_row, current_col))
                current_row += row_dir
                current_col += col_dir

        return captured

    def check_capture_line(
        self,
        board: List[List[Any]],
        row: int,
        col: int,
        player: int,
        row_dir: int,
        col_dir: int,
        captured: List[Tuple[int, int]],
        already_captured: set,
        board_size: int
    ) -> None:
        """Check for sandwich captures in a specific direction."""
        opponent_positions = []
        r = row + row_dir
        c = col + col_dir

        # Collect opponent pieces until we find an empty space or our own piece
        while 0 <= r < board_size and 0 <= c < board_size and board[r][c]:
            if board[r][c].get('player') == player:
                # Found our own piece - sandwich capture successful
                for pos in opponent_positions:
                    pos_row, pos_col = pos

                    # Skip if already captured
                    if (pos not in already_captured and
                            board[pos_row][pos_col].get('player') != player):
                        captured.append(pos)
                        already_captured.add(pos)
                break
            else:
                # Found opponent piece (alive or dead)
                opponent_positions.append((r, c))

            r += row_dir
            c += col_dir

    def check_surrounded_captures(
        self,
        board: List[List[Any]],
        moved_row: int,
        moved_col: int,
        player: int,
        board_size: int
    ) -> List[Tuple[int, int]]:
        """Check for surrounded captures."""
        captured_positions_set = set()
        all_visited_positions = set()
        directions = ((-1, 0), (1, 0), (0, -1), (0, 1))  # Up, Down, Left, Right

        # Check each adjacent position
        for d_row, d_col in directions:
            new_row = moved_row + d_row
            new_col = moved_col + d_col

            # Skip if out of bounds
            if not (0 <= new_row < board_size and 0 <= new_col < board_size):
                continue

            # Skip if empty
            adjacent_piece = board[new_row][new_col]
            if not adjacent_piece:
                continue

            # Skip if it's our piece
            if adjacent_piece.get('player') == player:
                continue

            # Skip if already visited
            pos_key = (new_row, new_col)
            if pos_key in all_visited_positions:
                continue

            # Check if this group is surrounded
            group_positions = []
            group_visited_positions = set()
            is_surrounded = self.check_if_group_is_surrounded(
                board,
                new_row,
                new_col,
                player,
                group_visited_positions,
                group_positions,
                board_size
            )
            all_visited_positions.update(group_visited_positions)
            if is_surrounded:
                for pos in group_positions:
                    captured_positions_set.add((pos[0], pos[1]))

        # Convert set back to list of tuples
        return list(captured_positions_set)

    def check_if_group_is_surrounded(
        self,
        board: List[List[Any]],
        row: int,
        col: int,
        current_player: int,
        visited_positions: set,
        group_positions: List[Tuple[int, int]],
        board_size: int
    ) -> bool:
        """Check if a group of pieces is surrounded."""
        # Check if position is valid
        if not (0 <= row < board_size and 0 <= col < board_size):
            return True

        # Check if there's a piece here
        piece = board[row][col]
        if not piece:
            return True  # Empty space counts as "surrounded"

        # If it's the current player's piece, it's not part of the opponent group
        if piece.get('player') == current_player:
            return True

        # Position string for set operations
        pos_key = (row, col)

        # If already visited, skip
        if pos_key in visited_positions:
            return True

        # Mark as visited
        visited_positions.add(pos_key)
        group_positions.append((row, col))

        # Check if this piece can move
        if self.can_move(board, row, col, board_size):
            return False  # Not surrounded

        # Check adjacent positions recursively
        directions = ((-1, 0), (1, 0), (0, -1), (0, 1))
        for d_row, d_col in directions:
            new_row = row + d_row
            new_col = col + d_col

            # If any connected piece is not surrounded, the whole group is not surrounded
            if not self.check_if_group_is_surrounded(
                board,
                new_row,
                new_col,
                current_player,
                visited_positions,
                group_positions,
                board_size
            ):
                return False

        # If we made it here, all connected pieces are surrounded
        return True

    def can_move(self, board: List[List[Any]], row: int, col: int, board_size: int) -> bool:
        """Check if a piece can move."""
        for d_row, d_col in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            adjacent_row = row + d_row
            adjacent_col = col + d_col
            if (
                0 <= adjacent_row < board_size
                and 0 <= adjacent_col < board_size
                and not board[adjacent_row][adjacent_col]
            ):
                return True

        # No valid moves found
        return False

    def apply_move(self, game_state: Dict[str, Any], move: Dict[str, Any]) -> Dict[str, Any]:
        """Apply a move to create a new game state."""
        # Deep copy the game state
        new_state = copy.deepcopy(game_state)
        board = new_state['board']

        # Move the piece
        from_row, from_col = move['from']
        to_row, to_col = move['to']

        board[to_row][to_col] = board[from_row][from_col]
        board[from_row][from_col] = None

        # Simulate captures
        captures = self.simulate_captures(
            new_state,
            move['from'],
            move['to'],
            new_state['currentPlayer']
        )

        # Remove captured pieces
        for r, c in captures:
            board[r][c] = None

        # Update players captured pieces count and status
        self.update_player_status(new_state)

        # Update to next player
        while True:
            new_state['currentPlayer'] = (new_state['currentPlayer'] % 4) + 1
            if self.has_any_piece(new_state, new_state['currentPlayer']):
                break

        return new_state

    def update_player_status(self, game_state: Dict[str, Any]) -> None:
        """Update player status after a move."""
        board = game_state['board']
        board_size = game_state['boardSize']
        eliminated_players = game_state['eliminatedPlayers']
        captured_pieces = game_state['capturedPieces']

        # Reset captured pieces count
        for i in range(len(captured_pieces)):
            captured_pieces[i] = 6

        # Check each piece on the board
        for r in range(board_size):
            for c in range(board_size):
                piece = board[r][c]
                if piece:
                    captured_pieces[piece['player'] - 1] -= 1

        # Check if any player has no pieces left
        for i in range(len(eliminated_players)):
            if captured_pieces[i] >= 3:  # fixed elimination threshold
                eliminated_players[i] = True

        # If a player is eliminated, set their pieces to dead
        for i in range(len(eliminated_players)):
            if eliminated_players[i]:
                for r in range(board_size):
                    for c in range(board_size):
                        piece = board[r][c]
                        if piece and piece['player'] == i + 1:
                            piece['isDead'] = True

    def has_any_piece(self, game_state: Dict[str, Any], player: int) -> bool:
        """Check if a player has any pieces left."""
        board = game_state['board']
        board_size = game_state['boardSize']

        for r in range(board_size):
            for c in range(board_size):
                piece = board[r][c]
                if piece and piece.get('player') == player:
                    return True

        return False

    def is_game_over(self, game_state: Dict[str, Any]) -> bool:
        """Check if the game is over."""
        # Check if either team is completely eliminated
        team_a_alive = any(
            not game_state['eliminatedPlayers'][player - 1] or
            self.has_any_piece(game_state, player)
            for player in self.teams['A']
        )

        team_b_alive = any(
            not game_state['eliminatedPlayers'][player - 1] or
            self.has_any_piece(game_state, player)
            for player in self.teams['B']
        )

        if not team_a_alive or not team_b_alive:
            return True

        center_cells = [(3, 3), (3, 4), (4, 3), (4, 4)]
        center_piece = game_state['board'][3][3]
        if not center_piece:
            return False
        center_team = self.get_player_team(center_piece.get('player', 0))
        if center_team not in ['A', 'B']:
            return False
        if all(
            game_state['board'][r][c] and self.get_player_team(
                game_state['board'][r][c].get('player', 0)) == center_team
            for r, c in center_cells
        ):
            # If all center cells are controlled by one team, the game is over
            return True

        return False

    def get_total_piece_count(self, game_state: Dict[str, Any]) -> int:
        """Count total pieces on the board."""
        board = game_state['board']
        board_size = game_state['boardSize']
        count = 0

        for row in range(board_size):
            for col in range(board_size):
                piece = board[row][col]
                if piece and not piece.get('isDead', False):
                    count += 1

        return count

    def make_move(self, game_state: Dict[str, Any], move: Dict[str, Any]) -> MoveUndoInfo:
        """Make a move in place and return undo information."""
        undo_info = MoveUndoInfo()

        # Store move details
        undo_info.from_row, undo_info.from_col = move['from']
        undo_info.to_row, undo_info.to_col = move['to']

        # Store previous game state
        undo_info.previous_current_player = game_state['currentPlayer']
        undo_info.previous_captured_pieces = game_state['capturedPieces'].copy()
        undo_info.previous_eliminated_players = game_state['eliminatedPlayers'].copy()

        # Store original isDead status of all pieces (before update_player_status changes them)
        board = game_state['board']
        board_size = game_state['boardSize']
        for r in range(board_size):
            for c in range(board_size):
                piece = board[r][c]
                if piece:
                    had_is_dead = 'isDead' in piece
                    original_is_dead = piece.get('isDead', False)
                    undo_info.pieces_made_dead.append(
                        (r, c, had_is_dead, original_is_dead)
                    )

        # Store board changes
        undo_info.moved_piece = board[undo_info.from_row][undo_info.from_col]
        undo_info.destination_piece = board[undo_info.to_row][undo_info.to_col]

        # Make the move
        board[undo_info.to_row][undo_info.to_col] = undo_info.moved_piece
        board[undo_info.from_row][undo_info.from_col] = None

        # Find and remove captured pieces
        if self.get_search_settings().get("canonical_capture_simulation", False):
            moved_piece = board[undo_info.to_row][undo_info.to_col]
            captures = (
                []
                if moved_piece and moved_piece.get("isDead", False)
                else self.check_captures(
                    game_state,
                    undo_info.to_row,
                    undo_info.to_col,
                    game_state["currentPlayer"],
                )
            )
        else:
            captures = self.simulate_captures_in_place(
                game_state,
                move['from'],
                move['to'],
                game_state['currentPlayer']
            )

        for r, c in captures:
            captured_piece = board[r][c]
            undo_info.captured_pieces.append((r, c, captured_piece))
            board[r][c] = None

        # Update player status (this may modify piece isDead flags)
        self.update_player_status(game_state)

        # Move to next player
        while True:
            game_state['currentPlayer'] = (game_state['currentPlayer'] % 4) + 1
            if self.has_any_piece(game_state, game_state['currentPlayer']):
                break

        return undo_info

    def unmake_move(self, game_state: Dict[str, Any], undo_info: MoveUndoInfo):
        """Undo a move using the stored information."""
        board = game_state['board']

        # Restore game state
        game_state['currentPlayer'] = undo_info.previous_current_player
        # Restore in place so callers that own these lists do not retain the
        # temporary search-node values after this request-local state wrapper
        # is discarded.
        game_state['capturedPieces'][:] = undo_info.previous_captured_pieces
        game_state['eliminatedPlayers'][:] = undo_info.previous_eliminated_players

        # Restore captured pieces
        for r, c, piece_data in undo_info.captured_pieces:
            board[r][c] = piece_data

        # Restore moved piece
        board[undo_info.from_row][undo_info.from_col] = undo_info.moved_piece
        board[undo_info.to_row][undo_info.to_col] = undo_info.destination_piece

        # Restore original isDead status of all pieces
        for r, c, had_is_dead, original_is_dead in undo_info.pieces_made_dead:
            piece = board[r][c]
            if piece:
                if had_is_dead:
                    piece['isDead'] = original_is_dead
                else:
                    piece.pop('isDead', None)

    def simulate_captures_in_place(
        self,
        game_state: Dict[str, Any],
        from_pos: List[int],
        to_pos: List[int],
        player: int
    ) -> List[Tuple[int, int]]:
        """Simulate captures by temporarily making the move in place."""
        board = game_state['board']

        # Temporarily make the move
        original_from_piece = board[from_pos[0]][from_pos[1]]
        original_to_piece = board[to_pos[0]][to_pos[1]]

        board[to_pos[0]][to_pos[1]] = original_from_piece
        board[from_pos[0]][from_pos[1]] = None

        try:
            # If piece is dead, no captures
            if board[to_pos[0]][to_pos[1]] and board[to_pos[0]][to_pos[1]].get('isDead', False):
                return []

            # Check for captures
            return self.check_captures(game_state, to_pos[0], to_pos[1], player)
        finally:
            # Always restore the temporary move, including when capture analysis fails.
            board[from_pos[0]][from_pos[1]] = original_from_piece
            board[to_pos[0]][to_pos[1]] = original_to_piece

    def get_random_move(self, game_state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Backward compatibility method."""
        return self.get_best_move(game_state)
