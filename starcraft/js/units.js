// The command card: which 3x3 buttons a selection shows, with the original hotkeys and icons.
// Whether a button is lit comes from the engine's own rules (requirements, tech, add-ons), so it
// behaves like the original; this file only says what goes where.
// Icon numbers are cmdicons.grp frames: unit icons share the unit id; commands start at 228.
import { UnitTypes as U, TechTypes as T, UpgradeTypes as G, Orders as O } from './bw-ids.js';

export const UNIT = { marine: U.Terran_Marine, scv: U.Terran_SCV, commandCenter: U.Terran_Command_Center, supplyDepot: U.Terran_Supply_Depot, barracks: U.Terran_Barracks };
const ICON = { move: 228, stop: 229, attack: 230, gather: 231, repair: 232, returnCargo: 233, build: 234, buildAdvanced: 235, cancel: 236, rally: 286, land: 259, liftoff: 260, unloadAll: 283, patrol: 254, hold: 255 };

// Messages the original shows for refused orders.
export const MESSAGES = {
  minerals: 'Not enough minerals...mine more minerals.',
  gas: 'Not enough Vespene gas...harvest more gas.',
  supply: 'Additional supply depots required.',
  energy: 'Not enough energy.',
  location: 'Invalid location.',
  queue: 'Queue is full.',
  landing: 'Unable to land there.',
};

// Spells and abilities aimed at a unit or a spot: tech, order, hotkey, button text.
const SPELL = {
  lockdown: [T.Lockdown, O.CastLockdown, 'L', 'Lockdown'],
  emp: [T.EMP_Shockwave, O.CastEMPShockwave, 'E', 'EMP Shockwave'],
  mines: [T.Spider_Mines, O.PlaceMine, 'I', 'Spider Mines'],
  scan: [T.Scanner_Sweep, O.CastScannerSweep, 'S', 'Scanner Sweep'],
  matrix: [T.Defensive_Matrix, O.CastDefensiveMatrix, 'D', 'Defensive Matrix'],
  irradiate: [T.Irradiate, O.CastIrradiate, 'I', 'Irradiate'],
  yamato: [T.Yamato_Gun, O.FireYamatoGun, 'Y', 'Yamato Gun'],
  restoration: [T.Restoration, O.CastRestoration, 'R', 'Restoration'],
  flare: [T.Optical_Flare, O.CastOpticalFlare, 'F', 'Optical Flare'],
  heal: [T.Healing, O.MedicHeal, 'E', 'Heal'],
  nuke: [T.Nuclear_Strike, O.NukePaint, 'N', 'Nuclear Strike'],
};

// Unit types that can lift off, and the structures each kind of building trains, researches or adds.
const LIFTS = new Set([U.Terran_Command_Center, U.Terran_Barracks, U.Terran_Factory, U.Terran_Starport, U.Terran_Science_Facility, U.Terran_Engineering_Bay]);
const BUILDINGS = {
  [U.Terran_Command_Center]: { train: [[U.Terran_SCV, 0, 'S', 'Build SCV']], addons: [[U.Terran_Comsat_Station, 6, 'C', 'Build Comsat Station'], [U.Terran_Nuclear_Silo, 7, 'N', 'Build Nuclear Silo']], rally: true },
  [U.Terran_Barracks]: { train: [[U.Terran_Marine, 0, 'M', 'Train Marine'], [U.Terran_Firebat, 1, 'F', 'Train Firebat'], [U.Terran_Ghost, 2, 'G', 'Train Ghost'], [U.Terran_Medic, 3, 'C', 'Train Medic']], rally: true },
  [U.Terran_Factory]: { train: [[U.Terran_Vulture, 0, 'V', 'Build Vulture'], [U.Terran_Siege_Tank_Tank_Mode, 1, 'T', 'Build Siege Tank'], [U.Terran_Goliath, 2, 'G', 'Build Goliath']], addons: [[U.Terran_Machine_Shop, 6, 'C', 'Build Machine Shop']], rally: true },
  [U.Terran_Starport]: { train: [[U.Terran_Wraith, 0, 'W', 'Build Wraith'], [U.Terran_Dropship, 1, 'D', 'Build Dropship'], [U.Terran_Science_Vessel, 2, 'V', 'Build Science Vessel'], [U.Terran_Battlecruiser, 3, 'B', 'Build Battlecruiser'], [U.Terran_Valkyrie, 4, 'Y', 'Build Valkyrie']], addons: [[U.Terran_Control_Tower, 6, 'C', 'Build Control Tower']], rally: true },
  [U.Terran_Science_Facility]: { research: [[T.EMP_Shockwave, 0, 'E', 'Research EMP Shockwave'], [T.Irradiate, 1, 'I', 'Research Irradiate']], upgrade: [[G.Titan_Reactor, 3, 'T', 'Upgrade Titan Reactor']], addons: [[U.Terran_Covert_Ops, 6, 'C', 'Build Covert Ops'], [U.Terran_Physics_Lab, 7, 'P', 'Build Physics Lab']] },
  [U.Terran_Engineering_Bay]: { upgrade: [[G.Terran_Infantry_Weapons, 0, 'W', 'Upgrade Infantry Weapons'], [G.Terran_Infantry_Armor, 1, 'A', 'Upgrade Infantry Armor']] },
  [U.Terran_Academy]: { research: [[T.Stim_Packs, 1, 'T', 'Research Stim Packs'], [T.Restoration, 2, 'R', 'Research Restoration'], [T.Optical_Flare, 3, 'O', 'Research Optical Flare']], upgrade: [[G.U_238_Shells, 0, 'U', 'Research U-238 Shells'], [G.Caduceus_Reactor, 4, 'C', 'Research Caduceus Reactor']] },
  [U.Terran_Armory]: { upgrade: [[G.Terran_Vehicle_Weapons, 0, 'V', 'Upgrade Vehicle Weapons'], [G.Terran_Ship_Weapons, 1, 'S', 'Upgrade Ship Weapons'], [G.Terran_Vehicle_Plating, 3, 'P', 'Upgrade Vehicle Plating'], [G.Terran_Ship_Plating, 4, 'H', 'Upgrade Ship Plating']] },
  [U.Terran_Machine_Shop]: { research: [[T.Spider_Mines, 1, 'M', 'Research Spider Mines'], [T.Tank_Siege_Mode, 2, 'S', 'Research Siege Tech']], upgrade: [[G.Ion_Thrusters, 0, 'I', 'Research Ion Thrusters'], [G.Charon_Boosters, 3, 'C', 'Research Charon Boosters']] },
  [U.Terran_Control_Tower]: { research: [[T.Cloaking_Field, 0, 'C', 'Research Cloaking Field']], upgrade: [[G.Apollo_Reactor, 1, 'A', 'Research Apollo Reactor']] },
  [U.Terran_Covert_Ops]: { research: [[T.Lockdown, 0, 'L', 'Research Lockdown'], [T.Personnel_Cloaking, 1, 'C', 'Research Personnel Cloaking']], upgrade: [[G.Ocular_Implants, 3, 'O', 'Research Ocular Implants'], [G.Moebius_Reactor, 4, 'M', 'Research Moebius Reactor']] },
  [U.Terran_Physics_Lab]: { research: [[T.Yamato_Gun, 0, 'Y', 'Research Yamato Gun']], upgrade: [[G.Colossus_Reactor, 1, 'C', 'Research Colossus Reactor']] },
  [U.Terran_Comsat_Station]: { spells: [['scan', 0]] },
  [U.Terran_Nuclear_Silo]: { train: [[U.Terran_Nuclear_Missile, 0, 'N', 'Arm Nuclear Silo']] },
  [U.Terran_Missile_Turret]: { basicAttack: true },
  [U.Terran_Bunker]: { unload: true },
};
// Units: their abilities beyond move/stop/attack/patrol/hold, by card position.
const UNITS = {
  [U.Terran_Marine]: { stim: 6 },
  [U.Terran_Firebat]: { stim: 6 },
  [U.Terran_Medic]: { noAttack: true, spells: [['heal', 6], ['restoration', 7], ['flare', 8]] },
  [U.Terran_Ghost]: { cloak: [T.Personnel_Cloaking, 6], spells: [['lockdown', 7], ['nuke', 8]] },
  [U.Terran_Vulture]: { spells: [['mines', 6]] },
  [U.Terran_Siege_Tank_Tank_Mode]: { siege: 6 },
  [U.Terran_Siege_Tank_Siege_Mode]: { siege: 6, noMove: true },
  [U.Terran_Wraith]: { cloak: [T.Cloaking_Field, 6] },
  [U.Terran_Dropship]: { noAttack: true, unload: true },
  [U.Terran_Science_Vessel]: { noAttack: true, spells: [['matrix', 6], ['emp', 7], ['irradiate', 8]] },
  [U.Terran_Battlecruiser]: { spells: [['yamato', 6]] },
};
const SCV_BASIC = [[U.Terran_Command_Center, 0, 'C'], [U.Terran_Supply_Depot, 1, 'S'], [U.Terran_Refinery, 2, 'R'], [U.Terran_Barracks, 3, 'B'], [U.Terran_Engineering_Bay, 4, 'E'], [U.Terran_Missile_Turret, 5, 'T'], [U.Terran_Academy, 6, 'A'], [U.Terran_Bunker, 7, 'U']];
const SCV_ADVANCED = [[U.Terran_Factory, 0, 'F'], [U.Terran_Starport, 1, 'S'], [U.Terran_Science_Facility, 2, 'I'], [U.Terran_Armory, 3, 'A']];

// What the player's selected units can do. `menu` is 'build' / 'advanced' while an SCV build list is open.
export function commandCard(units, menu, game) {
  const { engine } = game;
  const names = game.ui.names;
  const one = units.length === 1 ? units[0] : null;
  const types = new Set(units.map((u) => u.type));
  const me = game.me;
  const unitCost = (type) => { const t = engine.unitType(type); return { minerals: t.minerals, gas: t.gas, supply: t.supply }; };

  const order = (id, pos, icon, key, tip, ord) => ({ id, pos, icon, key, tip, enabled: engine.can('order', ord), run: () => game.target('order', { order: ord, button: id }) });
  const now = (id, pos, icon, key, tip, cmd, voice = true) => ({ id, pos, icon, key, tip, run: () => { game.send(cmd()); if (voice) game.acknowledge(); } });
  const cancel = (tip, cmd) => now('cancel', 8, ICON.cancel, 'Esc', tip, cmd, false);
  const basic = (opts = {}) => [
    ...(opts.noMove ? [] : [order('move', 0, ICON.move, 'M', 'Move', O.Move)]),
    now('stop', 1, ICON.stop, 'S', 'Stop', () => engine.cmd.stop()),
    ...(opts.noAttack ? [] : [order('attack', 2, ICON.attack, 'A', 'Attack', O.AttackDefault)]),
    ...(opts.noMove ? [] : [order('patrol', 3, ICON.patrol, 'P', 'Patrol', O.Patrol)]),
    now('hold', 4, ICON.hold, 'H', 'Hold Position', () => engine.cmd.hold()),
  ];
  const spell = (name, pos) => {
    const [tech, ord, key, tip] = SPELL[name];
    if (engine.techState(me, tech) !== 2 && !engine.can('tech', tech)) return null;
    const info = engine.tech(tech);
    return {
      id: name, pos, icon: info.icon, key, tip, cost: info.energy ? { energy: info.energy } : null, enabled: engine.can('tech', tech),
      run: () => {
        if (info.energy && !units.some((u) => u.energy >= info.energy)) { game.notice(MESSAGES.energy); return; }
        game.target('order', { order: ord, button: name });
      },
    };
  };
  const train = ([type, pos, key, tip]) => ({
    id: `train-${type}`, pos, icon: type, key, tip, cost: unitCost(type), enabled: engine.can('build', type),
    run: () => {
      const why = game.needResources(unitCost(type));
      if (why) { game.notice(why); return; }
      game.send(engine.cmd.train(type));
    },
  });
  const research = ([tech, pos, key, tip]) => {
    if (engine.techState(me, tech) !== 0) return null;
    const t = engine.tech(tech);
    return {
      id: `research-${tech}`, pos, icon: t.icon, key, tip, cost: { minerals: t.minerals, gas: t.gas }, enabled: engine.can('research', tech),
      run: () => { const why = game.needResources(t); if (why) game.notice(why); else game.send(engine.cmd.research(tech)); },
    };
  };
  const upgrade = ([upg, pos, key, tip]) => {
    const st = engine.upgradeState(me, upg);
    if (st.upgrading || st.level >= st.max) return null;
    const t = engine.upgrade(upg, me);
    return {
      id: `upgrade-${upg}`, pos, icon: t.icon, key, tip: st.max > 1 ? `${tip} (Level ${st.level + 1})` : tip, cost: { minerals: t.minerals, gas: t.gas }, enabled: engine.can('upgrade', upg),
      run: () => { const why = game.needResources(t); if (why) game.notice(why); else game.send(engine.cmd.upgrade(upg)); },
    };
  };

  // ---- one building ----
  if (one && one.building) {
    if (!one.completed) return [cancel('Cancel', () => engine.cmd.cancelConstruction())];
    if (one.flying) {
      return [
        order('move', 0, ICON.move, 'M', 'Move', O.Move),
        now('stop', 1, ICON.stop, 'S', 'Stop', () => engine.cmd.stop(), false),
        { id: 'land', pos: 8, icon: ICON.land, key: 'L', tip: 'Land', run: () => game.target('land', { type: one.type, button: 'land' }) },
      ];
    }
    const def = BUILDINGS[one.type] || {};
    // Busy buildings show only how to stop what they do.
    if (one.research >= 0) return [cancel('Cancel Research', () => engine.cmd.cancelResearch())];
    if (one.upgrade >= 0) return [cancel('Cancel Upgrade', () => engine.cmd.cancelUpgrade())];
    if (one.addonProgress >= 0) return [cancel('Cancel Add-On', () => engine.cmd.cancelAddon())];
    const list = [];
    for (const t of def.train || []) list.push(train(t));
    for (const r of def.research || []) list.push(research(r));
    for (const u of def.upgrade || []) list.push(upgrade(u));
    for (const [name, pos] of def.spells || []) list.push(spell(name, pos));
    if (def.basicAttack) list.push(now('stop', 1, ICON.stop, 'S', 'Stop', () => engine.cmd.stop(), false), order('attack', 2, ICON.attack, 'A', 'Attack', O.AttackDefault));
    if (def.unload) list.push(now('unload', 8, ICON.unloadAll, 'U', 'Unload All', () => engine.cmd.unloadAll()));
    if (one.addon < 0) {
      for (const [type, pos, key, tip] of def.addons || []) {
        list.push({ id: `addon-${type}`, pos, icon: type, key, tip, cost: unitCost(type), enabled: engine.can('build', type),
          run: () => { const why = game.needResources(unitCost(type)); if (why) game.notice(why); else { game.send(engine.cmd.addon(type)); game.acknowledge(); } } });
      }
    }
    if (def.rally) list.push(order('rally', 5, ICON.rally, 'R', 'Set Rally Point', O.RallyPointTile));
    if (one.queue.length) list.push(cancel('Cancel Last', () => engine.cmd.cancelQueue(254)));
    else if (LIFTS.has(one.type)) list.push(now('liftoff', 8, ICON.liftoff, 'L', 'Lift Off', () => engine.cmd.liftoff(), false));
    return list.filter(Boolean);
  }

  // ---- SCVs ----
  if (types.size === 1 && types.has(U.Terran_SCV)) {
    if (one && (menu === 'build' || menu === 'advanced')) {
      const list = (menu === 'build' ? SCV_BASIC : SCV_ADVANCED).map(([type, pos, key]) => ({
        id: `build-${type}`, pos, icon: type, key, tip: `Build ${names[type].replace(/^Terran /, '')}`, cost: unitCost(type), enabled: engine.can('build', type),
        run: () => {
          const why = game.needResources(unitCost(type));
          if (why) { game.notice(why); return; }
          game.target('build', { type, button: `build-${type}` });
        },
      }));
      return [...list, now('cancel', 8, ICON.cancel, 'Esc', 'Cancel', () => null, false)].map((b) => (b.id === 'cancel' ? { ...b, run: () => { game.menu = null; game.mode = null; } } : b));
    }
    return [
      ...basic().filter((b) => b.pos < 3),
      order('repair', 3, ICON.repair, 'R', 'Repair', O.Repair),
      order('gather', 4, ICON.gather, 'G', 'Gather', O.Harvest1),
      { ...now('return', 5, ICON.returnCargo, 'C', 'Return Cargo', () => engine.cmd.returnCargo()), enabled: units.some((u) => u.carrying > 0) },
      ...(one ? [
        { id: 'build', pos: 6, icon: ICON.build, key: 'B', tip: 'Build Structure', run: () => { game.menu = 'build'; } },
        { id: 'advanced', pos: 7, icon: ICON.buildAdvanced, key: 'V', tip: 'Build Advanced Structure', run: () => { game.menu = 'advanced'; } },
      ] : []),
    ];
  }

  // ---- other units: shared orders, plus abilities when the whole selection is one type ----
  if (units.some((u) => u.building)) return [];
  const def = types.size === 1 ? UNITS[one ? one.type : units[0].type] || {} : {};
  const list = basic({ noAttack: def.noAttack && types.size === 1, noMove: def.noMove && types.size === 1 });
  if (def.stim != null && engine.techState(me, T.Stim_Packs) === 2) {
    list.push({ ...now('stim', def.stim, engine.tech(T.Stim_Packs).icon, 'T', 'Use Stim Pack', () => engine.cmd.stim(), false), enabled: units.some((u) => u.hp > 10) });
  }
  if (def.siege != null && (engine.techState(me, T.Tank_Siege_Mode) === 2)) {
    const sieged = units[0].type === U.Terran_Siege_Tank_Siege_Mode;
    const icon = engine.tech(T.Tank_Siege_Mode).icon;
    list.push(now('siege', def.siege, sieged ? icon + 1 : icon, 'O', sieged ? 'Tank Mode' : 'Siege Mode', () => (sieged ? engine.cmd.unsiege() : engine.cmd.siege()), false));
  }
  if (def.cloak && engine.techState(me, def.cloak[0]) === 2) {
    const cloaked = units.every((u) => u.cloaked);
    const icon = engine.tech(def.cloak[0]).icon;
    list.push(now(cloaked ? 'decloak' : 'cloak', def.cloak[1], cloaked ? icon + 1 : icon, cloaked ? 'D' : 'C', cloaked ? 'Decloak' : 'Cloak', () => (cloaked ? engine.cmd.decloak() : engine.cmd.cloak()), false));
  }
  for (const [name, pos] of def.spells || []) list.push(spell(name, pos));
  if (def.unload && units.some((u) => u.loaded?.length)) list.push(now('unload', 8, ICON.unloadAll, 'U', 'Unload All', () => engine.cmd.unloadAll()));
  return list.filter(Boolean);
}
