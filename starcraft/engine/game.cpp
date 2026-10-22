// The bridge between OpenBW (the Brood War simulation and its 8-bit renderer) and the web page.
// Built twice: to WebAssembly for the game (build.sh) and natively for tests (test.cpp).
//
// The page owns the clock, input, network and sound. It calls bw_step() once per game frame and
// feeds player commands in the original Brood War action format through bw_action(); both online
// players run the same actions on the same frames, so their games stay identical (lockstep).
// The bw_cmd_* helpers turn clicks into those action bytes for the local player.
#include "openbw/ui/ui.h"

#include <cstdio>
#include <cstring>
#include <unordered_map>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define API extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define API extern "C"
#endif

using namespace bwgame;

namespace bwgame {
namespace ui {
void log_str(a_string str) {
	fwrite(str.data(), str.size(), 1, stdout);
	fflush(stdout);
}
void fatal_error_str(a_string str) {
#ifdef __EMSCRIPTEN__
	EM_ASM({ if (Module.onFatal) Module.onFatal(UTF8ToString($0)); }, str.c_str());
#endif
	fprintf(stderr, "fatal error: %s\n", str.c_str());
	std::terminate();
}
}
}

// Game data comes in packed blobs (one for everything common, one per tileset); the index lines
// ("path offset size") map lowercase paths to slices of a blob.
struct data_pack {
	struct entry { const uint8_t* bin; size_t offset, size; };
	std::unordered_map<std::string, entry> files;

	static std::string key(a_string name) {
		std::string k(name.begin(), name.end());
		for (char& c : k) {
			if (c == '\\') c = '/';
			else if (c >= 'A' && c <= 'Z') c = c - 'A' + 'a';
		}
		return k;
	}
	void add(const uint8_t* bin, const char* idx) {
		const char* p = idx;
		while (*p) {
			const char* end = strchr(p, '\n');
			if (!end) end = p + strlen(p);
			std::string line(p, end);
			p = *end ? end + 1 : end;
			size_t a = line.rfind(' ');
			size_t b = a == std::string::npos ? a : line.rfind(' ', a - 1);
			if (b == std::string::npos) continue;
			files[line.substr(0, b)] = {bin, std::stoul(line.substr(b + 1, a - b - 1)), std::stoul(line.substr(a + 1))};
		}
	}
	bool has(a_string name) const { return files.count(key(std::move(name))) != 0; }
	void load(a_vector<uint8_t>& dst, a_string name) const {
		auto i = files.find(key(name));
		if (i == files.end()) error("data file not found: %s", name);
		dst.resize(i->second.size);
		if (!dst.empty()) memcpy(dst.data(), i->second.bin + i->second.offset, dst.size());
	}
};

struct web_ui : ui_functions {
	int viewer = -1; // the local player's slot; -1 shows everything

	web_ui(game_player player) : ui_functions(std::move(player)) {}

	bool tile_seen(size_t index) const { return viewer < 0 || (~st.tiles[index].explored & (1 << viewer)); }
	bool tile_visible(size_t index) const { return viewer < 0 || (~st.tiles[index].visible & (1 << viewer)); }

	virtual bool sprite_visible_to_viewer(const sprite_t* sprite) const override {
		if (viewer < 0 || sprite->owner == viewer) return true;
		if (sprite->visibility_flags & (1 << viewer)) return true;
		// Minerals, geysers and scenery stay drawn where the player has already been.
		if (sprite->owner == 11) return tile_seen(tile_index(sprite->position));
		return false;
	}

	// Fog: never-seen ground is black, seen-but-not-watched ground is dimmed with the tileset's
	// own darkness table (dark.pcx row 31 leaves colours as they are, lower rows are darker).
	// Each tile gets a brightness and pixels blend between tile centres, so edges are soft.
	int fog_row = 14;
	a_vector<uint8_t> fog_levels;
	virtual void draw_callback(uint8_t* data, size_t data_pitch) override {
		if (viewer < 0) return;
		int tw = game_st.map_tile_width, th = game_st.map_tile_height;
		// Brightness per tile, for the tiles on screen plus a border of one.
		int tx0 = std::max(0, screen_pos.x / 32 - 1), ty0 = std::max(0, screen_pos.y / 32 - 1);
		int tx1 = std::min(tw - 1, (screen_pos.x + (int)screen_width) / 32 + 1);
		int ty1 = std::min(th - 1, (screen_pos.y + (int)screen_height) / 32 + 1);
		int lw = tx1 - tx0 + 1;
		fog_levels.resize((size_t)lw * (ty1 - ty0 + 1));
		bool any = false;
		for (int ty = ty0; ty <= ty1; ++ty) {
			for (int tx = tx0; tx <= tx1; ++tx) {
				size_t index = (size_t)ty * tw + tx;
				int level = tile_visible(index) ? 31 : tile_seen(index) ? fog_row : 0;
				any |= level != 31;
				fog_levels[(ty - ty0) * lw + tx - tx0] = (uint8_t)level;
			}
		}
		if (!any) return;
		auto level_at = [&](int tx, int ty) {
			tx = std::max(tx0, std::min(tx1, tx));
			ty = std::max(ty0, std::min(ty1, ty));
			return (int)fog_levels[(ty - ty0) * lw + tx - tx0];
		};
		const uint8_t* dark = tileset_img.dark_pcx.data.data();
		for (int y = 0; y < (int)screen_height; ++y) {
			int wy = screen_pos.y + y - 16;
			int ty = (wy >> 5), fy = wy & 31;
			uint8_t* p = data + (size_t)y * data_pitch;
			int prev_tx = INT32_MIN, a = 0, b = 0;
			for (int x = 0; x < (int)screen_width; ++x) {
				int wx = screen_pos.x + x - 16;
				int tx = wx >> 5, fx = wx & 31;
				if (tx != prev_tx) {
					// Blend vertically once per tile column, then horizontally per pixel.
					a = level_at(tx, ty) * (32 - fy) + level_at(tx, ty + 1) * fy;
					b = level_at(tx + 1, ty) * (32 - fy) + level_at(tx + 1, ty + 1) * fy;
					prev_tx = tx;
				}
				int level = (a * (32 - fx) + b * fx) >> 10;
				if (level >= 31) continue;
				p[x] = level <= 0 ? 0 : dark[256 * level + p[x]];
			}
		}
	}

	// Sounds go to the page with a volume (0-100) and left/right pan (-100..100).
	bool nuke_launched = false; // for bw_events_json

	virtual void play_sound(int id, xy position, const unit_t* source_unit, bool add_race_index) override {
		// Race-specific sounds (advisor lines) follow the listener's race, as in the original.
		if (add_race_index) id += viewer >= 0 ? std::max(0, std::min(2, (int)st.players[viewer].race)) : 1;
		if (id >= 127 && id <= 129) nuke_launched = true;
		if ((size_t)id >= sound_filenames.size()) return;
		if (viewer >= 0 && source_unit && source_unit->owner != viewer && !(source_unit->sprite->visibility_flags & (1 << viewer))) return;
		const sound_type_t* sound_type = get_sound_type((Sounds)id);
		int volume = sound_type->min_volume;
		int pan = 0;
		if (position != xy()) {
			int distance = 0;
			if (position.x < screen_pos.x) distance += screen_pos.x - position.x;
			else if (position.x > screen_pos.x + (int)screen_width) distance += position.x - (screen_pos.x + (int)screen_width);
			if (position.y < screen_pos.y) distance += screen_pos.y - position.y;
			else if (position.y > screen_pos.y + (int)screen_height) distance += position.y - (screen_pos.y + (int)screen_height);
			int distance_volume = 99 - 99 * distance / 512;
			if (distance_volume > volume) volume = distance_volume;
			pan = std::max(-100, std::min(100, (position.x - (screen_pos.x + (int)screen_width / 2)) * 100 / 640));
		}
		if (volume <= 10) return;
#ifdef __EMSCRIPTEN__
		EM_ASM({ if (Module.onSound) Module.onSound(UTF8ToString($0), $1, $2, $3, $4); },
			sound_filenames[id].c_str(), volume, pan, sound_type->priority, sound_type->flags);
#else
		(void)pan;
#endif
	}
};

static data_pack pack;
static std::unique_ptr<web_ui> g;
static a_vector<uint8_t> out; // the last command's action bytes
static a_string text_out;     // the last JSON answer

static size_t write_out(std::initializer_list<int> bytes) {
	out.assign(bytes.begin(), bytes.end());
	return out.size();
}
static void put16(int v) {
	out.push_back((uint8_t)(v & 0xff));
	out.push_back((uint8_t)((v >> 8) & 0xff));
}

API uint8_t* bw_alloc(size_t n) { return (uint8_t*)malloc(n); }
API const uint8_t* bw_out() { return out.data(); }
API const char* bw_text() { return text_out.c_str(); }

// Adds a data blob (must stay alive) and its index; the common one before bw_init, a tileset's
// before starting a game on it.
API void bw_add_data(const uint8_t* bin, const char* idx) { pack.add(bin, idx); }

// Loads the static data (unit tables, scripts, unit graphics).
API int bw_init() {
	auto load = [](a_vector<uint8_t>& data, a_string name) { pack.load(data, std::move(name)); };
	game_player player(load);
	g = std::make_unique<web_ui>(std::move(player));
	g->create_window = false;
	g->draw_ui_elements = false;
	g->load_data_file = load;
	g->init();
	return 1;
}

// The tileset (0-7) a map file uses, so its graphics can be fetched before bw_start.
API int bw_map_tileset(const char* map_path) try {
	a_vector<uint8_t> chk;
	data_loading::mpq_file<> mpq{a_string(map_path)};
	mpq(chk, "staredit/scenario.chk");
	data_loading::data_reader_le r(chk.data(), chk.data() + chk.size());
	while (r.left() >= 8) {
		auto tag = r.get<std::array<char, 4>>();
		uint32_t len = r.get<uint32_t>();
		if (len > r.left()) break;
		if (!memcmp(tag.data(), "ERA ", 4) && len >= 2) return data_loading::data_reader_le(r.ptr, r.ptr + 2).get<uint16_t>() % 8;
		r.skip(len);
	}
	return 0;
} catch (const std::exception& e) {
	text_out = e.what();
	return -1;
}

// Starts a melee game on a map file (.scm/.scx). `races` has one race per player
// (0 zerg, 1 terran, 2 protoss); players get the map's start slots in an order shuffled by `seed`.
// Returns the number of players placed; bw_player_slot(i) tells where player i went.
static std::array<int, 8> player_slots{};
static int start_game(const char* map_path, uint32_t seed, int n_players, const int* races);
API int bw_start(const char* map_path, uint32_t seed, int n_players, const int* races) {
	try {
		return start_game(map_path, seed, n_players, races);
	} catch (const std::exception& e) {
		text_out = e.what();
		return -1;
	}
}
static int start_game(const char* map_path, uint32_t seed, int n_players, const int* races) {
	g->reset();
	int placed = 0;
	game_load_functions loader(g->st);
	loader.load_map_file(map_path, [&]() {
		auto& setup = loader.setup_info;
		setup.victory_condition = 1; // melee: last one standing, standard triggers
		setup.starting_units = 2;    // workers and a town hall
		setup.resource_type = 1;
		setup.starting_minerals = 50;
		std::vector<int> open;
		for (int i = 0; i != 8; ++i) {
			auto c = g->st.players[i].controller;
			if (c == player_t::controller_open || c == player_t::controller_computer || c == player_t::controller_occupied) open.push_back(i);
			g->st.players[i].controller = player_t::controller_inactive;
		}
		uint32_t r = seed ? seed : 1;
		for (size_t i = open.size(); i > 1; --i) {
			r = r * 22695477 + 1;
			std::swap(open[i - 1], open[(r >> 16) % i]);
		}
		for (int p = 0; p != n_players && p != (int)open.size(); ++p) {
			int slot = open[p];
			player_slots[p] = slot;
			g->st.players[slot].controller = player_t::controller_occupied;
			g->st.players[slot].race = (race_t)races[p];
			g->st.players[slot].force = 0;
			setup.create_melee_units_for_player[slot] = true;
			++placed;
		}
		g->st.lcg_rand_state = seed;
	});
	g->set_image_data();
	g->current_selection.clear();
	return placed;
}

API int bw_player_slot(int player) { return player_slots.at(player); }
API void bw_set_viewer(int slot) { g->viewer = slot; }
API int bw_frame() { return g->st.current_frame; }
API int bw_map_width() { return g->game_st.map_width; }
API int bw_map_height() { return g->game_st.map_height; }
API int bw_start_x(int slot) { return g->game_st.start_locations.at(slot).x; }
API int bw_start_y(int slot) { return g->game_st.start_locations.at(slot).y; }

// Runs one action (Brood War action bytes) for a player slot. Returns whether it applied.
API int bw_action(int slot, const uint8_t* data, size_t len) {
	try {
		data_loading::data_reader_le r(data, data + len);
		return g->read_action(slot, r) ? 1 : 0;
	} catch (const std::exception& e) {
		text_out = e.what();
		return -1;
	}
}

// Makes the drawn selection match what the game has selected for the viewer (after a control
// group recall, which picks units on the game's side).
API int bw_sync_selection() {
	if (g->viewer < 0) return 0;
	g->current_selection_clear();
	for (unit_t* u : g->action_st.selection.at(g->viewer)) g->current_selection_add(u);
	return (int)g->current_selection.size();
}

API void bw_step() { g->state_functions::next_frame(); }

// A hash of the state both players must agree on (same fields OpenBW's own sync check uses).
API uint32_t bw_hash() {
	uint32_t hash = 2166136261u;
	auto add = [&](auto v) { hash ^= (uint32_t)v; hash *= 16777619u; };
	auto& st = g->st;
	add(st.current_frame);
	add(st.lcg_rand_state);
	for (auto v : st.current_minerals) add(v);
	for (auto v : st.current_gas) add(v);
	add(st.active_orders_size);
	add(st.active_bullets_size);
	add(st.active_thingies_size);
	for (unit_t* u : ptr(st.visible_units)) {
		add((u->shield_points + u->hp).raw_value);
		add(u->exact_position.x.raw_value);
		add(u->exact_position.y.raw_value);
	}
	return hash;
}

// Draws the map view (top-left world position x, y) into an RGBA buffer of w x h; returns it.
API const uint8_t* bw_render(int w, int h, int x, int y) {
	if ((int)g->screen_width != w || (int)g->screen_height != h) g->resize(w, h);
	g->screen_pos = {x, y};
	g->update();
	return (const uint8_t*)std::get<2>(g->get_rgba_buffer());
}
API int bw_view_x() { return g->screen_pos.x; }
API int bw_view_y() { return g->screen_pos.y; }

// The minimap: one pixel per tile, terrain colours, fog, and unit squares. RGBA, map tile size.
static a_vector<uint32_t> minimap;
API const uint8_t* bw_render_minimap() {
	auto& gs = g->game_st;
	size_t w = gs.map_tile_width, h = gs.map_tile_height;
	minimap.resize(w * h);
	std::array<uint32_t, 256> colors;
	for (size_t i = 0; i != 256; ++i) {
		auto& wpe = g->tileset_img.wpe;
		colors[i] = (uint32_t)wpe[4 * i] | (uint32_t)wpe[4 * i + 1] << 8 | (uint32_t)wpe[4 * i + 2] << 16 | 0xff000000u;
	}
	for (size_t i = 0; i != w * h; ++i) {
		size_t index = g->st.tiles_mega_tile_index[i];
		auto* images = &g->tileset_img.vx4.at(index).images[0];
		auto* bitmap = &g->tileset_img.vr4.at(*images / 2).bitmap[0];
		auto val = bitmap[55 / sizeof(vr4_entry::bitmap_t)] >> (8 * (55 % sizeof(vr4_entry::bitmap_t)));
		uint8_t c = (uint8_t)val;
		if (!g->tile_seen(i)) minimap[i] = 0xff000000u;
		else if (!g->tile_visible(i)) minimap[i] = colors[g->tileset_img.dark_pcx.data[256 * 10 + c]];
		else minimap[i] = colors[c];
	}
	for (size_t p = 12; p != 0;) {
		--p;
		for (unit_t* u : ptr(g->st.player_units[p])) {
			if (!g->unit_visble_on_minimap(u)) continue;
			if (!g->sprite_visible_to_viewer(u->sprite)) continue;
			int ci = g->img.player_minimap_colors.at(g->st.players[u->owner].color);
			if (g->unit_is_mineral_field(u) || g->unit_is(u, UnitTypes::Resource_Vespene_Geyser)) ci = g->tileset_img.resource_minimap_color;
			uint32_t color = colors[ci];
			int uw = std::max(2, std::min(4, u->unit_type->placement_size.x / 32));
			int uh = std::max(2, std::min(4, u->unit_type->placement_size.y / 32));
			if (!g->ut_building(u)) uw = uh = 2;
			int x0 = (u->sprite->position.x - u->unit_type->placement_size.x / 2) / 32;
			int y0 = (u->sprite->position.y - u->unit_type->placement_size.y / 2) / 32;
			for (int y = std::max(0, y0); y < std::min((int)h, y0 + uh); ++y)
				for (int x = std::max(0, x0); x < std::min((int)w, x0 + uw); ++x) minimap[y * w + x] = color;
		}
	}
	return (const uint8_t*)minimap.data();
}
API int bw_map_tile_width() { return g->game_st.map_tile_width; }
API int bw_map_tile_height() { return g->game_st.map_tile_height; }

// ---- Selection (local, drawn as circles) and the commands it produces ----

static bool own_unit(const unit_t* u) { return u && u->owner == g->viewer; }

// Selects what a click or a drag (world coordinates) picks, like Brood War: a drag takes up to 12
// of your own units (buildings only when nothing else is in the box); a click takes any one unit,
// or with double click / ctrl all your units of that type on screen. Returns the selection size.
API int bw_select(int x0, int y0, int x1, int y1, int shift, int same_type) {
	if (x0 > x1) std::swap(x0, x1);
	if (y0 > y1) std::swap(y0, y1);
	a_vector<unit_t*> picked;
	if (x1 - x0 <= 4 && y1 - y0 <= 4) {
		unit_t* u = g->select_get_unit_at({x0, y0});
		if (u && !g->sprite_visible_to_viewer(u->sprite)) u = nullptr;
		if (u && same_type && own_unit(u)) {
			for (unit_t* u2 : g->find_units({g->screen_pos, g->screen_pos + xy(g->view_width, g->view_height)})) {
				if (u2->owner == u->owner && u2->unit_type == u->unit_type && g->unit_can_be_selected(u2)) picked.push_back(u2);
			}
		} else if (u) {
			if (shift && own_unit(u) && g->current_selection_is_selected(u)) {
				g->current_selection_remove(u);
				goto done;
			}
			picked.push_back(u);
		}
	} else {
		a_vector<unit_t*> mine, buildings;
		for (unit_t* u : g->find_units({{x0, y0}, {x1, y1}})) {
			if (!g->unit_can_be_selected(u) || !own_unit(u)) continue;
			(g->unit_can_be_multi_selected(u) ? mine : buildings).push_back(u);
		}
		picked = mine.empty() && !buildings.empty() ? a_vector<unit_t*>{buildings.front()} : mine;
	}
	if (picked.empty()) {
		if (!shift) goto done;
		return (int)g->current_selection.size();
	}
	{
		bool all_mine = true;
		for (unit_t* u : picked) all_mine &= own_unit(u);
		bool keep = shift && all_mine && picked.size() >= 1 && g->unit_can_be_multi_selected(picked.front());
		if (keep) {
			for (auto uid : g->current_selection) {
				unit_t* u = g->get_unit(uid);
				if (!own_unit(u) || !g->unit_can_be_multi_selected(u)) { keep = false; break; }
			}
		}
		if (!keep) g->current_selection_clear();
		for (unit_t* u : picked) {
			if (g->current_selection.size() >= 12) break;
			g->current_selection_add(u);
		}
	}
done:
	return (int)g->current_selection.size();
}

// The select action matching the current selection, if it is all the local player's units.
API size_t bw_cmd_select() {
	out.clear();
	a_vector<int> ids;
	for (auto uid : g->current_selection) {
		unit_t* u = g->get_unit(uid);
		if (!own_unit(u)) return 0;
		ids.push_back(uid.raw_value);
	}
	if (ids.empty()) return 0;
	out.push_back(9);
	out.push_back((uint8_t)ids.size());
	for (int id : ids) put16(id);
	return out.size();
}

// Right click at a world position: move, attack, gather, repair... whatever the unit does there.
API size_t bw_cmd_right_click(int x, int y, int queue) {
	unit_t* target = g->select_get_unit_at({x, y});
	if (target && !g->sprite_visible_to_viewer(target->sprite)) target = nullptr;
	out.assign({20});
	put16(x);
	put16(y);
	put16(target ? g->get_unit_id(target).raw_value : 0);
	put16(target ? (int)target->unit_type->id : (int)UnitTypes::None);
	out.push_back(queue ? 1 : 0);
	return out.size();
}

// A specific order (attack-move, patrol, move, gather...) at a position or on the unit there.
API size_t bw_cmd_order(int order, int x, int y, int queue) {
	unit_t* target = g->select_get_unit_at({x, y});
	if (target && !g->sprite_visible_to_viewer(target->sprite)) target = nullptr;
	// Orders aimed at the ground ignore the unit under the cursor; a rally point on a unit follows it.
	if (order == (int)Orders::PlaceMine || order == (int)Orders::CastScannerSweep || order == (int)Orders::NukePaint) target = nullptr;
	if (order == (int)Orders::RallyPointTile && target) order = (int)Orders::RallyPointUnit;
	out.assign({21});
	put16(x);
	put16(y);
	put16(target ? g->get_unit_id(target).raw_value : 0);
	put16(target ? (int)target->unit_type->id : (int)UnitTypes::None);
	out.push_back((uint8_t)order);
	out.push_back(queue ? 1 : 0);
	return out.size();
}

API size_t bw_cmd_stop() { return write_out({26, 0}); }
API size_t bw_cmd_hold() { return write_out({43, 0}); }
API size_t bw_cmd_return_cargo() { return write_out({30, 0}); }
API size_t bw_cmd_train(int unit_type) { out.assign({31}); put16(unit_type); return out.size(); }
API size_t bw_cmd_cancel_queue(int slot) { out.assign({32}); put16(slot); return out.size(); }
API size_t bw_cmd_cancel_construction() { return write_out({24}); }
API size_t bw_cmd_build(int unit_type, int tile_x, int tile_y) {
	out.assign({12, (uint8_t)Orders::PlaceBuilding});
	put16(tile_x);
	put16(tile_y);
	put16(unit_type);
	return out.size();
}
API size_t bw_cmd_group(int subaction, int group) { return write_out({19, subaction, group}); }

// Whether the selected worker could put `unit_type` with its top-left on tile (tx, ty).
API int bw_can_place(int unit_type, int tx, int ty) {
	if (g->current_selection.size() != 1) return 0;
	unit_t* u = g->get_unit(g->current_selection.front());
	if (!own_unit(u)) return 0;
	const unit_type_t* ut = g->get_unit_type((UnitTypes)unit_type);
	xy pos(tx * 32 + ut->placement_size.x / 2, ty * 32 + ut->placement_size.y / 2);
	return g->can_place_building(u, u->owner, ut, pos, true, true) ? 1 : 0;
}

// The selected units for the page's status panel and command card, as JSON.
API const char* bw_selection_json() {
	text_out = "[";
	bool first = true;
	for (auto uid : g->current_selection) {
		unit_t* u = g->get_unit(uid);
		if (!u || g->unit_dead(u)) continue;
		if (!first) text_out += ",";
		first = false;
		const unit_type_t* ut = u->unit_type;
		a_string queue = "[";
		for (size_t i = 0; i != u->build_queue.size(); ++i) {
			if (i) queue += ",";
			queue += format("%d", (int)u->build_queue[i]->id);
		}
		queue += "]";
		int progress = -1;
		if (!g->u_completed(u) && ut->build_time) progress = 100 - u->remaining_build_time * 100 / ut->build_time;
		else if (u->current_build_unit && u->current_build_unit->unit_type->build_time) {
			auto* b = u->current_build_unit;
			progress = 100 - b->remaining_build_time * 100 / b->unit_type->build_time;
		}
		int resources = g->unit_is_mineral_field(u) || g->ut_resource(u) ? u->building.resource.resource_count : -1;
		text_out += format("{\"id\":%d,\"type\":%d,\"owner\":%d,\"hp\":%d,\"maxHp\":%d,\"shields\":%d,\"energy\":%d,"
			"\"completed\":%d,\"progress\":%d,\"queue\":%s,\"resources\":%d,\"carrying\":%d,\"order\":%d,\"building\":%d,\"x\":%d,\"y\":%d}",
			uid.raw_value, (int)ut->id, u->owner, u->hp.integer_part(), ut->hitpoints.integer_part(), ut->has_shield ? u->shield_points.integer_part() : -1,
			g->ut_has_energy(u) ? u->energy.integer_part() : -1, g->u_completed(u) ? 1 : 0, progress, queue, resources,
			u->carrying_flags & 2 ? 1 : u->carrying_flags & 1 ? 2 : 0, (int)u->order_type->id, g->ut_building(u) ? 1 : 0, u->sprite->position.x, u->sprite->position.y);
	}
	text_out += "]";
	return text_out.c_str();
}

// Minerals, gas and supply (shown halved, like the game) for a player slot, as JSON.
API const char* bw_player_json(int slot) {
	auto& st = g->st;
	int race = std::max(0, std::min(2, (int)st.players.at(slot).race));
	int alive = 0;
	for (unit_t* u : ptr(st.player_units[slot])) {
		(void)u;
		++alive;
	}
	text_out = format("{\"minerals\":%d,\"gas\":%d,\"supplyUsed\":%d,\"supplyMax\":%d,\"race\":%d,\"units\":%d}",
		st.current_minerals.at(slot), st.current_gas.at(slot), (int)st.supply_used.at(slot)[race].raw_value / 2,
		std::min(200, (int)st.supply_available.at(slot)[race].raw_value / 2), race, alive);
	return text_out.c_str();
}

// Per unit type: cost, supply, build time and the hotkey-relevant flags the command card needs.
API const char* bw_unit_type_json(int id) {
	const unit_type_t* ut = g->get_unit_type((UnitTypes)id);
	text_out = format("{\"id\":%d,\"minerals\":%d,\"gas\":%d,\"supply\":%d,\"time\":%d,\"w\":%d,\"h\":%d,\"hp\":%d,"
		"\"ready\":%d,\"what\":[%d,%d],\"yes\":[%d,%d],\"pissed\":[%d,%d],\"portrait\":%d}",
		id, ut->mineral_cost, ut->gas_cost, (int)ut->supply_required.raw_value / 2, ut->build_time,
		ut->placement_size.x, ut->placement_size.y, ut->hitpoints.integer_part(),
		ut->ready_sound, ut->first_what_sound, ut->last_what_sound, ut->first_yes_sound, ut->last_yes_sound,
		ut->first_pissed_sound, ut->last_pissed_sound, ut->portrait);
	return text_out.c_str();
}

// Sound file (relative to sound/) for an sfxdata id, for unit responses the page plays itself.
API const char* bw_sound_file(int id) {
	text_out = (size_t)id < g->sound_filenames.size() ? g->sound_filenames[id] : a_string();
	return text_out.c_str();
}

// An icon as RGBA, transparent around it. Set 0: command card icons (cmdicons.grp), coloured
// through ticon.pcx table `row` (0 normal, 1 disabled, 2 lit). Set 1: the resource and supply icons
// over the map (game/icons.grp; a stub in Remastered data). Size: bw_icon_w/h.
static std::array<grp_t, 2> icon_grps;
static pcx_image ticon;
static a_vector<uint32_t> icon_rgba;
static int icon_w = 0, icon_h = 0;
static grp_t& icon_grp(int set) {
	static const char* files[] = {"unit/cmdicons/cmdicons.grp", "game/icons.grp"};
	grp_t& grp = icon_grps.at(set);
	if (grp.frames.empty()) {
		a_vector<uint8_t> data;
		pack.load(data, files[set]);
		grp = read_grp(data_loading::data_reader_le(data.data(), data.data() + data.size()));
		if (ticon.data.empty()) {
			pack.load(data, "game/ticon.pcx");
			ticon = load_pcx_data(data);
		}
	}
	return grp;
}
API const uint8_t* bw_icon(int set, int frame_index, int row) {
	grp_t& grp = icon_grp(set);
	icon_w = (int)grp.width;
	icon_h = (int)grp.height;
	a_vector<uint8_t> indexed((size_t)icon_w * icon_h, 0);
	auto& frame = grp.frames.at(frame_index);
	uint8_t* dst = indexed.data() + frame.offset.y * icon_w + frame.offset.x;
	draw_frame<false, false, false>(frame, nullptr, dst, icon_w, 0, 0, frame.size.x, frame.size.y, no_remap());
	icon_rgba.assign(indexed.size(), 0);
	auto& wpe = g->tileset_img.wpe;
	for (size_t i = 0; i != indexed.size(); ++i) {
		int c = indexed[i];
		if (!c) continue;
		// ticon.pcx is one row of six 16-colour tables: 0 normal, 1 disabled, 2 lit...
		if (set == 0 && c < 16 && (size_t)(row * 16 + c) < ticon.data.size()) c = ticon.data[row * 16 + c];
		icon_rgba[i] = (uint32_t)wpe[4 * c] | (uint32_t)wpe[4 * c + 1] << 8 | (uint32_t)wpe[4 * c + 2] << 16 | 0xff000000u;
	}
	return (const uint8_t*)icon_rgba.data();
}
API int bw_icon_w() { return icon_w; }
API int bw_icon_h() { return icon_h; }
API int bw_icon_count(int set) { return (int)icon_grp(set).frames.size(); }

// Owner of the unit under a world position (-1 for none), for the cursor.
API int bw_unit_at(int x, int y) {
	unit_t* u = g->select_get_unit_at({x, y});
	if (!u || !g->sprite_visible_to_viewer(u->sprite)) return -1;
	return u->owner;
}

// ---- Stage 3: everything the Terran command card needs ----

// Whether any selected unit of the viewer could do something, by the game's own rules
// (requirements, resources aside): kind 0 build/train a unit type, 1 research a tech,
// 2 upgrade, 3 use a tech (spells, stim, siege...), 4 receive an order.
API int bw_can(int kind, int id) {
	if (g->viewer < 0) return 0;
	for (auto uid : g->current_selection) {
		unit_t* u = g->get_unit(uid);
		if (!own_unit(u)) continue;
		bool ok = false;
		switch (kind) {
		case 0: ok = g->unit_can_build(u, g->get_unit_type((UnitTypes)id)); break;
		case 1: ok = g->unit_can_research(u, g->get_tech_type((TechTypes)id)); break;
		case 2: ok = g->unit_can_upgrade(u, g->get_upgrade_type((UpgradeTypes)id)); break;
		case 3: ok = g->unit_can_use_tech(u, g->get_tech_type((TechTypes)id)); break;
		case 4: ok = g->unit_can_receive_order(u, g->get_order_type((Orders)id), u->owner); break;
		}
		if (ok) return 1;
	}
	return 0;
}

// Tech state for a player: 0 not researched, 1 researching, 2 researched.
API int bw_tech_state(int slot, int tech) {
	if (g->player_has_researched(slot, (TechTypes)tech)) return 2;
	return g->player_is_researching(slot, (TechTypes)tech) ? 1 : 0;
}
// Upgrade level, plus 100 while the next level is being upgraded; bw_upgrade_max for the cap.
API int bw_upgrade_state(int slot, int upgrade) {
	return g->player_upgrade_level(slot, (UpgradeTypes)upgrade) + (g->player_is_upgrading(slot, (UpgradeTypes)upgrade) ? 100 : 0);
}
API int bw_upgrade_max(int slot, int upgrade) { return g->player_max_upgrade_level(slot, (UpgradeTypes)upgrade); }

// Costs, icon and name (stat_txt string number, 1-based) of a tech or an upgrade's next level.
API const char* bw_tech_json(int id) {
	auto* t = g->get_tech_type((TechTypes)id);
	text_out = format("{\"minerals\":%d,\"gas\":%d,\"time\":%d,\"energy\":%d,\"icon\":%d,\"label\":%d}",
		t->mineral_cost, t->gas_cost, t->research_time, t->energy_cost, t->icon, t->label);
	return text_out.c_str();
}
API const char* bw_upgrade_json(int id, int slot) {
	auto* t = g->get_upgrade_type((UpgradeTypes)id);
	int level = g->player_upgrade_level(slot, (UpgradeTypes)id);
	text_out = format("{\"minerals\":%d,\"gas\":%d,\"time\":%d,\"icon\":%d,\"label\":%d,\"level\":%d,\"max\":%d}",
		t->mineral_cost_base + t->mineral_cost_factor * level, t->gas_cost_base + t->gas_cost_factor * level,
		t->time_cost_base + t->time_cost_factor * level, t->icon, t->label, level, g->player_max_upgrade_level(slot, (UpgradeTypes)id));
	return text_out.c_str();
}

// Command bytes for the rest of the Terran card.
API size_t bw_cmd_research(int tech) { return write_out({48, tech}); }
API size_t bw_cmd_upgrade(int upgrade) { return write_out({50, upgrade}); }
API size_t bw_cmd_cancel_research() { return write_out({49}); }
API size_t bw_cmd_cancel_upgrade() { return write_out({51}); }
API size_t bw_cmd_cancel_addon() { return write_out({52}); }
API size_t bw_cmd_cancel_nuke() { return write_out({46}); }
API size_t bw_cmd_stim() { return write_out({54}); }
API size_t bw_cmd_cloak() { return write_out({33, 0}); }
API size_t bw_cmd_decloak() { return write_out({34, 0}); }
API size_t bw_cmd_siege() { return write_out({38, 0}); }
API size_t bw_cmd_unsiege() { return write_out({37, 0}); }
API size_t bw_cmd_unload_all() { return write_out({40, 0}); }
API size_t bw_cmd_unload(int uid) { out.assign({41}); put16(uid); return out.size(); }
// Lifting off: the building rises where it stands.
API size_t bw_cmd_liftoff() {
	if (g->current_selection.empty()) return 0;
	unit_t* u = g->get_unit(g->current_selection.front());
	if (!own_unit(u)) return 0;
	out.assign({47});
	put16(u->sprite->position.x);
	put16(u->sprite->position.y);
	return out.size();
}
// Landing the selected flying building with its top-left on tile (tx, ty).
API size_t bw_cmd_land(int tx, int ty) {
	if (g->current_selection.empty()) return 0;
	unit_t* u = g->get_unit(g->current_selection.front());
	if (!own_unit(u)) return 0;
	out.assign({12, (uint8_t)Orders::BuildingLand});
	put16(tx);
	put16(ty);
	put16((int)u->unit_type->id);
	return out.size();
}
// An add-on goes next to the selected building, where the game expects it.
API size_t bw_cmd_addon(int addon_type) {
	if (g->current_selection.empty()) return 0;
	unit_t* u = g->get_unit(g->current_selection.front());
	if (!own_unit(u)) return 0;
	const unit_type_t* addon = g->get_unit_type((UnitTypes)addon_type);
	xy builder_pos = u->sprite->position;
	int tx = (builder_pos.x - u->unit_type->placement_size.x / 2 + addon->addon_position.x / 32 * 32) / 32;
	int ty = (builder_pos.y - u->unit_type->placement_size.y / 2 + addon->addon_position.y / 32 * 32) / 32;
	out.assign({12, (uint8_t)Orders::PlaceAddon});
	put16(tx);
	put16(ty);
	put16(addon_type);
	return out.size();
}

// Whether the selected flying building could land with its top-left on tile (tx, ty).
API int bw_can_land(int tx, int ty) {
	if (g->current_selection.size() != 1) return 0;
	unit_t* u = g->get_unit(g->current_selection.front());
	if (!own_unit(u)) return 0;
	xy pos(tx * 32 + u->unit_type->placement_size.x / 2, ty * 32 + u->unit_type->placement_size.y / 2);
	return g->can_place_building(u, u->owner, u->unit_type, pos, true, true) ? 1 : 0;
}

// More about the selected units for the status panel, as JSON per unit (same order as
// bw_selection_json): research/upgrade in progress, add-on, flying, cloaked, passengers, kills.
API const char* bw_selection_extra_json() {
	text_out = "[";
	bool first = true;
	for (auto uid : g->current_selection) {
		unit_t* u = g->get_unit(uid);
		if (!u || g->unit_dead(u)) continue;
		if (!first) text_out += ",";
		first = false;
		int research = -1, upgrade = -1, work = -1, addon = -1, addon_progress = -1, nuke = 0;
		bool building = g->ut_building(u);
		if (building) {
			if (u->building.researching_type) {
				research = (int)u->building.researching_type->id;
				work = 100 - u->building.upgrade_research_time * 100 / std::max(1, u->building.researching_type->research_time);
			}
			if (u->building.upgrading_type) {
				auto* t = u->building.upgrading_type;
				upgrade = (int)t->id;
				int total = t->time_cost_base + t->time_cost_factor * (u->building.upgrading_level - 1);
				work = 100 - u->building.upgrade_research_time * 100 / std::max(1, total);
			}
			if (u->building.addon) addon = (int)u->building.addon->unit_type->id;
			if (g->unit_is_building_addon(u) && u->current_build_unit) {
				addon = (int)u->current_build_unit->unit_type->id;
				addon_progress = 100 - u->current_build_unit->remaining_build_time * 100 / std::max(1, u->current_build_unit->unit_type->build_time);
			}
			if (g->unit_is(u, UnitTypes::Terran_Nuclear_Silo) && u->building.silo.nuke) nuke = g->u_completed(u->building.silo.nuke) ? 2 : 1;
		}
		a_string loaded = "[";
		bool lf = true;
		for (auto lid : u->loaded_units) {
			unit_t* p = g->get_unit(lid);
			if (!p) continue;
			if (!lf) loaded += ",";
			lf = false;
			loaded += format("[%d,%d,%d,%d]", lid.raw_value, (int)p->unit_type->id, p->hp.integer_part(), p->unit_type->hitpoints.integer_part());
		}
		loaded += "]";
		int max_energy = g->unit_max_energy(u).integer_part();
		// Armor and weapons with their upgrade levels, shown as icons in the status panel.
		a_string gear = "[";
		if (!building || g->unit_is(u, UnitTypes::Terran_Missile_Turret) || g->unit_is(u, UnitTypes::Terran_Bunker)) {
			const upgrade_type_t* armor_up = u->unit_type->armor_upgrade;
			gear += format("[%d,%d,%d]", armor_up ? armor_up->icon : 292, u->unit_type->armor, armor_up ? g->player_upgrade_level(u->owner, armor_up->id) : 0);
			const weapon_type_t* seen = nullptr;
			for (auto* w : {g->unit_or_subunit_ground_weapon(u), g->unit_or_subunit_air_weapon(u)}) {
				if (!w || w == seen) continue;
				seen = w;
				const upgrade_type_t* up = w->damage_upgrade;
				gear += format(",[%d,%d,%d]", w->icon, w->damage_amount, up ? g->player_upgrade_level(u->owner, up->id) : 0);
			}
		}
		gear += "]";
		text_out += format("{\"research\":%d,\"upgrade\":%d,\"work\":%d,\"addon\":%d,\"addonProgress\":%d,\"flying\":%d,\"cloaked\":%d,"
			"\"nuke\":%d,\"loaded\":%s,\"kills\":%d,\"maxEnergy\":%d,\"sieged\":%d,\"gear\":%s}",
			research, upgrade, work, addon, addon_progress, building && g->u_flying(u) ? 1 : 0, g->u_cloaked(u) || g->u_requires_detector(u) ? 1 : 0,
			nuke, loaded, u->kill_count, max_energy, g->unit_is(u, UnitTypes::Terran_Siege_Tank_Siege_Mode) ? 1 : 0, gear);
	}
	text_out += "]";
	return text_out.c_str();
}

// Solo testing only: allows the original cheat actions (18: 0x10 money, 0x2 fast building).
API void bw_enable_cheats(int on) { g->st.cheats_enabled = on != 0; }

// Units of a type (-1: any) owned by a slot (-1: any) that the viewer can see, as [[id, type, x, y], ...].
// Used by the page's tests and for jumping to things.
API const char* bw_units_json(int owner, int type) {
	text_out = "[";
	bool first = true;
	for (size_t p = 0; p != 12; ++p) {
		if (owner >= 0 && (int)p != owner) continue;
		for (unit_t* u : ptr(g->st.player_units[p])) {
			if (type >= 0 && (int)u->unit_type->id != type) continue;
			if (!g->sprite_visible_to_viewer(u->sprite)) continue;
			if (!first) text_out += ",";
			first = false;
			text_out += format("[%d,%d,%d,%d]", g->get_unit_id(u).raw_value, (int)u->unit_type->id, u->sprite->position.x, u->sprite->position.y);
		}
	}
	text_out += "]";
	return text_out.c_str();
}

// ---- Events the original announces to the local player (voices, messages, minimap blinks) ----
// Found by comparing the viewer's units, techs and upgrades with the last check. Only the page
// reacts to them; the game itself is unchanged, so this does not affect lockstep.
struct seen_unit { int life; bool completed; bool addon_done; bool nuke_ready; int type; };
static std::unordered_map<uint32_t, seen_unit> seen_units;
static std::array<bool, 64> seen_tech{};
static std::array<int, 64> seen_upgrades{};
static int events_frame = -1;

API const char* bw_events_json() {
	text_out = "[";
	bool first = true;
	auto add = [&](const char* kind, const unit_t* u) {
		if (!first) text_out += ",";
		first = false;
		text_out += format("{\"kind\":\"%s\",\"type\":%d,\"x\":%d,\"y\":%d,\"building\":%d}", kind, u ? (int)u->unit_type->id : -1,
			u ? u->sprite->position.x : 0, u ? u->sprite->position.y : 0, u && g->ut_building(u) ? 1 : 0);
	};
	int me = g->viewer;
	bool fresh = events_frame < 0 || g->st.current_frame < events_frame;
	events_frame = g->st.current_frame;
	if (me < 0) { text_out += "]"; return text_out.c_str(); }
	if (fresh) { seen_units.clear(); }
	std::unordered_map<uint32_t, seen_unit> now;
	for (unit_t* u : ptr(g->st.player_units[me])) {
		uint32_t id = g->get_unit_id(u).raw_value;
		seen_unit s{(u->hp + u->shield_points).raw_value, g->u_completed(u), false, false, (int)u->unit_type->id};
		if (g->ut_building(u) && u->building.addon && g->u_completed(u->building.addon)) s.addon_done = true;
		if (g->unit_is(u, UnitTypes::Terran_Nuclear_Silo) && u->building.silo.nuke && g->u_completed(u->building.silo.nuke)) s.nuke_ready = true;
		now[id] = s;
		auto i = seen_units.find(id);
		if (fresh) continue;
		if (i == seen_units.end()) {
			// A new unit: trained units arrive complete; buildings start incomplete.
			if (s.completed && !g->ut_building(u)) add("ready", u);
			continue;
		}
		const seen_unit& o = i->second;
		if (s.type != o.type) continue; // morphed (siege mode and the like)
		if (s.completed && !o.completed) add(g->ut_addon(u) ? "addon" : g->ut_building(u) ? "built" : "ready", u);
		if (s.nuke_ready && !o.nuke_ready) add("nukeready", u);
		if (s.life < o.life && s.completed) add("attacked", u);
	}
	for (size_t t = 0; t != seen_tech.size() && t < (size_t)TechTypes::None; ++t) {
		bool done = g->player_has_researched(me, (TechTypes)t);
		if (!fresh && done && !seen_tech[t] && g->player_tech_available(me, (TechTypes)t) && g->get_tech_type((TechTypes)t)->mineral_cost) add("research", nullptr);
		seen_tech[t] = done;
	}
	for (size_t t = 0; t != seen_upgrades.size() && t < (size_t)UpgradeTypes::None; ++t) {
		int level = g->player_upgrade_level(me, (UpgradeTypes)t);
		if (!fresh && level > seen_upgrades[t]) add("upgrade", nullptr);
		seen_upgrades[t] = level;
	}
	seen_units.swap(now);
	if (g->nuke_launched) { g->nuke_launched = false; add("nuke", nullptr); }
	text_out += "]";
	return text_out.c_str();
}
