#!/usr/bin/env python3
"""砌 PWA 三個 icon。

⭐⭐ **點解要一個產生器，⛔ 唔係手畫三張 PNG 擺入去**

三張圖係**同一個標誌嘅三個尺寸／三種留白**。手畫就會有一日改咗一張、
漏咗另外兩張，而**冇人會發現** —— icon 冇人日日睇。
⇒ 一句 `python3 tools/icons/build.py` 重砌三張，⛔ 唔使記住邊張係邊張。

⛔ **⛔ 唔准自己畫一個新標誌。** Jason 2026-09-16 講明：
   「用報價 app 頂部現成那個森伝標誌」。
   來源就係 `src/assets/brand-lockup.png` **左邊嗰個圓形標誌本身**
   （⛔ 唔要後面「森伝報價 SYLVAN QUOTATION」嗰段字 ——
    細到 192px 嗰陣啲字會糊到認唔出，淨係嘥咗個位）。

⚠️ `brand-lockup.png` 係**白色**嘅（畀深色 app 用）。⇒ 底色一定要深，
   ⛔ 唔可以透明：透明底喺 Android 淺色 launcher 上面會變成一片白。

⛔ 點解係 Python 唔係 `.mjs`：純 JS 寫 PNG 編碼要成幾百行，
   而呢個係**一次過嘅美術工序**，⛔ 唔係 build 嘅一部分。
   跑之前：`python3 -m pip install pillow`
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]

# app 自己個底色（`src/styles/tokens.css` 個 `--q-page-bg`）。⛔ 唔另揀一隻。
BG = (0x0D, 0x12, 0x0E, 255)

# 左邊圓形標誌嗰忽。⭐ 實測返嚟嘅：非透明欄位第一段係 0–149（成張圖 546×147）。
MARK_BOX = (0, 0, 150, 147)

# 標誌喺張圖入面佔幾多。
#
# ⛔⛔ 兩個數⛔ 唔可以撈埋：
#   · maskable —— Android 會**自己剪**（圓形／方角／水滴，睇部機）。
#     ⭐ 安全區係中間 80%，所以個標誌縮到 **60%** 先穩陣
#     （⚠️ 就住 80% 做，剪圓嗰陣四邊會啃到標誌）。
#   · 普通 icon —— ⛔ 冇人剪（iOS 就係咁擺），所以大得，**72%**。
SCALE_PLAIN = 0.72
SCALE_MASKABLE = 0.60

JOBS = [
    ("public/icon-192.png", 192, SCALE_PLAIN),
    ("public/icon-512.png", 512, SCALE_PLAIN),
    ("public/icon-maskable-512.png", 512, SCALE_MASKABLE),
]


def mark() -> Image.Image:
    lockup = Image.open(ROOT / "src/assets/brand-lockup.png").convert("RGBA")
    return lockup.crop(MARK_BOX)


def make(size: int, scale: float, art: Image.Image) -> Image.Image:
    out = Image.new("RGBA", (size, size), BG)
    target = round(size * scale)
    art2 = art.resize((target, round(target * art.height / art.width)), Image.LANCZOS)
    out.alpha_composite(art2, ((size - art2.width) // 2, (size - art2.height) // 2))
    return out


def main() -> None:
    art = mark()
    for rel, size, scale in JOBS:
        make(size, scale, art).save(ROOT / rel)
        print(f"寫咗 {rel}  {size}×{size}  標誌佔 {round(scale * 100)}%")


if __name__ == "__main__":
    main()
