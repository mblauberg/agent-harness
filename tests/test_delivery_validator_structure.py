from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "skills" / "deliver" / "scripts" / "validate_delivery.py"


def test_delivery_validator_coordinator_stays_within_review_cap() -> None:
    assert len(VALIDATOR.read_text().splitlines()) <= 1_000
