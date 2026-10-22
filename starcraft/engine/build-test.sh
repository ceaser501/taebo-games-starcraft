#!/bin/sh
# Native build of the engine plus test.cpp, for checking it without a browser.
set -e
cd "$(dirname "$0")"
g++ -std=c++14 -O2 -DOPENBW_ENABLE_UI -I openbw -o bw-test game.cpp platform.cpp test.cpp -lz
