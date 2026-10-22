// The command card: which 3x3 buttons a selection shows, where, and with which icon. Button texts
// and hotkeys come from the original string table (stat_txt.tbl: hotkey, button kind, then the
// text with the hotkey letter in yellow); buttons the table has no text for use the same markup.
// Whether a button is lit comes from the engine's own rules (requirements, tech, add-ons).
// Icon numbers are cmdicons.grp frames: unit icons share the unit id; commands start at 228.
import { UnitTypes as U, TechTypes as T, UpgradeTypes as G, Orders as O } from './bw-ids.js';

export const UNIT = { marine: U.Terran_Marine, scv: U.Terran_SCV, commandCenter: U.Terran_Command_Center, supplyDepot: U.Terran_Supply_Depot, barracks: U.Terran_Barracks };
const ICON = { move: 228, stop: 229, attack: 230, gather: 231, repair: 232, returnCargo: 233, build: 234, buildAdvanced: 235, cancel: 236, rally: 286, land: 259, liftoff: 260, unloadAll: 283, patrol: 254, hold: 255 };

// What the original says when an order is refused: the message (stat_txt.tbl string number)
// and the advisor's voice.
export const MESSAGES = {
  minerals: { str: 849, voice: 'terran/advisor/taderr00.wav' },
  gas: { str: 850, voice: 'terran/advisor/taderr01.wav' },
  supply: { str: 844, voice: 'terran/advisor/taderr02.wav' },
  energy: { str: 863, voice: 'terran/advisor/taderr06.wav' },
  location: { str: 855, voice: 'terran/scv/tscerr00.wav' },
  landing: { str: 862, voice: 'terran/advisor/taderr04.wav' },
  queue: { text: 'Queue is full.' },
  nuke: { str: 1046 },
};

// Button texts the table lacks, in its markup (\x03 yellow hotkey, \x01 back to normal).
const TEXT = {
  move: 'm\x01\x03M\x01ove', stop: 's\x01\x03S\x01top', attack: 'a\x01\x03A\x01ttack', patrol: 'p\x01\x03P\x01atrol',
  hold: 'h\x01\x03H\x01old Position', repair: 'r\x01\x03R\x01epair', gather: 'g\x01\x03G\x01ather', returnCargo: 'c\x01Return \x03C\x01argo',
  build: 'b\x01\x03B\x01uild Structure', advanced: 'v\x01Build Ad\x03v\x01anced Structure', cancel: '\x1b\x01\x03Esc\x01: Cancel',
  rally: 'r\x01Set \x03R\x01ally Point', liftoff: 'l\x01\x03L\x01ift Off', land: 'l\x01\x03L\x01and', unload: 'u\x01\x03U\x01nload All',
  decloak: 'd\x01\x03D\x01ecloak', tankMode: 'o\x01Tank M\x03o\x01de', nuke: 'n\x03\x03N\x01uclear Strike',
  cancelLast: '\x1b\x01\x03Esc\x01: Cancel Last', cancelResearch: '\x1b\x01\x03Esc\x01: Cancel Research',
  cancelUpgrade: '\x1b\x01\x03Esc\x01: Cancel Upgrade', cancelAddon: '\x1b\x01\x03Esc\x01: Cancel Add-On',
  cancelConstruction: '\x1b\x01\x03Esc\x01: Cancel Construction',
};

// Spells and abilities aimed at a unit or a spot: tech, order, button text (string number or TEXT key).
const SPELL = {
  lockdown: [T.Lockdown, O.CastLockdown, 334],
  emp: [T.EMP_Shockwave, O.CastEMPShockwave, 340],
  mines: [T.Spider_Mines, O.PlaceMine, 335],
  scan: [T.Scanner_Sweep, O.CastScannerSweep, 336],
  matrix: [T.Defensive_Matrix, O.CastDefensiveMatrix, 339],
  irradiate: [T.Irradiate, O.CastIrradiate, 341],
  yamato: [T.Yamato_Gun, O.FireYamatoGun, 342],
  restoration: [T.Restoration, O.CastRestoration, 1247],
  flare: [T.Optical_Flare, O.CastOpticalFlare, 1248],
  // Medics heal in the attack slot: AttackDefault becomes heal-move for them.
  heal: [T.Healing, O.AttackDefault, 1246],
  nuke: [T.Nuclear_Strike, O.NukePaint, 'nuke'],
};

// Lifting buildings, and per building what it trains, researches, upgrades and adds: [id, position, text].
const LIFTS = new Set([U.Terran_Command_Center, U.Terran_Barracks, U.Terran_Factory, U.Terran_Starport, U.Terran_Science_Facility, U.Terran_Engineering_Bay]);
const BUILDINGS = {
  [U.Terran_Command_Center]: { train: [[U.Terran_SCV, 0, 591]], addons: [[U.Terran_Comsat_Station, 6, 657], [U.Terran_Nuclear_Silo, 7, 658]], rally: true },
  [U.Terran_Barracks]: { train: [[U.Terran_Marine, 0, 585], [U.Terran_Firebat, 1, 587], [U.Terran_Ghost, 2, 586], [U.Terran_Medic, 3, 1289]], rally: true },
  [U.Terran_Factory]: { train: [[U.Terran_Vulture, 0, 588], [U.Terran_Siege_Tank_Tank_Mode, 1, 590], [U.Terran_Goliath, 2, 589]], addons: [[U.Terran_Machine_Shop, 6, 662]], rally: true },
  [U.Terran_Starport]: { train: [[U.Terran_Wraith, 0, 592], [U.Terran_Dropship, 1, 594], [U.Terran_Science_Vessel, 2, 593], [U.Terran_Battlecruiser, 3, 595], [U.Terran_Valkyrie, 4, 1290]], addons: [[U.Terran_Control_Tower, 6, 659]], rally: true },
  [U.Terran_Science_Facility]: { research: [[T.EMP_Shockwave, 0, 325], [T.Irradiate, 1, 329]], upgrade: [[G.Titan_Reactor, 3, 474]], addons: [[U.Terran_Covert_Ops, 6, 660], [U.Terran_Physics_Lab, 7, 661]] },
  [U.Terran_Engineering_Bay]: { upgrade: [[G.Terran_Infantry_Weapons, 0, 462], [G.Terran_Infantry_Armor, 1, 455]] },
  [U.Terran_Academy]: { research: [[T.Stim_Packs, 1, 323], [T.Restoration, 2, 1244], [T.Optical_Flare, 3, 1245]], upgrade: [[G.U_238_Shells, 0, 471], [G.Caduceus_Reactor, 4, 1280]] },
  [U.Terran_Armory]: { upgrade: [[G.Terran_Vehicle_Weapons, 0, 463], [G.Terran_Ship_Weapons, 1, 464], [G.Terran_Vehicle_Plating, 3, 456], [G.Terran_Ship_Plating, 4, 457]] },
  [U.Terran_Machine_Shop]: { research: [[T.Spider_Mines, 1, 326], [T.Tank_Siege_Mode, 2, 327]], upgrade: [[G.Ion_Thrusters, 0, 472], [G.Charon_Boosters, 3, 1281]] },
  [U.Terran_Control_Tower]: { research: [[T.Cloaking_Field, 0, 331]], upgrade: [[G.Apollo_Reactor, 1, 477]] },
  [U.Terran_Covert_Ops]: { research: [[T.Lockdown, 0, 324], [T.Personnel_Cloaking, 1, 332]], upgrade: [[G.Ocular_Implants, 3, 475], [G.Moebius_Reactor, 4, 476]] },
  [U.Terran_Physics_Lab]: { research: [[T.Yamato_Gun, 0, 330]], upgrade: [[G.Colossus_Reactor, 1, 478]] },
  [U.Terran_Comsat_Station]: { spells: [['scan', 0]] },
  [U.Terran_Nuclear_Silo]: { train: [[U.Terran_Nuclear_Missile, 0, 596]] },
  [U.Terran_Missile_Turret]: { basicAttack: true },
  [U.Terran_Bunker]: { unload: true },
};
// Units: their abilities beyond move/stop/attack/patrol/hold, by card position.
const UNITS = {
  [U.Terran_Marine]: { stim: 6 },
  [U.Terran_Firebat]: { stim: 6 },
  [U.Terran_Medic]: { noAttack: true, spells: [['heal', 2], ['restoration', 6], ['flare', 7]] },
  [U.Terran_Ghost]: { cloak: [T.Personnel_Cloaking, 6], spells: [['lockdown', 7], ['nuke', 8]] },
  [U.Terran_Vulture]: { spells: [['mines', 6]] },
  [U.Terran_Siege_Tank_Tank_Mode]: { siege: 6 },
  [U.Terran_Siege_Tank_Siege_Mode]: { siege: 6, noMove: true },
  [U.Terran_Wraith]: { cloak: [T.Cloaking_Field, 6] },
  [U.Terran_Dropship]: { noAttack: true, unload: true },
  [U.Terran_Science_Vessel]: { noAttack: true, spells: [['matrix', 6], ['emp', 7], ['irradiate', 8]] },
  [U.Terran_Battlecruiser]: { spells: [['yamato', 6]] },
};
const SCV_BASIC = [[U.Terran_Command_Center, 0, 645], [U.Terran_Supply_Depot, 1, 646], [U.Terran_Refinery, 2, 647], [U.Terran_Barracks, 3, 648], [U.Terran_Engineering_Bay, 4, 649], [U.Terran_Missile_Turret, 5, 650], [U.Terran_Academy, 6, 651], [U.Terran_Bunker, 7, 652]];
const SCV_ADVANCED = [[U.Terran_Factory, 0, 653], [U.Terran_Starport, 1, 654], [U.Terran_Science_Facility, 2, 655], [U.Terran_Armory, 3, 656]];

// What the player's selected units can do. `menu` is 'build' / 'advanced' while an SCV build list is open.
export function commandCard(units, menu, game) {
  const { engine } = game;
  const strings = game.ui.meta.strings;
  // Text and hotkey of a button from a string number or a TEXT key.
  const label = (src) => {
    const raw = typeof src === 'number' ? strings[src] : TEXT[src];
    const key = raw.charCodeAt(0) === 0x1b ? 'Esc' : raw[0].toUpperCase();
    return { key, tip: raw.slice(2) };
  };
  const one = units.length === 1 ? units[0] : null;
  const types = new Set(units.map((u) => u.type));
  const me = game.me;
  const unitCost = (type) => { const t = engine.unitType(type); return { minerals: t.minerals, gas: t.gas, supply: t.supply }; };
  const button = (id, pos, icon, text, run, extra = {}) => ({ id, pos, icon, ...label(text), run, ...extra });

  const order = (id, pos, icon, text, ord) => button(id, pos, icon, text, () => game.target('order', { order: ord, button: id }), { enabled: engine.can('order', ord) });
  const now = (id, pos, icon, text, cmd, voice = true) => button(id, pos, icon, text, () => { game.send(cmd()); if (voice) game.acknowledge(); });
  const cancel = (text, cmd) => now('cancel', 8, ICON.cancel, text, cmd, false);
  const basic = (opts = {}) => [
    ...(opts.noMove ? [] : [order('move', 0, ICON.move, 'move', O.Move)]),
    now('stop', 1, ICON.stop, 'stop', () => engine.cmd.stop()),
    ...(opts.noAttack ? [] : [order('attack', 2, ICON.attack, 'attack', O.AttackDefault)]),
    ...(opts.noMove ? [] : [order('patrol', 3, ICON.patrol, 'patrol', O.Patrol)]),
    now('hold', 4, ICON.hold, 'hold', () => engine.cmd.hold()),
  ];
  const spell = (name, pos) => {
    const [tech, ord, text] = SPELL[name];
    if (engine.techState(me, tech) !== 2 && !engine.can('tech', tech)) return null;
    const info = engine.tech(tech);
    return button(name, pos, info.icon, text, () => {
      if (info.energy && !units.some((u) => u.energy >= info.energy)) { game.notice('energy'); return; }
      game.target('order', { order: ord, button: name });
    }, { cost: info.energy ? { energy: info.energy } : null, enabled: engine.can('tech', tech) });
  };
  const pay = (cost, send) => () => { const why = game.needResources(cost); if (why) game.notice(why); else send(); };
  const train = ([type, pos, text]) => button(`train-${type}`, pos, type, text, pay(unitCost(type), () => game.send(engine.cmd.train(type))),
    { cost: unitCost(type), enabled: engine.can('build', type) });
  const research = ([tech, pos, text]) => {
    if (engine.techState(me, tech) !== 0) return null;
    const t = engine.tech(tech);
    return button(`research-${tech}`, pos, t.icon, text, pay(t, () => game.send(engine.cmd.research(tech))),
      { cost: { minerals: t.minerals, gas: t.gas }, enabled: engine.can('research', tech) });
  };
  const upgrade = ([upg, pos, text]) => {
    const st = engine.upgradeState(me, upg);
    if (st.upgrading || st.level >= st.max) return null;
    const t = engine.upgrade(upg, me);
    const b = button(`upgrade-${upg}`, pos, t.icon, text, pay(t, () => game.send(engine.cmd.upgrade(upg))),
      { cost: { minerals: t.minerals, gas: t.gas }, enabled: engine.can('upgrade', upg) });
    if (st.max > 1) b.tip += `\n\x01${strings[794]} ${st.level + 1}`; // "Next Level:"
    return b;
  };

  // ---- one building ----
  if (one && one.building) {
    if (!one.completed) return [cancel('cancelConstruction', () => engine.cmd.cancelConstruction())];
    if (one.flying) {
      return [
        order('move', 0, ICON.move, 'move', O.Move),
        now('stop', 1, ICON.stop, 'stop', () => engine.cmd.stop(), false),
        button('land', 8, ICON.land, 'land', () => game.target('land', { type: one.type, button: 'land' })),
      ];
    }
    const def = BUILDINGS[one.type] || {};
    // Busy buildings show only how to stop what they do.
    if (one.research >= 0) return [cancel('cancelResearch', () => engine.cmd.cancelResearch())];
    if (one.upgrade >= 0) return [cancel('cancelUpgrade', () => engine.cmd.cancelUpgrade())];
    if (one.addonProgress >= 0) return [cancel('cancelAddon', () => engine.cmd.cancelAddon())];
    const list = [];
    for (const t of def.train || []) list.push(train(t));
    for (const r of def.research || []) list.push(research(r));
    for (const u of def.upgrade || []) list.push(upgrade(u));
    for (const [name, pos] of def.spells || []) list.push(spell(name, pos));
    if (def.basicAttack) list.push(now('stop', 1, ICON.stop, 'stop', () => engine.cmd.stop(), false), order('attack', 2, ICON.attack, 'attack', O.AttackDefault));
    if (def.unload) list.push(now('unload', 8, ICON.unloadAll, 'unload', () => engine.cmd.unloadAll()));
    if (one.addon < 0) {
      for (const [type, pos, text] of def.addons || []) {
        list.push(button(`addon-${type}`, pos, type, text, pay(unitCost(type), () => { game.send(engine.cmd.addon(type)); game.acknowledge(); }),
          { cost: unitCost(type), enabled: engine.can('build', type) }));
      }
    }
    if (def.rally) list.push(order('rally', 5, ICON.rally, 'rally', O.RallyPointTile));
    if (one.queue.length) list.push(cancel('cancelLast', () => engine.cmd.cancelQueue(254)));
    else if (LIFTS.has(one.type)) list.push(now('liftoff', 8, ICON.liftoff, 'liftoff', () => engine.cmd.liftoff(), false));
    return list.filter(Boolean);
  }

  // ---- SCVs ----
  if (types.size === 1 && types.has(U.Terran_SCV)) {
    if (one && (menu === 'build' || menu === 'advanced')) {
      const list = (menu === 'build' ? SCV_BASIC : SCV_ADVANCED).map(([type, pos, text]) => button(`build-${type}`, pos, type, text,
        pay(unitCost(type), () => game.target('build', { type, button: `build-${type}` })), { cost: unitCost(type), enabled: engine.can('build', type) }));
      return [...list, button('cancel', 8, ICON.cancel, 'cancel', () => { game.menu = null; game.mode = null; })];
    }
    return [
      ...basic().filter((b) => b.pos < 3),
      order('repair', 3, ICON.repair, 'repair', O.Repair),
      order('gather', 4, ICON.gather, 'gather', O.Harvest1),
      { ...now('return', 5, ICON.returnCargo, 'returnCargo', () => engine.cmd.returnCargo()), enabled: units.some((u) => u.carrying > 0) },
      ...(one ? [
        button('build', 6, ICON.build, 'build', () => { game.menu = 'build'; }),
        button('advanced', 7, ICON.buildAdvanced, 'advanced', () => { game.menu = 'advanced'; }),
      ] : []),
    ];
  }

  // ---- other units: shared orders, plus abilities when the whole selection is one type ----
  if (units.some((u) => u.building)) return [];
  const def = types.size === 1 ? UNITS[units[0].type] || {} : {};
  const list = basic({ noAttack: def.noAttack, noMove: def.noMove });
  if (def.stim != null && engine.techState(me, T.Stim_Packs) === 2) {
    list.push({ ...now('stim', def.stim, engine.tech(T.Stim_Packs).icon, 333, () => engine.cmd.stim(), false), enabled: units.some((u) => u.hp > 10) });
  }
  if (def.siege != null && engine.techState(me, T.Tank_Siege_Mode) === 2) {
    const sieged = units[0].type === U.Terran_Siege_Tank_Siege_Mode;
    const icon = engine.tech(T.Tank_Siege_Mode).icon;
    list.push(now('siege', def.siege, sieged ? icon + 1 : icon, sieged ? 'tankMode' : 337, () => (sieged ? engine.cmd.unsiege() : engine.cmd.siege()), false));
  }
  if (def.cloak && engine.techState(me, def.cloak[0]) === 2) {
    const cloaked = units.every((u) => u.cloaked);
    const icon = engine.tech(def.cloak[0]).icon;
    list.push(now(cloaked ? 'decloak' : 'cloak', def.cloak[1], cloaked ? icon + 1 : icon, cloaked ? 'decloak' : 343, () => (cloaked ? engine.cmd.decloak() : engine.cmd.cloak()), false));
  }
  for (const [name, pos] of def.spells || []) list.push(spell(name, pos));
  if (def.unload && units.some((u) => u.loaded?.length)) list.push(now('unload', 8, ICON.unloadAll, 'unload', () => engine.cmd.unloadAll()));
  return list.filter(Boolean);
}
