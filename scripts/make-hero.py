# README 첫 그림이자 깃허브 링크 미리보기 그림(1280×640)을 원본 「둘이함께-다-렌치.png」에서 만들어 docs/images/hero.png에 쓴다. 원본은 저장소에 넣지 않으므로 경로를 인자로 받는다(설계 「0.3.1에서 정한 것」)
# 쓰는 법: python scripts/make-hero.py <둘이함께-다-렌치.png>
import sys
from pathlib import Path

from PIL import Image

if len(sys.argv) != 2:
    sys.exit("쓰는 법: python scripts/make-hero.py <둘이함께-다-렌치.png>")
source = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "docs" / "images" / "hero.png"

WIDTH, HEIGHT = 1280, 640
# 원본(3:2)을 높이에 맞춰 줄이고 좌우를 원본 가장자리의 하늘색으로 채운다. 깃허브 링크 미리보기는 2:1을 권한다
BACKGROUND = (208, 245, 253)
image = Image.open(source).convert("RGB")
scaled = image.resize((round(image.size[0] * HEIGHT / image.size[1]), HEIGHT), Image.LANCZOS)
canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
canvas.paste(scaled, ((WIDTH - scaled.size[0]) // 2, 0))
canvas.save(out, "PNG", optimize=True)
print(out.name, canvas.size, out.stat().st_size)
