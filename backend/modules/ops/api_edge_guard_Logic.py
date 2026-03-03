"""
Logic facade for api_edge_guard.py.
Auto-generated to isolate symbols by module role.
"""

from .api_edge_guard import (
    InMemoryEndpointAdmissionLimiter,
    InMemorySlidingWindowRateLimiter,
    build_cors_config_from_env,
    build_inflight_admission_settings_from_env,
    build_rate_limit_http_exception,
    build_rate_limit_settings_from_env,
    build_rate_limit_subject,
    extract_client_ip,
)
