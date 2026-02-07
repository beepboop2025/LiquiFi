"""Model definitions for liquidity forecasting: LSTM, GRU, Transformer."""

import torch
import torch.nn as nn

import config


class LSTMLiquidityModel(nn.Module):
    """
    LSTM model for 24-hour liquidity balance forecasting.

    Input:  (batch, seq_len, num_features)
    LSTM:   multi-layer with dropout
    FC:     hidden -> 64 -> forecast_horizon
    Output: (batch, forecast_horizon)
    """

    def __init__(
        self,
        num_features: int = config.NUM_FEATURES,
        hidden_size: int = config.LSTM_HIDDEN,
        num_layers: int = config.LSTM_LAYERS,
        dropout: float = config.LSTM_DROPOUT,
        forecast_horizon: int = config.FORECAST_HORIZON,
    ):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=num_features,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout,
            batch_first=True,
        )
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, forecast_horizon),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        lstm_out, _ = self.lstm(x)
        last_hidden = lstm_out[:, -1, :]
        return self.fc(last_hidden)


class GRULiquidityModel(nn.Module):
    """GRU alternative — fewer parameters, faster training."""

    def __init__(
        self,
        num_features: int = config.NUM_FEATURES,
        hidden_size: int = 128,
        num_layers: int = 2,
        dropout: float = 0.15,
        forecast_horizon: int = config.FORECAST_HORIZON,
    ):
        super().__init__()
        self.gru = nn.GRU(
            input_size=num_features,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0,
            batch_first=True,
        )
        self.norm = nn.LayerNorm(hidden_size)
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, forecast_horizon),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.gru(x)
        out = self.norm(out[:, -1, :])
        return self.fc(out)


class TransformerLiquidityModel(nn.Module):
    """Transformer with temporal attention for liquidity forecasting."""

    def __init__(
        self,
        num_features: int = config.NUM_FEATURES,
        d_model: int = 64,
        nhead: int = 4,
        num_layers: int = 2,
        dropout: float = 0.1,
        forecast_horizon: int = config.FORECAST_HORIZON,
    ):
        super().__init__()
        self.input_proj = nn.Linear(num_features, d_model)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 4,
            dropout=dropout,
            batch_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers)
        self.fc = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, forecast_horizon),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_proj(x)
        x = self.transformer(x)
        x = x.mean(dim=1)  # Global average pooling
        return self.fc(x)


# Registry for easy access
MODEL_REGISTRY = {
    "lstm": LSTMLiquidityModel,
    "gru": GRULiquidityModel,
    "transformer": TransformerLiquidityModel,
}
