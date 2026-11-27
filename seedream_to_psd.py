"""把 seedream_layers.py 已保存的 manifest.json 和原图整理为分层 PSD。

Python 3.11+，安装依赖：python -m pip install psd-tools==1.27.0
用法：python seedream_to_psd.py shot-01/manifest.json shot-01.psd
本工具只读取本地文件。
"""
import argparse
import json
import math
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage


def layer_order(item, position):
    value = item.get("z_index", position)
    if isinstance(value, str) and value.strip().isdecimal():
        value = int(value)
    if type(value) is not int or value < 0:
        raise ValueError(f"第 {position + 1} 项的 z_index 无效。")
    return value


def read_bitmap(item, folder):
    filename = item.get("file")
    if not isinstance(filename, str) or not filename:
        raise ValueError("缺少本地图片。若回执只有 URL，请先保存原图，在该项的 file 字段填入本地文件名。")
    path = (folder / filename).resolve()
    if path.parent != folder or Path(filename).name != filename:
        raise ValueError("file 必须是 manifest.json 同一目录内的文件名。")
    with Image.open(path, formats=("PNG", "JPEG")) as image:
        return image.convert("RGBA")


def place_bitmap(item, image, canvas):
    box = item.get("bounding_box")
    if box is None and image.size == canvas:
        return image, 0, 0
    coordinates = box.get("absolute") if isinstance(box, dict) else None
    if not isinstance(coordinates, list) or len(coordinates) != 4 or not all(
        type(value) in (int, float) and math.isfinite(value) for value in coordinates
    ):
        raise ValueError("裁切图层需要 bounding_box.absolute 的四个像素坐标。")
    left, top, right, bottom = map(round, coordinates)
    width, height = right - left, bottom - top
    # 两种实际表示都保留原始像素：右下边界，或右下最后一个像素。
    if width < 0 or height < 0:
        raise ValueError(f"图层边界颠倒：{coordinates}")
    if image.width in (width, width + 1) and image.height in (height, height + 1):
        return image, left, top
    if not (0 < width <= canvas[0] and 0 < height <= canvas[1]):
        raise ValueError(f"无法把原图 {image.size} 对齐到边界 {coordinates}。请核对原回执。")
    print(f"按回执边界缩放 {item['file']}：{image.size} → {(width, height)}")
    return image.resize((width, height), Image.Resampling.LANCZOS), left, top


def export_psd(manifest_path, target):
    if target.exists():
        raise FileExistsError(f"目标已存在：{target}")
    manifest = json.loads(manifest_path.read_bytes())
    items = manifest.get("images") if isinstance(manifest, dict) else None
    if not isinstance(items, list) or not items or not all(isinstance(item, dict) for item in items):
        raise ValueError("需要 seedream_layers.py 生成的 manifest.json（含 images 数组）。")
    ordered = sorted((layer_order(item, i), i, item) for i, item in enumerate(items))
    if ordered[0][0] != 0 or (len(ordered) > 1 and ordered[1][0] == 0):
        raise ValueError("需要一张能确定为第 0 层的底图。")
    folder = manifest_path.resolve().parent
    base = read_bitmap(ordered[0][2], folder)
    canvas = base.size
    document = PSDImage.new("RGBA", canvas, color=(0, 0, 0, 0))
    for depth, _, item in ordered:
        if depth == 0:
            image, left, top = base, 0, 0
        else:
            image, left, top = place_bitmap(item, read_bitmap(item, folder), canvas)
        layer = document.create_pixel_layer(image, left=left, top=top)
        name = item.get("name") or ("背景" if depth == 0 else f"图层 {depth}")
        layer.name = str(name).replace("\x00", "")[:255]

    with target.open("xb") as output:
        try:
            document.save(output)
            output.flush()
        except BaseException:
            output.close()
            target.unlink(missing_ok=True)
            raise
    print(f"已保存 {target}，画布 {canvas[0]}×{canvas[1]}，共 {len(document)} 个像素图层。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        export_psd(args.manifest, args.output)
    except (OSError, ValueError, OverflowError) as error:
        parser.exit(1, f"未完成：{error}\n")
