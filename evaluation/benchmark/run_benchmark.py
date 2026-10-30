#!/usr/bin/env python3
"""Perimeter Benchmark Runner.

Executes the accuracy scoring benchmark against ground-truth chaos scenarios.
Compatible with roadmap command: `python evaluation/benchmark/run_benchmark.py`.
"""

from pathlib import Path
import sys

# Ensure scorer is accessible
BENCHMARK_DIR = Path(__file__).resolve().parent
if str(BENCHMARK_DIR) not in sys.path:
    sys.path.insert(0, str(BENCHMARK_DIR))

from scorer import main

if __name__ == "__main__":
    main()
