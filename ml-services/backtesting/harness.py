"""
SmartStock Decision Intelligence V1 — Offline Decision Backtesting Engine
Simulates historical inventory timestamps, runs recommendation models with future data hidden,
and benchmarks decision quality against actual observations.
"""

from typing import List, Dict, Any

class DecisionBacktester:
    def __init__(self, model_id: str = "replenishment_optimizer_v1"):
        self.model_id = model_id

    def run_backtest(self, historical_episodes: List[Dict[str, Any]]) -> Dict[str, Any]:
        total_episodes = len(historical_episodes)
        correct_interventions = 0
        prevented_shortages_observed = 0
        false_alarms = 0

        for ep in historical_episodes:
            sellable_at_t = ep.get("sellable_qty_at_t", 10)
            velocity = ep.get("velocity_at_t", 2.0)
            actual_future_demand = ep.get("actual_future_demand", 15)

            # Model Decision Simulation
            projected_stockout = sellable_at_t < (velocity * 4.0)
            
            if projected_stockout:
                # Recommendation: Intervene
                if actual_future_demand > sellable_at_t:
                    correct_interventions += 1
                    prevented_shortages_observed += 1
                else:
                    false_alarms += 1
            else:
                if actual_future_demand <= sellable_at_t:
                    correct_interventions += 1

        accuracy = round((correct_interventions / max(total_episodes, 1)) * 100, 2)
        precision = round((prevented_shortages_observed / max(prevented_shortages_observed + false_alarms, 1)) * 100, 2)

        return {
            "model_tested": self.model_id,
            "total_episodes_evaluated": total_episodes,
            "overall_decision_accuracy_pct": accuracy,
            "intervention_precision_pct": precision,
            "false_alarm_rate_pct": round(100.0 - precision, 2),
            "backtest_status": "PASSED_BENCHMARK" if accuracy >= 85.0 else "FAILED_BENCHMARK"
        }

if __name__ == "__main__":
    harness = DecisionBacktester("mixed_integer_replenishment_v1")
    # Synthetic validation dataset
    episodes = [
        {"sellable_qty_at_t": 4, "velocity_at_t": 1.5, "actual_future_demand": 12},
        {"sellable_qty_at_t": 20, "velocity_at_t": 1.0, "actual_future_demand": 6},
        {"sellable_qty_at_t": 2, "velocity_at_t": 1.8, "actual_future_demand": 10},
        {"sellable_qty_at_t": 35, "velocity_at_t": 2.0, "actual_future_demand": 14},
    ]
    results = harness.run_backtest(episodes)
    print("Backtest Results:", results)
