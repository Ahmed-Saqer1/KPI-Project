"""KPI package for computing metrics from test records.

Exports helpers:
- load_kpi_config: read YAML config for KPI formulas/thresholds
- compute_kpis: calculate KPIs from provided records (and optional productivity hours)
"""
from .config_loader import load_kpi_config
from .engine import compute_kpis
