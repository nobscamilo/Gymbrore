#!/usr/bin/env python3

from __future__ import annotations

import argparse
from collections import defaultdict, deque
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_IMAGE = ROOT / "assets" / "anatomy-source" / "muscle-reference-pro-quad-source.png"
OUTPUT_DIR = ROOT / "public" / "anatomy" / "masks"
PREVIEW_CELL_SIZE = (260, 420)

ALIGNED_CROPS = {
    "front": (242, 384, 242 + 215, 384 + 384),
    "back": (947, 384, 947 + 215, 384 + 384),
}

MASK_RULES = {
    "front": {
        "shoulders": [("idx", 5), ("idx", 10)],
        "chest": [("idx", 4)],
        "biceps": [("component_rank", 3, [0, 1])],
        "forearms": [
            ("component_rank", 3, [2, 3]),
            ("idx", 11),
            ("keep_y_between", 140, 240),
        ],
        "core": [
            ("idx", 6),
            ("idx", 8),
            ("keep_y_between", 118, 170),
            ("bbox", 60, 165, 108, 175),
        ],
        "hip_flexors": [
            ("idx", 6),
            ("idx", 8),
            ("keep_y_between", 165, 220),
            ("bbox", 78, 145, 150, 220),
        ],
        "quads": [("idx", 1), ("keep_y_between", 175, 285)],
        "calves": [("idx", 7), ("keep_y_gte", 255)],
    },
    "back": {
        "shoulders": [("idx", 8)],
        "back": [
            ("idx", 2),
            ("idx", 6),
            ("idx", 11),
            ("idx", 15),
            ("bbox", 48, 172, 26, 188),
        ],
        "triceps": [
            ("idx", 5),
            ("idx", 10),
            ("keep_y_between", 88, 190),
            ("or_bbox", 0, 70, 80, 210),
            ("or_bbox", 145, 214, 80, 210),
        ],
        "forearms": [
            ("idx", 9),
            ("component_rank", 2, [2, 3]),
            ("keep_y_between", 125, 245),
            ("or_bbox", 0, 70, 120, 245),
            ("or_bbox", 145, 214, 120, 245),
        ],
        "glutes": [("idx", 3), ("keep_y_between", 168, 238)],
        "hamstrings": [("idx", 1), ("keep_y_between", 215, 286)],
        "calves": [("idx", 1), ("keep_y_gte", 286)],
    },
}


def quantize(crop: Image.Image) -> Image.Image:
    return crop.convert("P", palette=Image.ADAPTIVE, colors=16)


def collect_components(image: Image.Image) -> dict[int, list[dict[str, object]]]:
    width, height = image.size
    pixels = image.load()
    seen = [[False] * width for _ in range(height)]
    components: dict[int, list[dict[str, object]]] = defaultdict(list)

    for y in range(height):
        for x in range(width):
            if seen[y][x]:
                continue

            index = pixels[x, y]
            queue = deque([(x, y)])
            seen[y][x] = True
            coords: list[tuple[int, int]] = []
            count = 0
            min_x, min_y, max_x, max_y = width, height, 0, 0

            while queue:
                current_x, current_y = queue.popleft()
                coords.append((current_x, current_y))
                count += 1
                min_x = min(min_x, current_x)
                min_y = min(min_y, current_y)
                max_x = max(max_x, current_x)
                max_y = max(max_y, current_y)

                for next_x, next_y in (
                    (current_x + 1, current_y),
                    (current_x - 1, current_y),
                    (current_x, current_y + 1),
                    (current_x, current_y - 1),
                ):
                    if (
                        0 <= next_x < width
                        and 0 <= next_y < height
                        and not seen[next_y][next_x]
                        and pixels[next_x, next_y] == index
                    ):
                        seen[next_y][next_x] = True
                        queue.append((next_x, next_y))

            components[index].append(
                {
                    "count": count,
                    "coords": coords,
                    "bbox": (min_x, min_y, max_x, max_y),
                }
            )

    for groups in components.values():
        groups.sort(key=lambda group: group["count"], reverse=True)

    return components


def select_pixels(
    image: Image.Image,
    components_by_index: dict[int, list[dict[str, object]]],
    rules: Iterable[tuple[object, ...]],
) -> set[tuple[int, int]]:
    width, height = image.size
    pixels = image.load()
    selected: set[tuple[int, int]] = set()
    bbox_filters: list[tuple[int, int, int, int]] = []

    for rule in rules:
        kind = rule[0]
        if kind == "idx":
            index = int(rule[1])
            for y in range(height):
                for x in range(width):
                    if pixels[x, y] == index:
                        selected.add((x, y))
        elif kind == "component_rank":
            index = int(rule[1])
            ranks = rule[2]
            for rank in ranks:
                if rank < len(components_by_index.get(index, [])):
                    component = components_by_index[index][rank]
                    selected.update(component["coords"])  # type: ignore[arg-type]
        elif kind == "keep_y_between":
            lower, upper = int(rule[1]), int(rule[2])
            selected = {coord for coord in selected if lower <= coord[1] < upper}
        elif kind == "keep_y_gte":
            lower = int(rule[1])
            selected = {coord for coord in selected if coord[1] >= lower}
        elif kind == "bbox":
            min_x, max_x, min_y, max_y = map(int, rule[1:5])
            selected = {
                coord
                for coord in selected
                if min_x <= coord[0] <= max_x and min_y <= coord[1] <= max_y
            }
        elif kind == "or_bbox":
            bbox_filters.append(tuple(map(int, rule[1:5])))

    if bbox_filters:
        selected = {
            coord
            for coord in selected
            if any(
                min_x <= coord[0] <= max_x and min_y <= coord[1] <= max_y
                for min_x, max_x, min_y, max_y in bbox_filters
            )
        }

    return selected


def build_preview(
    crops: dict[str, Image.Image],
    output_dir: Path,
    preview_dir: Path,
) -> None:
    preview_dir.mkdir(parents=True, exist_ok=True)

    for view, crop in crops.items():
        masks = sorted(output_dir.glob(f"{view}-*.png"))
        if not masks:
            continue

        grayscale_base = ImageOps.grayscale(crop).convert("RGBA")
        grayscale_base.putalpha(220)
        cell_width, cell_height = PREVIEW_CELL_SIZE
        columns = 3
        rows = (len(masks) + columns - 1) // columns
        sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), (10, 10, 12, 255))

        for index, mask_path in enumerate(masks):
            row, column = divmod(index, columns)
            x_origin, y_origin = column * cell_width, row * cell_height
            panel = Image.new("RGBA", (cell_width, cell_height), (18, 18, 24, 255))
            panel.alpha_composite(grayscale_base.resize((215, 384)), ((cell_width - 215) // 2, 16))

            mask = Image.open(mask_path).convert("L")
            overlay = Image.new("RGBA", (215, 384), (220, 38, 38, 0))
            overlay.putalpha(mask.point(lambda value: int(value * 0.9)))
            panel.alpha_composite(overlay, ((cell_width - 215) // 2, 16))
            ImageDraw.Draw(panel).text((16, 388), mask_path.stem, fill=(230, 230, 235, 255))
            sheet.alpha_composite(panel, (x_origin, y_origin))

        sheet.save(preview_dir / f"{view}-mask-preview.png")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate muscle mask PNGs from the colored anatomy source.")
    parser.add_argument(
        "--preview-dir",
        type=Path,
        help="Optional directory for QA preview sheets.",
    )
    args = parser.parse_args()

    if not SOURCE_IMAGE.exists():
        raise FileNotFoundError(f"Missing anatomy source image: {SOURCE_IMAGE}")

    source = Image.open(SOURCE_IMAGE).convert("RGBA")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    crops = {
        view: source.crop(bounds)
        for view, bounds in ALIGNED_CROPS.items()
    }

    for existing_mask in OUTPUT_DIR.glob("*.png"):
        existing_mask.unlink()

    for view, crop in crops.items():
        quantized = quantize(crop)
        components = collect_components(quantized)

        for muscle, rules in MASK_RULES[view].items():
            selected_pixels = select_pixels(quantized, components, rules)
            mask = Image.new("L", quantized.size, 0)
            for x, y in selected_pixels:
                mask.putpixel((x, y), 255)
            rgba_mask = Image.new("RGBA", quantized.size, (255, 255, 255, 0))
            rgba_mask.putalpha(mask)
            rgba_mask.save(OUTPUT_DIR / f"{view}-{muscle}.png")

    if args.preview_dir:
        build_preview(crops, OUTPUT_DIR, args.preview_dir)


if __name__ == "__main__":
    main()
