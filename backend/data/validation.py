"""
Data Validation System for Treasury Automation App

Validates scraped data to prevent garbage from entering the ML pipeline.
"""

import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger("liquifi.validation")


@dataclass
class ValidationRule:
    """A validation rule for a data field."""
    field: str
    min_value: float
    max_value: float
    required: bool = True
    description: str = ""


@dataclass
class ValidationResult:
    """Result of data validation."""
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    sanitized_data: Dict[str, float]


# Validation rules for Indian money market rates
VALIDATION_RULES = {
    # Policy rates (RBI)
    "repo": ValidationRule("repo", 2.0, 10.0, True, "RBI Policy Repo Rate"),
    "reverse_repo": ValidationRule("reverse_repo", 1.5, 9.5, False, "RBI Reverse Repo Rate"),
    
    # Market rates (CCIL)
    "mibor_overnight": ValidationRule("mibor_overnight", 2.0, 12.0, True, "Overnight MIBOR"),
    "call_money_high": ValidationRule("call_money_high", 2.0, 15.0, True, "Call Money High"),
    "call_money_low": ValidationRule("call_money_low", 2.0, 15.0, True, "Call Money Low"),
    "cblo_bid": ValidationRule("cblo_bid", 2.0, 12.0, True, "CBLO Bid Rate"),
    "cblo_ask": ValidationRule("cblo_ask", 2.0, 12.0, True, "CBLO Ask Rate"),
    
    # T-Bill rates
    "tbill_91d": ValidationRule("tbill_91d", 2.0, 10.0, False, "91-day T-Bill"),
    "tbill_182d": ValidationRule("tbill_182d", 2.0, 10.5, False, "182-day T-Bill"),
    "tbill_364d": ValidationRule("tbill_364d", 2.0, 11.0, False, "364-day T-Bill"),
    
    # Other rates
    "gsec_10y": ValidationRule("gsec_10y", 4.0, 10.0, False, "10-year G-Sec"),
    "usdinr_spot": ValidationRule("usdinr_spot", 70.0, 95.0, True, "USD/INR Spot"),
    
    # Derived/spread checks
    "mibor_repo_spread": ValidationRule("mibor_repo_spread", -2.0, 5.0, False, "MIBOR-Repo Spread"),
}


class DataValidator:
    """Validates scraped financial data."""
    
    def __init__(self):
        self.rules = VALIDATION_RULES
        self._historical_ranges: Dict[str, Tuple[float, float]] = {}
        
    def validate_snapshot(self, data: Dict[str, float]) -> ValidationResult:
        """
        Validate a complete snapshot of rate data.
        
        Args:
            data: Dictionary of field names to values
            
        Returns:
            ValidationResult with is_valid, errors, warnings, sanitized data
        """
        errors = []
        warnings = []
        sanitized = {}
        
        # Check each field against rules
        for field, value in data.items():
            if field in self.rules:
                rule = self.rules[field]
                is_valid, msg = self._validate_field(field, value, rule)
                
                if not is_valid:
                    if rule.required:
                        errors.append(f"{field}: {msg}")
                        logger.error(f"Validation error: {field}={value} - {msg}")
                    else:
                        warnings.append(f"{field}: {msg}")
                        logger.warning(f"Validation warning: {field}={value} - {msg}")
                else:
                    sanitized[field] = value
            else:
                # Field not in rules, accept it but warn
                sanitized[field] = value
                
        # Cross-field validations
        cross_errors, cross_warnings = self._validate_cross_fields(data)
        errors.extend(cross_errors)
        warnings.extend(cross_warnings)
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            sanitized_data=sanitized
        )
        
    def _validate_field(self, field: str, value: float, rule: ValidationRule) -> Tuple[bool, str]:
        """Validate a single field."""
        # Check for NaN or infinity
        if value != value or value == float('inf') or value == float('-inf'):  # NaN check
            return False, f"Invalid numeric value: {value}"
            
        # Check range
        if value < rule.min_value:
            return False, f"Value {value} below minimum {rule.min_value}"
        if value > rule.max_value:
            return False, f"Value {value} above maximum {rule.max_value}"
            
        return True, "OK"
        
    def _validate_cross_fields(self, data: Dict[str, float]) -> Tuple[List[str], List[str]]:
        """Validate relationships between fields."""
        errors = []
        warnings = []
        
        # Check high > low
        if "call_money_high" in data and "call_money_low" in data:
            if data["call_money_high"] < data["call_money_low"]:
                errors.append("call_money_high < call_money_low (inverted)")
                
        # Check cblo_ask > cblo_bid
        if "cblo_bid" in data and "cblo_ask" in data:
            if data["cblo_ask"] < data["cblo_bid"]:
                errors.append("cblo_ask < cblo_bid (inverted)")
                
        # Check repo < mibor (usually)
        if "repo" in data and "mibor_overnight" in data:
            spread = data["mibor_overnight"] - data["repo"]
            if spread < -1.0:  # MIBOR way below repo is suspicious
                warnings.append(f"Unusual MIBOR-Repo spread: {spread:.2f}%")
            if spread > 5.0:  # MIBOR way above repo is suspicious
                warnings.append(f"Extreme MIBOR-Repo spread: {spread:.2f}%")
                
        return errors, warnings
        
    def validate_scraped_data(self, source: str, data: Dict[str, float]) -> ValidationResult:
        """
        Validate data from a specific scraper source.
        
        Args:
            source: Source name ("rbi", "ccil", "fbil", "nse")
            data: Scraped data
            
        Returns:
            ValidationResult
        """
        result = self.validate_snapshot(data)
        
        if not result.is_valid:
            logger.error(f"{source} data validation failed: {result.errors}")
        elif result.warnings:
            logger.warning(f"{source} data validation warnings: {result.warnings}")
        else:
            logger.debug(f"{source} data validation passed")
            
        return result


class DataSanitizer:
    """Sanitize and clean data before storage."""
    
    @staticmethod
    def sanitize_rate(value: Optional[float], default: float = None) -> Optional[float]:
        """Sanitize a single rate value."""
        if value is None:
            return default
            
        # Check for NaN/inf
        if value != value or value == float('inf') or value == float('-inf'):
            return default
            
        # Round to reasonable precision
        return round(value, 4)
        
    @staticmethod
    def sanitize_snapshot(data: Dict[str, float]) -> Dict[str, float]:
        """Sanitize all values in a snapshot."""
        sanitized = {}
        for field, value in data.items():
            clean = DataSanitizer.sanitize_rate(value)
            if clean is not None:
                sanitized[field] = clean
        return sanitized


# Global validator instance
_validator: Optional[DataValidator] = None


def get_validator() -> DataValidator:
    """Get or create global validator."""
    global _validator
    if _validator is None:
        _validator = DataValidator()
    return _validator


def validate_scraped_data(source: str, data: Dict[str, float]) -> ValidationResult:
    """Convenience function to validate scraped data."""
    validator = get_validator()
    return validator.validate_scraped_data(source, data)


def validate_and_sanitize(data: Dict[str, float]) -> Dict[str, float]:
    """Validate and return sanitized data (or empty if invalid)."""
    validator = get_validator()
    result = validator.validate_snapshot(data)
    
    if not result.is_valid:
        logger.error(f"Data validation failed, rejecting: {result.errors}")
        return {}
        
    return result.sanitized_data


def check_data_quality(data: Dict[str, float]) -> Dict[str, any]:
    """Quick data quality check."""
    validator = get_validator()
    result = validator.validate_snapshot(data)
    
    return {
        "valid": result.is_valid,
        "score": max(0, 100 - len(result.errors) * 20 - len(result.warnings) * 5),
        "errors": result.errors,
        "warnings": result.warnings,
        "fields_ok": len(result.sanitized_data),
        "fields_total": len(data)
    }
