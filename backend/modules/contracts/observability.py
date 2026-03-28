from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class LatencyMsContract(BaseModel):
    total: Optional[int] = None
    preprocess: Optional[int] = None
    extract: Optional[int] = None
    assess: Optional[int] = None
    source_lookup: Optional[int] = None
    allergen_analysis: Optional[int] = None
