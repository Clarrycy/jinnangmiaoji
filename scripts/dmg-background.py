#!/usr/bin/env python3
# DMG 安装页背景：素色浅灰（Finder 按 72dpi 读尺寸，写 144dpi 得到 2x）。图标位置由打包脚本里的 Finder 脚本摆。
import sys
from PIL import Image
out = sys.argv[1]
W, H, S = 600, 380, 2
Image.new('RGB', (W * S, H * S), '#f3f3f3').save(out, dpi=(72 * S, 72 * S))
