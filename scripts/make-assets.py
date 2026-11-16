# 캐릭터 원본 그림(PNG)을 결과 화면에 넣을 WebP로 줄여 skills/aq/assets에 쓴다. 원본은 저장소에 넣지 않으므로 원본 폴더 두 곳을 인자로 받는다. Pillow(WebP 지원)가 필요하다(설계 13.3)
# 쓰는 법: python scripts/make-assets.py <1차 점수별 장면 폴더> <2차 그림 폴더>
import sys
from pathlib import Path

from PIL import Image

if len(sys.argv) != 3:
    sys.exit("쓰는 법: python scripts/make-assets.py <1차 점수별 장면 폴더> <2차 그림 폴더>")
first, second = Path(sys.argv[1]), Path(sys.argv[2])
out = Path(__file__).resolve().parent.parent / "skills" / "aq" / "assets"

# 장면은 264px 타일에 꽉 채우므로 512px, 얼굴과 스티커는 32~56px 원형이라 128px로 줄인다(설계 13.3)
PLAN = [
    ("scene-1.webp", first / "1-번개베기.png", 512),
    ("scene-2.webp", first / "2-누가이랬어.png", 512),
    ("scene-3.webp", first / "3-팔걷고수리.png", 512),
    ("scene-4.webp", first / "4-합격도장.png", 512),
    ("scene-5.webp", first / "5-명세서졸업식.png", 512),
    ("scene-few-records.webp", second / "5-장면-기록모자람.png", 512),
    ("scene-unreadable.webp", second / "6-장면-기록못읽음.png", 512),
    ("face.webp", second / "1-춘식이-얼굴.png", 128),
    ("sticker-good.webp", second / "2-춘삼이-스티커.png", 128),
    ("sticker-fix.webp", second / "3-춘식이-스티커-고칠것.png", 128),
    ("sticker-done.webp", second / "4-춘식이-스티커-다고침.png", 128),
]

for name, source, size in PLAN:
    image = Image.open(source).convert("RGB")
    if image.size[0] != image.size[1]:
        sys.exit(f"정사각형이 아니다: {source}")
    image.resize((size, size), Image.LANCZOS).save(out / name, "WEBP", quality=82, method=6)
    print(name, size, (out / name).stat().st_size)
