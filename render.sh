#!/bin/sh
# 미리보기 PDF/PNG 생성 (google-chrome 필요)  사용법: ./render.sh 2026-10-04
W=${1:-2026-10-04}; D=$(cd "$(dirname "$0")" && pwd); mkdir -p "$D/preview"
google-chrome --headless=new --no-sandbox --disable-gpu --virtual-time-budget=8000 --no-pdf-header-footer \
  --print-to-pdf="$D/preview/jubo-$W.pdf" "file://$D/index.html?week=$W" 2>/dev/null
pdftoppm -r 90 -png "$D/preview/jubo-$W.pdf" "$D/preview/$W-page"
