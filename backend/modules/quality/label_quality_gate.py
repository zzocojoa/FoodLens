from __future__ import annotations

from dataclasses import dataclass
from PIL import Image, ImageFilter, ImageStat


@dataclass(frozen=True)
class LabelQualityMetrics:
    blur_score: float
    contrast_score: float
    text_density_score: float
    glare_ratio: float


@dataclass(frozen=True)
class LabelQualityResult:
    passed: bool
    failed_checks: list[str]
    metrics: LabelQualityMetrics


def evaluate_label_image_quality(
    image: Image.Image,
    *,
    min_blur_score: float = 15.0,
    min_contrast_score: float = 25.0,
    min_text_density_score: float = 0.01,
    max_glare_ratio: float = 0.95,
) -> LabelQualityResult:
    """
    Lightweight quality gate for label photos.
    - blur_score: edge variance proxy (higher => sharper)
    - contrast_score: grayscale stddev (higher => better contrast)
    - text_density_score: ratio of strong-edge pixels
    - glare_ratio: ratio of near-white saturated pixels
    """
    gray = image.convert("L")
    edge = gray.filter(ImageFilter.FIND_EDGES)

    edge_stat = ImageStat.Stat(edge)
    gray_stat = ImageStat.Stat(gray)

    blur_score = float(edge_stat.var[0])
    contrast_score = float(gray_stat.stddev[0])

    edge_hist = edge.histogram()
    total_pixels = max(1, int(sum(edge_hist)))
    strong_edge_count = int(sum(edge_hist[25:]))
    text_density_score = strong_edge_count / total_pixels

    gray_hist = gray.histogram()
    glare_count = int(sum(gray_hist[245:]))
    glare_ratio = glare_count / total_pixels

    metrics = LabelQualityMetrics(
        blur_score=blur_score,
        contrast_score=contrast_score,
        text_density_score=text_density_score,
        glare_ratio=glare_ratio,
    )

    failed_checks: list[str] = []
    if blur_score < min_blur_score:
        failed_checks.append("blur")
    if contrast_score < min_contrast_score:
        failed_checks.append("contrast")
    if text_density_score < min_text_density_score:
        failed_checks.append("text_density")
    if glare_ratio > max_glare_ratio:
        failed_checks.append("glare")

    return LabelQualityResult(
        passed=len(failed_checks) == 0,
        failed_checks=failed_checks,
        metrics=metrics,
    )
