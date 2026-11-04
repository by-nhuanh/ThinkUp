#!/usr/bin/env python3
"""P0 pixel comparison with tolerance and selective dynamic-content masks.

Compares the current header screenshots against the baseline. The badge digit
area is masked only inside the badge box; the badge size, position, border and
background remain compared. Any design change (radius, gap, colors, geometry)
fails; a digit-only change passes.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

try:
    import numpy as np
except ImportError:  # pragma: no cover - Pillow-only fallback
    np = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--current', required=True)
    parser.add_argument('--meta', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--json', required=True)
    parser.add_argument('--tolerance', type=int, default=8)
    parser.add_argument('--max-ratio', type=float, default=0.001)
    parser.add_argument('--floor', type=int, default=12)
    return parser.parse_args()


def paint_masks(image: Image.Image, meta: dict) -> Image.Image:
    """Fill the dynamic digit area with the badge's local background color."""
    image = image.convert('RGB').copy()
    clip = meta.get('clip') or {}
    origin_x = float(clip.get('x', 0))
    origin_y = float(clip.get('y', 0))
    width, height = image.size
    for mask in meta.get('masks') or []:
        rect = mask.get('rect') or {}
        mx = round(float(rect.get('x', 0)) - origin_x)
        my = round(float(rect.get('y', 0)) - origin_y)
        mw = max(1, round(float(rect.get('width', 1))))
        mh = max(1, round(float(rect.get('height', 1))))
        x0, y0 = max(0, mx), max(0, my)
        x1, y1 = min(width, mx + mw), min(height, my + mh)
        if x1 <= x0 or y1 <= y0:
            continue
        sample_x = min(width - 1, max(0, x0 + 2))
        sample_y = min(height - 1, max(0, y0 + 2))
        color = image.getpixel((sample_x, sample_y))
        for y in range(y0, y1):
            for x in range(x0, x1):
                image.putpixel((x, y), color)
    return image


def diff_counts(image_a: Image.Image, image_b: Image.Image, tolerance: int):
    if np is not None:
        a = np.asarray(image_a, dtype=np.int16)
        b = np.asarray(image_b, dtype=np.int16)
        deltas = np.abs(a - b).max(axis=2)
        return int((deltas > tolerance).sum()), int(deltas.max()), deltas
    diff = ImageChops.difference(image_a, image_b)
    pixels = list(diff.getdata())
    values = [max(pixel) for pixel in pixels]
    return sum(1 for value in values if value > tolerance), max(values, default=0), values


def main() -> int:
    args = parse_args()
    baseline_dir = Path(args.baseline)
    current_dir = Path(args.current)
    meta_dir = Path(args.meta)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    current_images = sorted(current_dir.glob('*.png'))
    if not current_images:
        print('No current images found.', file=sys.stderr)
        return 2

    entries = []
    failures = []
    for current_path in current_images:
        key = current_path.stem
        baseline_path = baseline_dir / current_path.name
        entry = {'key': key, 'baseline': str(baseline_path), 'current': str(current_path)}
        if not baseline_path.exists():
            entry.update({'pass': False, 'reason': 'missing-baseline'})
            entries.append(entry)
            failures.append(entry)
            continue

        meta_path = meta_dir / f'{key}.json'
        meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
        base_image = paint_masks(Image.open(baseline_path), meta)
        current_image = paint_masks(Image.open(current_path), meta)
        if base_image.size != current_image.size:
            entry.update({
                'pass': False,
                'reason': 'size-mismatch',
                'baselineSize': list(base_image.size),
                'currentSize': list(current_image.size),
            })
            entries.append(entry)
            failures.append(entry)
            continue

        width, height = base_image.size
        area = width * height
        allowed = max(args.floor, int(area * args.max_ratio))
        count, max_delta, deltas = diff_counts(base_image, current_image, args.tolerance)
        passed = count <= allowed
        entry.update({
            'pass': passed,
            'size': [width, height],
            'diffPixels': count,
            'allowedPixels': allowed,
            'maxChannelDelta': max_delta,
            'tolerance': args.tolerance,
            'masks': len(meta.get('masks') or []),
        })
        entries.append(entry)
        if passed:
            continue

        failures.append(entry)
        if np is not None:
            heat = np.clip(deltas.astype('int16') * 8, 0, 255).astype('uint8')
            Image.fromarray(heat, mode='L').save(out_dir / f'{key}-diff.png')
        else:
            ordered = list(deltas)
            diff_image = Image.new('L', (width, height))
            diff_image.putdata([min(255, value * 8) for value in ordered])
            diff_image.save(out_dir / f'{key}-diff.png')

    summary = {
        'passed': len(failures) == 0,
        'total': len(entries),
        'failed': len(failures),
        'tolerance': {
            'channel': args.tolerance,
            'maxDiffRatio': args.max_ratio,
            'maxDiffPixelsFloor': args.floor,
        },
        'failures': failures,
        'entries': entries,
    }
    Path(args.json).write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(f"IMAGE_COMPARE {'PASS' if summary['passed'] else 'FAIL'} total={summary['total']} failed={summary['failed']}")
    for entry in failures[:20]:
        print(f"  FAIL {entry['key']} pixels={entry.get('diffPixels')} allowed={entry.get('allowedPixels')} max={entry.get('maxChannelDelta')} reason={entry.get('reason', 'pixel-diff')}")
    return 0 if summary['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
