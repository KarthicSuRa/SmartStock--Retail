"""
SmartStock Context Intelligence V1 — Python Context Feature Processor
Constructs exogenous feature regressors for Prophet and LightGBM models.
"""

from typing import Dict, Any, List
import pandas as pd
import numpy as np

class ContextFeatureProcessor:
    @staticmethod
    def prepare_exogenous_dataframe(
        base_df: pd.DataFrame,
        context_features: Dict[str, Any]
    ) -> pd.DataFrame:
        """
        Appends external regressors:
        - temp_c_forecast
        - temp_delta_norm
        - is_promo
        - discount_depth
        - days_to_holiday
        - event_impact
        """
        df = base_df.copy()
        df['temp_c'] = context_features.get('temperature_c', 20.0)
        df['temp_delta'] = context_features.get('temperature_delta_norm', 0.0)
        df['is_promo'] = 1 if context_features.get('is_on_promotion', False) else 0
        df['discount_depth'] = context_features.get('discount_percentage', 0.0) / 100.0
        df['days_to_holiday'] = context_features.get('days_until_holiday', 7)
        df['event_impact'] = context_features.get('event_impact_score', 0.0)
        
        return df
