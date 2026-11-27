"""千流 Seedream 5.5 单张海报拆层。只预览：python seedream_layers.py poster.png

付费发送一次：python seedream_layers.py poster.png --send --out shot-01
离线整理旧回执：python seedream_layers.py shot-01/response.json --unpack --out recovered
需要 Python 3.8+。令牌取自 QIANLIU_API_KEY 或终端隐藏输入。
"""
import argparse
import base64
import getpass
import http.client
import json
import os
import sys
from pathlib import Path


HOST = "www.plusapi.cn"
ENDPOINT = "/v1/images/generations"
MODEL = "doubao-seedream-5-5-261028"


def image_type(header):
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    raise ValueError("图片格式无法识别。本工具接受 PNG 或 JPEG。")


def export_layers(result, out):
    items = result.get("data") if isinstance(result, dict) else None
    if not isinstance(items, list) or not items:
        raise ValueError("回执没有可导出的 data 项。")
    manifest = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError("回执第 {} 项不是图片对象。".format(index + 1))
        entry = {k: item[k] for k in ("z_index", "size", "name", "bounding_box") if k in item}
        if item.get("b64_json"):
            data = base64.b64decode(item["b64_json"], validate=True)
            filename = "image-{:02d}.{}".format(index, image_type(data))
            (out / filename).write_bytes(data)
            entry["file"] = filename
        elif item.get("url"):
            entry["url"] = item["url"]
            print("第 {} 张返回了临时 URL，请从 manifest.json 保存原图。".format(index + 1))
        else:
            raise ValueError("回执第 {} 项没有图片，详见 response.json。".format(index + 1))
        manifest.append(entry)
    summary = {"model": result.get("model", MODEL), "usage": result.get("usage"), "images": manifest}
    (out / "manifest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("已整理 {} 张。位置、层序和用量见 {}。".format(len(items), out / "manifest.json"))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, help="本地 PNG、JPEG；使用 --unpack 时填已保存的 JSON 回执")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--send", action="store_true", help="向千流发送有权使用的原图，发起一次付费拆层")
    mode.add_argument("--unpack", action="store_true", help="仅整理已有回执，不联网、不扣费")
    parser.add_argument("--out", type=Path, help="发送或整理时必填，须为尚不存在的新目录")
    args = parser.parse_args()
    if args.send or args.unpack:
        if args.out is None:
            parser.error("请用 --out 指定新目录。")
        if args.out.exists():
            raise ValueError("输出目录已存在。如先前发过请求，请先查看原回执及使用日志。")
    if args.unpack:
        result = json.loads(args.source.read_bytes())
        args.out.mkdir()
        export_layers(result, args.out)
        return
    with args.source.open("rb") as source:
        kind = image_type(source.read(8))
    print("模型 {}，doubao-image-2 分组，1 张输入，2K，最多 3 张输出（含底图）。".format(MODEL))
    if not args.send:
        print("本次只预览，没有发送图片或读取令牌。确认后加 --send --out 新目录名。")
        return
    key = os.environ.get("QIANLIU_API_KEY") or getpass.getpass("本次使用的千流 doubao-image-2 令牌：")
    if not key.strip():
        raise ValueError("令牌为空。")
    source_data = base64.b64encode(args.source.read_bytes()).decode("ascii")
    payload = {
        "model": MODEL,
        "prompt": "请将标题与主体商品从背景分离，保留底图，分别输出可独立编辑的图层。",
        "image": "data:image/{};base64,{}".format(kind, source_data),
        "layer_decomposition": True,
        "layer_decomposition_options": {"max_images": 3},
        "size": "2K",
        "output_format": "png",
        "response_format": "b64_json",
    }
    request_body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    args.out.mkdir()
    connection = http.client.HTTPSConnection(HOST, timeout=300)
    try:
        connection.request("POST", ENDPOINT, body=request_body, headers={
            "Authorization": "Bearer " + key.strip(), "Content-Type": "application/json",
        })
        response = connection.getresponse()
        receipt = args.out / "response.json"
        with receipt.open("xb") as destination:
            while True:
                chunk = response.read(262144)
                if not chunk:
                    break
                destination.write(chunk)
        if not 200 <= response.status < 300:
            raise ValueError("HTTP {}。请查 {} 和千流使用日志。".format(response.status, receipt))
    finally:
        connection.close()
    export_layers(json.loads(receipt.read_bytes()), args.out)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, EOFError, http.client.HTTPException) as error:
        sys.exit("未完成：{}\n若已发起请求，请保留输出目录并核对千流使用日志后再决定是否重试。".format(error))
