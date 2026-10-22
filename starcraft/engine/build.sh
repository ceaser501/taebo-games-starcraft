#!/bin/sh
# Compiles the engine (OpenBW + game.cpp) to WebAssembly: starcraft/js/engine/bw.mjs + bw.wasm.
# Needs Emscripten (https://emscripten.org/docs/getting_started/downloads.html). The output is
# committed, so playing or deploying does not need this; only engine changes do.
set -e
cd "$(dirname "$0")"
mkdir -p ../js/engine
em++ -std=c++14 -O3 -fexceptions -DOPENBW_ENABLE_UI -I openbw \
  game.cpp platform.cpp \
  -o ../js/engine/bw.mjs \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sSTACK_SIZE=4194304 \
  -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,UTF8ToString,stringToUTF8,lengthBytesUTF8 \
  -sEXPORTED_FUNCTIONS=_malloc,_free
ls -l ../js/engine
