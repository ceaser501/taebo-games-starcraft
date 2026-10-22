// What OpenBW's ui.h expects from the platform, without SDL: plain memory surfaces (the game draws
// 8-bit indexed pixels, then converts them through the palette into an RGBA buffer the page shows),
// no native window (the page owns input), and sound handed to the page by sound id.
#include "openbw/ui/native_window.h"
#include "openbw/ui/native_window_drawing.h"
#include "openbw/ui/native_sound.h"

#include <cstdint>
#include <cstring>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace native_window {
struct window_impl {};
window::window() {}
window::~window() {}
window::window(window&&) {}
void window::destroy() {}
bool window::create(const char*, int, int, int, int) { return false; }
void window::get_cursor_pos(int* x, int* y) { *x = -1; *y = -1; }
bool window::peek_message(event_t&) { return false; }
bool window::show_cursor(bool) { return false; }
bool window::get_key_state(int) { return false; }
bool window::get_mouse_button_state(int) { return false; }
void window::update_surface() {}
window::operator bool() const { return false; }
}

namespace native_window_drawing {

struct mem_palette : palette {
	uint32_t rgba[256] = {};
	void set_colors(color colors[256]) override {
		for (int i = 0; i != 256; ++i) {
			// Byte order R, G, B, A in memory: what canvas ImageData wants.
			rgba[i] = (uint32_t)colors[i].r | (uint32_t)colors[i].g << 8 | (uint32_t)colors[i].b << 16 | 0xff000000u;
		}
	}
};
palette* new_palette() { return new mem_palette(); }
void delete_palette(palette* p) { delete p; }

struct mem_surface : surface {
	int bpp;
	std::vector<uint8_t> pixels;
	mem_palette* pal = nullptr;
	mem_surface(int width, int height, int bytes_per_pixel) : bpp(bytes_per_pixel) {
		w = width;
		h = height;
		pitch = width * bpp;
		pixels.resize((size_t)pitch * h);
	}
	void set_palette(palette* p) override { pal = (mem_palette*)p; }
	void* lock() override { return pixels.data(); }
	void unlock() override {}
	// Only the blit the game uses: indexed -> RGBA through the palette.
	void blit(surface* dst_s, int x, int y) override {
		auto* dst = (mem_surface*)dst_s;
		if (bpp != 1 || dst->bpp != 4 || !pal || x != 0 || y != 0) return;
		int n_w = w < dst->w ? w : dst->w;
		int n_h = h < dst->h ? h : dst->h;
		for (int iy = 0; iy != n_h; ++iy) {
			const uint8_t* s = pixels.data() + (size_t)iy * pitch;
			uint32_t* d = (uint32_t*)(dst->pixels.data() + (size_t)iy * dst->pitch);
			for (int ix = 0; ix != n_w; ++ix) d[ix] = pal->rgba[s[ix]];
		}
	}
	void blit_scaled(surface*, int, int, int, int) override {}
	void fill(int r, int g, int b, int a) override {
		if (bpp == 4) {
			uint32_t v = (uint32_t)r | (uint32_t)g << 8 | (uint32_t)b << 16 | (uint32_t)a << 24;
			auto* p = (uint32_t*)pixels.data();
			for (size_t i = 0, n = pixels.size() / 4; i != n; ++i) p[i] = v;
		} else {
			std::memset(pixels.data(), r, pixels.size());
		}
	}
	void set_alpha(int) override {}
	void set_blend_mode(blend_mode) override {}
};

std::unique_ptr<surface> create_rgba_surface(int width, int height) {
	return std::make_unique<mem_surface>(width, height, 4);
}
std::unique_ptr<surface> get_window_surface(native_window::window*) { return nullptr; }
std::unique_ptr<surface> convert_to_8_bit_indexed(surface* s) {
	return std::make_unique<mem_surface>(s->w, s->h, 1);
}
std::unique_ptr<surface> load_image(const char*) { return nullptr; }
std::unique_ptr<surface> load_image(const void*, size_t) { return nullptr; }

}

namespace native_sound {
int frequency = 0;
int channels = 0;
// The page plays sounds itself; ui.h is patched to call bw_play_sound instead of these.
struct no_sound : sound {};
void init() {}
void play(int, sound*, int, int) {}
bool is_playing(int) { return false; }
void stop(int) {}
void set_volume(int, int) {}
std::unique_ptr<sound> load_wav(const void*, size_t) { return std::make_unique<no_sound>(); }
}
