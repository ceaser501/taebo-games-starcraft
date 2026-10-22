// Native check of the engine: loads the packed data and a map, plays a scripted opening,
// and writes screenshots. Not part of the web build.
//
//   ./build-test.sh && ./bw-test ../assets/sc "../assets/sc/maps/ladder/(2)_fighting_spirit.scx" out
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>

extern "C" {
uint8_t* bw_alloc(size_t n);
const uint8_t* bw_out();
const char* bw_text();
int bw_init();
void bw_add_data(const uint8_t* bin, const char* idx);
int bw_map_tileset(const char* map_path);
int bw_start(const char* map_path, uint32_t seed, int n_players, const int* races);
int bw_player_slot(int player);
void bw_set_viewer(int slot);
int bw_frame();
int bw_map_width();
int bw_map_height();
int bw_start_x(int slot);
int bw_start_y(int slot);
int bw_action(int slot, const uint8_t* data, size_t len);
void bw_step();
uint32_t bw_hash();
const uint8_t* bw_render(int w, int h, int x, int y);
const uint8_t* bw_render_minimap();
int bw_map_tile_width();
int bw_map_tile_height();
int bw_select(int x0, int y0, int x1, int y1, int shift, int same_type);
size_t bw_cmd_select();
size_t bw_cmd_right_click(int x, int y, int queue);
size_t bw_cmd_train(int unit_type);
size_t bw_cmd_build(int unit_type, int tx, int ty);
int bw_can_place(int unit_type, int tx, int ty);
const char* bw_selection_json();
const char* bw_player_json(int slot);
}

static std::string read_file(const std::string& path) {
	std::ifstream f(path, std::ios::binary);
	std::stringstream ss;
	ss << f.rdbuf();
	return ss.str();
}

static void save(const std::string& path, const uint8_t* rgba, int w, int h) {
	FILE* f = fopen(path.c_str(), "wb");
	fwrite(&w, 4, 1, f);
	fwrite(&h, 4, 1, f);
	fwrite(rgba, 4, (size_t)w * h, f);
	fclose(f);
}

void dump_icons();
static void act(int slot, size_t n) { if (n) bw_action(slot, bw_out(), n); }

int main(int argc, char** argv) {
	if (argc < 4) { fprintf(stderr, "usage: bw-test <assets/sc> <map> <out prefix>\n"); return 1; }
	std::string dir = argv[1];
	static std::string bin = read_file(dir + "/data/core.bin");
	static std::string idx = read_file(dir + "/data/core.idx");
	bw_add_data((const uint8_t*)bin.data(), idx.c_str());
	bw_init();
	static const char* tilesets[] = {"badlands", "platform", "install", "ashworld", "jungle", "desert", "ice", "twilight"};
	std::string ts = tilesets[bw_map_tileset(argv[2])];
	static std::string tbin = read_file(dir + "/data/" + ts + ".bin");
	static std::string tidx = read_file(dir + "/data/" + ts + ".idx");
	bw_add_data((const uint8_t*)tbin.data(), tidx.c_str());
	int races[2] = {1, 1};
	int n = bw_start(argv[2], 12345, 2, races);
	if (n < 0) { printf("start failed: %s\n", bw_text()); return 1; }
	int me = bw_player_slot(0), them = bw_player_slot(1);
	printf("players %d, slots %d %d, map %dx%d\n", n, me, them, bw_map_width(), bw_map_height());
	bw_set_viewer(me);
	int sx = bw_start_x(me), sy = bw_start_y(me);
	int vw = 640, vh = 400;
	int vx = sx - vw / 2, vy = sy - vh / 2;
	save(std::string(argv[3]) + "-0.rgba", bw_render(vw, vh, vx, vy), vw, vh);
	printf("%s\n", bw_player_json(me));

	// Select the four SCVs around the command center and send them to the nearest minerals by right click.
	bw_select(sx - 160, sy - 120, sx + 160, sy + 120, 0, 0);
	printf("selected %s\n", bw_selection_json());
	act(me, bw_cmd_select());
	// Click the CC itself and train an SCV.
	bw_select(sx, sy, sx, sy, 0, 0);
	act(me, bw_cmd_select());
	printf("cc %s\n", bw_selection_json());
	act(me, bw_cmd_train(7));
	for (int i = 0; i != 24 * 30; ++i) bw_step();
	printf("after 30s: %s hash %08x\n", bw_player_json(me), bw_hash());
	save(std::string(argv[3]) + "-1.rgba", bw_render(vw, vh, vx, vy), vw, vh);
	save(std::string(argv[3]) + "-mini.rgba", bw_render_minimap(), bw_map_tile_width(), bw_map_tile_height());
	dump_icons();
	return 0;
}
extern "C" const uint8_t* bw_icon(int, int);
extern "C" int bw_icon_w();
extern "C" int bw_icon_h();
extern "C" int bw_icon_count();
extern "C" const char* bw_unit_type_json(int);
void dump_icons() {
	{
		// A sheet of the first 64 command icons, to check colours.
		int n = 64, cols = 16;
		bw_icon(0, 0);
		int w = bw_icon_w(), h = bw_icon_h();
		std::vector<uint8_t> sheet((size_t)cols * w * (n / cols) * h * 4, 0);
		for (int i = 0; i != n; ++i) {
			const uint8_t* p = bw_icon(i + 224, 0);
			for (int y = 0; y != h; ++y) memcpy(&sheet[(((i / cols) * h + y) * cols * w + (i % cols) * w) * 4], p + y * w * 4, w * 4);
		}
		save("icons.rgba", sheet.data(), cols * w, (n / cols) * h);
		printf("icons %d (%dx%d), scv %s\n", bw_icon_count(), w, h, bw_unit_type_json(7));
	}
}
