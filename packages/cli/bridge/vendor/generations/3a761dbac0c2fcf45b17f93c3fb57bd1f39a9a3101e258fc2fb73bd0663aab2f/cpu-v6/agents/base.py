from abc import ABC, abstractmethod
from typing import Dict, Any, List, Tuple


class BaseModel(ABC):
    """Abstract base class for all AI models in Laplace game."""

    def __init__(self):
        """Initialize the model."""
        self.name = self.__class__.__name__

    @abstractmethod
    def predict(self, game_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Make a move prediction based on the current game state.

        Args:
            game_state (Dict): The current game state containing:
                - board: 2D array representing the game board
                - currentPlayer: The player number whose turn it is
                - boardSize: Size of the board (N x N)
                - eliminatedPlayers: Boolean array indicating eliminated players
                - capturedPieces: Array with captured piece counts for each player

        Returns:
            Dict: A dictionary containing:
                - from: [row, col] coordinates of the piece to move
                - to: [row, col] coordinates of the destination
        """
        pass

    def __str__(self) -> str:
        """Return string representation of the model."""
        return self.name

    @staticmethod
    def get_valid_moves(
        board: List[List[Dict[str, Any]]],
        current_player: int,
        board_size: int
    ) -> List[Tuple[Tuple[int, int], Tuple[int, int]]]:
        """
        Get all valid moves for the current player.

        Args:
            board: 2D array representing the game board
            current_player: Current player's turn (1-4)
            board_size: Size of the board

        Returns:
            List of tuples containing (from_pos, to_pos) where each position is (row, col)
        """
        valid_moves = []

        # Find all pieces of the current player
        for row in range(board_size):
            for col in range(board_size):
                if board[row][col] and board[row][col].get('player') == current_player:
                    # For each piece, find all valid destinations
                    valid_destinations = BaseModel.get_valid_destinations(board, row, col, board_size)
                    for dest_row, dest_col in valid_destinations:
                        valid_moves.append(((row, col), (dest_row, dest_col)))

        return valid_moves

    @staticmethod
    def get_valid_destinations(
        board: List[List[Dict[str, Any]]],
        row: int,
        col: int,
        board_size: int
    ) -> List[Tuple[int, int]]:
        """
        Get all valid destinations for a piece at the given position.

        Args:
            board: 2D array representing the game board
            row: Row of the piece
            col: Column of the piece
            board_size: Size of the board

        Returns:
            List of tuples containing valid (row, col) destinations
        """
        valid_destinations = []

        # Check horizontal moves (left and right)
        for c in range(board_size):
            if c == col:  # Skip the current position
                continue

            # Check if the path is clear
            if BaseModel.is_path_clear_horizontal(board, row, col, c):
                valid_destinations.append((row, c))

        # Check vertical moves (up and down)
        for r in range(board_size):
            if r == row:  # Skip the current position
                continue

            # Check if the path is clear
            if BaseModel.is_path_clear_vertical(board, row, col, r):
                valid_destinations.append((r, col))

        return valid_destinations

    @staticmethod
    def is_path_clear_horizontal(
        board: List[List[Dict[str, Any]]],
        row: int,
        from_col: int,
        to_col: int
    ) -> bool:
        """
        Check if the horizontal path is clear between from_col and to_col.

        Args:
            board: 2D array representing the game board
            row: Row of the path
            from_col: Starting column
            to_col: Ending column

        Returns:
            True if the path is clear (no pieces in between and destination is empty)
        """
        start_col = min(from_col, to_col)
        end_col = max(from_col, to_col)

        # If destination has a piece, path is not clear
        if board[row][to_col]:
            return False

        # Check all positions in between
        for col in range(start_col + 1, end_col):
            if col == from_col:
                continue
            if board[row][col]:
                return False

        return True

    @staticmethod
    def is_path_clear_vertical(
        board: List[List[Dict[str, Any]]],
        from_row: int,
        col: int,
        to_row: int
    ) -> bool:
        """
        Check if the vertical path is clear between from_row and to_row.

        Args:
            board: 2D array representing the game board
            from_row: Starting row
            col: Column of the path
            to_row: Ending row

        Returns:
            True if the path is clear (no pieces in between and destination is empty)
        """
        start_row = min(from_row, to_row)
        end_row = max(from_row, to_row)

        # If destination has a piece, path is not clear
        if board[to_row][col]:
            return False

        # Check all positions in between
        for row in range(start_row + 1, end_row):
            if row == from_row:
                continue
            if board[row][col]:
                return False

        return True
