#!/usr/bin/env python3
"""
Codex Collaboration Workflow Script

This script demonstrates how Codex can collaborate with the ML system
to improve models and run experiments.

Usage:
    python scripts/codex_workflow.py status
    python scripts/codex_workflow.py suggest
    python scripts/codex_workflow.py run_experiment --name "Test GRU" --type gru
    python scripts/codex_workflow.py ensemble_status
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from ml import create_codex_interface, create_training_pipeline
from ml.training_pipeline import TrainingConfig


def cmd_status(args):
    """Show current ML system status."""
    codex = create_codex_interface()
    
    print("=" * 60)
    print("LiquiFi ML System Status")
    print("=" * 60)
    
    # Current performance
    perf = codex.get_current_performance()
    print("\n📊 Current Performance:")
    print(json.dumps(perf, indent=2))
    
    # Recent experiments
    print("\n🔬 Recent Experiments:")
    exps = codex.experiment_tracker.list_experiments()[:5]
    for exp in exps:
        status_icon = "✅" if exp.status == "completed" else "⏳" if exp.status == "running" else "❌"
        print(f"  {status_icon} {exp.name} ({exp.status})")
        
    # Suggestions
    print("\n💡 Suggestions:")
    suggestions = codex.suggest_improvements()
    for s in suggestions[:3]:
        print(f"  [{s['priority'].upper()}] {s['message']}")
        

def cmd_suggest(args):
    """Get improvement suggestions."""
    codex = create_codex_interface()
    
    print("=" * 60)
    print("ML Improvement Suggestions")
    print("=" * 60)
    
    suggestions = codex.suggest_improvements()
    
    for i, s in enumerate(suggestions, 1):
        print(f"\n{i}. [{s['priority'].upper()}] {s['type']}")
        print(f"   Message: {s['message']}")
        print(f"   Action: {s['action']}")


def cmd_run_experiment(args):
    """Run a new experiment."""
    codex = create_codex_interface()
    
    print("=" * 60)
    print(f"Running Experiment: {args.name}")
    print("=" * 60)
    
    # Create experiment
    hyperparams = {
        "epochs": args.epochs,
        "learning_rate": args.lr,
        "hidden_dim": args.hidden_dim,
        "dropout": args.dropout,
    }
    
    exp_id = codex.propose_experiment(
        name=args.name,
        description=args.description or f"Testing {args.type} model",
        hypothesis=args.hypothesis or f"{args.type} will perform better than baseline",
        model_type=args.type,
        hyperparameters=hyperparams,
    )
    
    print(f"\n✅ Experiment created: {exp_id}")
    
    if args.execute:
        print("\n🚀 Executing experiment...")
        result = codex.run_experiment(exp_id)
        
        if result["status"] == "success":
            print(f"✅ Experiment completed!")
            print(f"   Metrics: {json.dumps(result['metrics'], indent=2)}")
        else:
            print(f"❌ Experiment failed: {result.get('error', 'Unknown error')}")
    else:
        print("\n💡 Use --execute flag to run the experiment")


def cmd_ensemble_status(args):
    """Check ensemble status."""
    from ml.ensemble import EnsembleManager
    
    print("=" * 60)
    print("Ensemble Status")
    print("=" * 60)
    
    ensemble = EnsembleManager()
    
    print(f"\n📦 Loaded Models: {len(ensemble.models)}")
    for name in ensemble.models.keys():
        print(f"  • {name}")
        
    print(f"\n⚖️  Model Weights:")
    for name, weight in ensemble.model_weights.items():
        print(f"  • {name}: {weight:.3f}")


def cmd_compare_models(args):
    """Compare multiple models."""
    codex = create_codex_interface()
    
    print("=" * 60)
    print("Model Comparison")
    print("=" * 60)
    
    if not args.model_ids:
        # List available models
        versions = codex.model_registry.list_versions()
        print("\nAvailable models:")
        for v in versions[:10]:
            print(f"  • {v.version_id} ({v.model_type})")
        print("\nUse --model-ids to compare specific models")
        return
        
    result = codex.compare_models(args.model_ids)
    
    if "error" in result:
        print(f"❌ Error: {result['error']}")
        return
        
    print(f"\nComparing: {', '.join(result['models'])}")
    print("\n📊 Metrics Comparison:")
    print(json.dumps(result["comparison"], indent=2))
    
    print("\n🏆 Best per Metric:")
    for metric, winner in result["best_per_metric"].items():
        print(f"  • {metric}: {winner}")


def main():
    parser = argparse.ArgumentParser(
        description="Codex Collaboration Workflow for LiquiFi ML",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s status
  %(prog)s suggest
  %(prog)s run_experiment --name "Test GRU" --type gru --execute
  %(prog)s ensemble_status
  %(prog)s compare --model-ids model_v1 model_v2
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Status command
    status_parser = subparsers.add_parser("status", help="Show ML system status")
    status_parser.set_defaults(func=cmd_status)
    
    # Suggest command
    suggest_parser = subparsers.add_parser("suggest", help="Get improvement suggestions")
    suggest_parser.set_defaults(func=cmd_suggest)
    
    # Run experiment command
    exp_parser = subparsers.add_parser("run_experiment", help="Run a new experiment")
    exp_parser.add_argument("--name", required=True, help="Experiment name")
    exp_parser.add_argument("--type", default="lstm", choices=["lstm", "gru", "transformer"],
                          help="Model type")
    exp_parser.add_argument("--description", help="Experiment description")
    exp_parser.add_argument("--hypothesis", help="Experiment hypothesis")
    exp_parser.add_argument("--epochs", type=int, default=100, help="Training epochs")
    exp_parser.add_argument("--lr", type=float, default=0.001, help="Learning rate")
    exp_parser.add_argument("--hidden-dim", type=int, default=128, help="Hidden dimensions")
    exp_parser.add_argument("--dropout", type=float, default=0.15, help="Dropout rate")
    exp_parser.add_argument("--execute", action="store_true", help="Execute the experiment")
    exp_parser.set_defaults(func=cmd_run_experiment)
    
    # Ensemble status command
    ensemble_parser = subparsers.add_parser("ensemble_status", help="Check ensemble status")
    ensemble_parser.set_defaults(func=cmd_ensemble_status)
    
    # Compare command
    compare_parser = subparsers.add_parser("compare", help="Compare models")
    compare_parser.add_argument("--model-ids", nargs="+", help="Model IDs to compare")
    compare_parser.set_defaults(func=cmd_compare_models)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
        
    args.func(args)


if __name__ == "__main__":
    main()
