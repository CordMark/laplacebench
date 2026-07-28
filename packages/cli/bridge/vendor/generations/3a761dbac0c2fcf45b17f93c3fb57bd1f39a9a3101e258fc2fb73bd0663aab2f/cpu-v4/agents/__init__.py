"""AI agent exports without importing optional ML runtimes eagerly."""

__all__ = ['BaseModel', 'RandomAgent', 'RLAgent', 'SB3Agent', 'MinimaxAgent']


def __getattr__(name):
    if name == "BaseModel":
        from .base import BaseModel

        return BaseModel
    if name == "RandomAgent":
        from .random import RandomAgent

        return RandomAgent
    if name == "RLAgent":
        from .rl import RLAgent

        return RLAgent
    if name == "SB3Agent":
        from .sb3 import SB3Agent

        return SB3Agent
    if name == "MinimaxAgent":
        from .minimax import MinimaxAgent

        return MinimaxAgent
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
