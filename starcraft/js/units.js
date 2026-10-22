// The command card: which 3x3 buttons a selection shows, where, and with which icon. Button texts
// and hotkeys come from the original string table (stat_txt.tbl: hotkey, button kind, then the
// text with the hotkey letter in yellow); buttons the table has no text for use the same markup.
// Whether a button is lit comes from the engine's own rules (requirements, tech, add-ons).
// Icon numbers are cmdicons.grp frames: unit icons share the unit id; commands start at 228.
import { UnitTypes as U, TechTypes as T, UpgradeTypes as G, Orders as O } from './bw-ids.js';

export const UNIT = { marine: U.Terran_Marine, scv: U.Terran_SCV, commandCenter: U.Terran_Command_Center, supplyDepot: U.Terran_Supply_Depot, barracks: U.Terran_Barracks };
const ICON = {
  move: 228, stop: 229, attack: 230, gather: 231, repair: 232, returnCargo: 233, cancel: 236, rally: 286, patrol: 254, hold: 255,
  liftoff: 282, land: 283, unloadAll: 283, burrow: 259, unburrow: 260,
  // Each race's two build buttons: Terran buildings, Protoss warp gates, Zerg mutations.
  build: [257, 234, 272], buildAdvanced: [258, 235, 273],
};

// What the original says when an order is refused: the message (stat_txt.tbl string number)
// and the advisor's voice, per race (0 zerg, 1 terran, 2 protoss).
const ADVISOR = ['zerg/advisor/zaderr', 'terran/advisor/taderr', 'protoss/advisor/paderr'];
export function message(key, race) {
  const adv = ADVISOR[race];
  switch (key) {
    case 'minerals': return { str: 849, voice: `${adv}00.wav` };
    case 'gas': return { str: 850, voice: `${adv}01.wav` };
    case 'supply': return { str: [843, 844, 845][race], voice: `${adv}02.wav` };
    case 'energy': return { str: 863, voice: `${adv}06.wav` };
    case 'location': return { str: 855, voice: ['zerg/drone/zdrerr00.wav', 'terran/scv/tscerr00.wav', 'protoss/probe/pprerr00.wav'][race] };
    case 'creep': return { str: 859, voice: 'zerg/drone/zdrerr00.wav' };
    case 'power': return { str: 860, voice: 'protoss/probe/pprerr00.wav' };
    case 'landing': return { str: 862, voice: 'terran/advisor/taderr04.wav' };
    case 'queue': return { text: 'Queue is full.' };
    case 'nuke': return { str: 1046 };
    default: return null;
  }
}

// Button texts the table lacks, in its markup (\x03 yellow hotkey, \x01 back to normal).
const TEXT = {
  move: 'm\x01\x03M\x01ove', stop: 's\x01\x03S\x01top', attack: 'a\x01\x03A\x01ttack', patrol: 'p\x01\x03P\x01atrol',
  hold: 'h\x01\x03H\x01old Position', repair: 'r\x01\x03R\x01epair', gather: 'g\x01\x03G\x01ather', returnCargo: 'c\x01Return \x03C\x01argo',
  build: 'b\x01\x03B\x01uild Structure', advanced: 'v\x01Build Ad\x03v\x01anced Structure', cancel: '\x1b\x01\x03Esc\x01: Cancel',
  rally: 'r\x01Set \x03R\x01ally Point', liftoff: 'l\x01\x03L\x01ift Off', land: 'l\x01\x03L\x01and', unload: 'u\x01\x03U\x01nload All',
  decloak: 'd\x01\x03D\x01ecloak', tankMode: 'o\x01Tank M\x03o\x01de', nuke: 'n\x03\x03N\x01uclear Strike',
  cancelLast: '\x1b\x01\x03Esc\x01: Cancel Last', cancelResearch: '\x1b\x01\x03Esc\x01: Cancel Research',
  cancelUpgrade: '\x1b\x01\x03Esc\x01: Cancel Upgrade', cancelAddon: '\x1b\x01\x03Esc\x01: Cancel Add-On',
  cancelConstruction: '\x1b\x01\x03Esc\x01: Cancel Construction', cancelMorph: '\x1b\x01\x03Esc\x01: Cancel Morph',
  cancelMutation: '\x1b\x01\x03Esc\x01: Cancel Mutation', cancelWarp: '\x1b\x01\x03Esc\x01: Cancel Warp',
  unburrow: 'u\x01\x03U\x01nburrow', infest: 'i\x01\x03I\x01nfest', larva: 's\x01\x03S\x01elect Larva',
  basicMutation: 'b\x01\x03B\x01asic Mutation', advancedMutation: 'v\x01Ad\x03v\x01anced Mutation',
  warp: 'b\x01\x03B\x01uild Structure', warpAdvanced: 'v\x01Build Ad\x03v\x01anced Structure',
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
  nuke: [null, O.NukePaint, 'nuke'], // no tech entry; shown while a silo holds a nuke
  // Protoss
  storm: [T.Psionic_Storm, O.CastPsionicStorm, 399],
  hallucination: [T.Hallucination, O.CastHallucination, 400],
  recall: [T.Recall, O.CastRecall, 401],
  stasis: [T.Stasis_Field, O.CastStasisField, 402],
  web: [T.Disruption_Web, O.CastDisruptionWeb, 1264],
  mindControl: [T.Mind_Control, O.CastMindControl, 1265],
  feedback: [T.Feedback, O.CastFeedback, 1266],
  maelstrom: [T.Maelstrom, O.CastMaelstrom, 1267],
  // Zerg
  infest: [T.Infestation, O.CastInfestation, 'infest'],
  broodlings: [T.Spawn_Broodlings, O.CastSpawnBroodlings, 374],
  swarm: [T.Dark_Swarm, O.CastDarkSwarm, 375],
  parasite: [T.Parasite, O.CastParasite, 376],
  plague: [T.Plague, O.CastPlague, 377],
  consume: [T.Consume, O.CastConsume, 378],
  ensnare: [T.Ensnare, O.CastEnsnare, 380],
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
  // Protoss
  [U.Protoss_Nexus]: { train: [[U.Protoss_Probe, 0, 598]], rally: true },
  [U.Protoss_Gateway]: { train: [[U.Protoss_Zealot, 0, 599], [U.Protoss_Dragoon, 1, 600], [U.Protoss_High_Templar, 2, 601], [U.Protoss_Dark_Templar, 3, 1292]], rally: true },
  [U.Protoss_Robotics_Facility]: { train: [[U.Protoss_Shuttle, 0, 602], [U.Protoss_Reaver, 1, 607], [U.Protoss_Observer, 2, 597]], rally: true },
  [U.Protoss_Stargate]: { train: [[U.Protoss_Scout, 0, 603], [U.Protoss_Carrier, 1, 605], [U.Protoss_Arbiter, 2, 604], [U.Protoss_Corsair, 3, 1291]], rally: true },
  [U.Protoss_Forge]: { upgrade: [[G.Protoss_Ground_Weapons, 0, 468], [G.Protoss_Ground_Armor, 1, 460], [G.Protoss_Plasma_Shields, 2, 470]] },
  [U.Protoss_Cybernetics_Core]: { upgrade: [[G.Protoss_Air_Weapons, 0, 469], [G.Protoss_Air_Armor, 1, 461], [G.Singularity_Charge, 2, 488]] },
  [U.Protoss_Citadel_of_Adun]: { upgrade: [[G.Leg_Enhancements, 0, 489]] },
  [U.Protoss_Robotics_Support_Bay]: { upgrade: [[G.Scarab_Damage, 0, 490], [G.Reaver_Capacity, 1, 491], [G.Gravitic_Drive, 2, 492]] },
  [U.Protoss_Observatory]: { upgrade: [[G.Sensor_Array, 0, 493], [G.Gravitic_Boosters, 1, 494]] },
  [U.Protoss_Fleet_Beacon]: { research: [[T.Disruption_Web, 3, 1259]], upgrade: [[G.Apial_Sensors, 0, 496], [G.Gravitic_Thrusters, 1, 497], [G.Carrier_Capacity, 2, 498], [G.Argus_Jewel, 4, 1284]] },
  [U.Protoss_Templar_Archives]: { research: [[T.Psionic_Storm, 0, 394], [T.Hallucination, 1, 395], [T.Mind_Control, 3, 1260], [T.Maelstrom, 4, 1262]], upgrade: [[G.Khaydarin_Amulet, 2, 495], [G.Argus_Talisman, 5, 1285]] },
  [U.Protoss_Arbiter_Tribunal]: { research: [[T.Recall, 0, 396], [T.Stasis_Field, 1, 397]], upgrade: [[G.Khaydarin_Core, 2, 499]] },
  [U.Protoss_Photon_Cannon]: { basicAttack: true },
  // Zerg: hatcheries pick their larvae; buildings mutate into the next tier.
  [U.Zerg_Hatchery]: { larva: 0, research: [[T.Burrowing, 6, 363]], morph: [[U.Zerg_Lair, 3, 623]], rally: true },
  [U.Zerg_Lair]: { larva: 0, research: [[T.Burrowing, 6, 363]], upgrade: [[G.Ventral_Sacs, 1, 479], [G.Antennae, 2, 480], [G.Pneumatized_Carapace, 7, 481]], morph: [[U.Zerg_Hive, 3, 624]], rally: true },
  [U.Zerg_Hive]: { larva: 0, research: [[T.Burrowing, 6, 363]], upgrade: [[G.Ventral_Sacs, 1, 479], [G.Antennae, 2, 480], [G.Pneumatized_Carapace, 7, 481]], rally: true },
  [U.Zerg_Spawning_Pool]: { upgrade: [[G.Metabolic_Boost, 0, 482], [G.Adrenal_Glands, 1, 483]] },
  [U.Zerg_Evolution_Chamber]: { upgrade: [[G.Zerg_Melee_Attacks, 0, 465], [G.Zerg_Missile_Attacks, 1, 466], [G.Zerg_Carapace, 2, 458]] },
  [U.Zerg_Hydralisk_Den]: { research: [[T.Lurker_Aspect, 2, 1252]], upgrade: [[G.Muscular_Augments, 0, 484], [G.Grooved_Spines, 1, 485]] },
  [U.Zerg_Spire]: { upgrade: [[G.Zerg_Flyer_Attacks, 0, 467], [G.Zerg_Flyer_Carapace, 1, 459]], morph: [[U.Zerg_Greater_Spire, 6, 625]] },
  [U.Zerg_Greater_Spire]: { upgrade: [[G.Zerg_Flyer_Attacks, 0, 467], [G.Zerg_Flyer_Carapace, 1, 459]] },
  [U.Zerg_Queens_Nest]: { research: [[T.Spawn_Broodlings, 0, 365], [T.Ensnare, 1, 369]], upgrade: [[G.Gamete_Meiosis, 2, 486]] },
  [U.Zerg_Defiler_Mound]: { research: [[T.Plague, 0, 368], [T.Consume, 1, 370]], upgrade: [[G.Metasynaptic_Node, 2, 487]] },
  [U.Zerg_Ultralisk_Cavern]: { upgrade: [[G.Anabolic_Synthesis, 0, 1282], [G.Chitinous_Plating, 1, 1283]] },
  [U.Zerg_Creep_Colony]: { morph: [[U.Zerg_Sunken_Colony, 0, 627], [U.Zerg_Spore_Colony, 1, 626]] },
  [U.Zerg_Sunken_Colony]: { basicAttack: true },
  [U.Zerg_Spore_Colony]: { basicAttack: true },
  [U.Zerg_Infested_Command_Center]: { train: [[U.Zerg_Infested_Terran, 0, 584]], rally: true },
  [U.Zerg_Nydus_Canal]: { exit: 0 },
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
  // Protoss
  [U.Protoss_High_Templar]: { noAttack: true, spells: [['storm', 6], ['hallucination', 7]], archon: 8 },
  [U.Protoss_Dark_Templar]: { darkArchon: 8 },
  [U.Protoss_Dark_Archon]: { noAttack: true, spells: [['feedback', 6], ['mindControl', 7], ['maelstrom', 8]] },
  [U.Protoss_Shuttle]: { noAttack: true, unload: true },
  [U.Protoss_Observer]: { noAttack: true },
  [U.Protoss_Arbiter]: { spells: [['recall', 6], ['stasis', 7]] },
  [U.Protoss_Corsair]: { spells: [['web', 6]] },
  [U.Protoss_Carrier]: { fighter: [U.Protoss_Interceptor, 6, 606] },
  [U.Protoss_Reaver]: { fighter: [U.Protoss_Scarab, 6, 608] },
  // Zerg
  [U.Zerg_Larva]: { larva: true },
  [U.Zerg_Zergling]: { burrow: 8 },
  [U.Zerg_Hydralisk]: { burrow: 8, morph: [[U.Zerg_Lurker, 6, 1288, T.Lurker_Aspect]] },
  [U.Zerg_Lurker]: { burrow: 8 },
  [U.Zerg_Infested_Terran]: { burrow: 8 },
  [U.Zerg_Defiler]: { noAttack: true, burrow: 8, spells: [['consume', 5], ['swarm', 6], ['plague', 7]] },
  [U.Zerg_Queen]: { noAttack: true, spells: [['infest', 5], ['parasite', 6], ['broodlings', 7], ['ensnare', 8]] },
  [U.Zerg_Overlord]: { noAttack: true, unload: true },
  [U.Zerg_Mutalisk]: { morph: [[U.Zerg_Guardian, 6, 580], [U.Zerg_Devourer, 7, 1287]] },
};
// Larvae turn into these.
const LARVA = [[U.Zerg_Drone, 0, 577], [U.Zerg_Zergling, 1, 574], [U.Zerg_Overlord, 2, 578], [U.Zerg_Hydralisk, 3, 575], [U.Zerg_Mutalisk, 4, 579],
  [U.Zerg_Scourge, 5, 583], [U.Zerg_Queen, 6, 581], [U.Zerg_Ultralisk, 7, 576], [U.Zerg_Defiler, 8, 582]];
const EGGS = new Set([U.Zerg_Egg, U.Zerg_Cocoon, U.Zerg_Lurker_Egg]);
const SCV_BASIC = [[U.Terran_Command_Center, 0, 645], [U.Terran_Supply_Depot, 1, 646], [U.Terran_Refinery, 2, 647], [U.Terran_Barracks, 3, 648], [U.Terran_Engineering_Bay, 4, 649], [U.Terran_Missile_Turret, 5, 650], [U.Terran_Academy, 6, 651], [U.Terran_Bunker, 7, 652]];
const SCV_ADVANCED = [[U.Terran_Factory, 0, 653], [U.Terran_Starport, 1, 654], [U.Terran_Science_Facility, 2, 655], [U.Terran_Armory, 3, 656]];
const PROBE_BASIC = [[U.Protoss_Nexus, 0, 629], [U.Protoss_Pylon, 1, 630], [U.Protoss_Assimilator, 2, 631], [U.Protoss_Gateway, 3, 632], [U.Protoss_Forge, 4, 633],
  [U.Protoss_Photon_Cannon, 5, 634], [U.Protoss_Cybernetics_Core, 6, 635], [U.Protoss_Shield_Battery, 7, 636]];
const PROBE_ADVANCED = [[U.Protoss_Robotics_Facility, 0, 637], [U.Protoss_Stargate, 1, 641], [U.Protoss_Citadel_of_Adun, 2, 639], [U.Protoss_Robotics_Support_Bay, 3, 644],
  [U.Protoss_Fleet_Beacon, 4, 642], [U.Protoss_Templar_Archives, 5, 640], [U.Protoss_Observatory, 6, 638], [U.Protoss_Arbiter_Tribunal, 7, 643]];
const DRONE_BASIC = [[U.Zerg_Hatchery, 0, 612], [U.Zerg_Creep_Colony, 1, 613], [U.Zerg_Extractor, 2, 614], [U.Zerg_Spawning_Pool, 3, 615], [U.Zerg_Evolution_Chamber, 4, 616],
  [U.Zerg_Hydralisk_Den, 6, 617]];
const DRONE_ADVANCED = [[U.Zerg_Spire, 0, 619], [U.Zerg_Queens_Nest, 1, 620], [U.Zerg_Nydus_Canal, 2, 618], [U.Zerg_Ultralisk_Cavern, 3, 621], [U.Zerg_Defiler_Mound, 4, 622]];
// Workers: race index, build lists and button texts.
const WORKERS = {
  [U.Terran_SCV]: { race: 1, basic: SCV_BASIC, advanced: SCV_ADVANCED, text: ['build', 'advanced'], repair: true },
  [U.Protoss_Probe]: { race: 2, basic: PROBE_BASIC, advanced: PROBE_ADVANCED, text: ['warp', 'warpAdvanced'] },
  [U.Zerg_Drone]: { race: 0, basic: DRONE_BASIC, advanced: DRONE_ADVANCED, text: ['basicMutation', 'advancedMutation'], burrow: true },
};

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

  // Attack stays lit: AttackDefault turns into each unit's own attack order (turrets, sieged tanks).
  const order = (id, pos, icon, text, ord) => button(id, pos, icon, text, () => game.target('order', { order: ord, button: id }),
    { enabled: ord === O.AttackDefault || engine.can('order', ord) });
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
    // Nuclear Strike appears while one of your silos holds an armed nuke.
    if (name === 'nuke') {
      if (!engine.nukesReady(me)) return null;
      return button(name, pos, 36, text, () => game.target('order', { order: ord, button: name })); // the radiation sign
    }
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

  const morph = ([type, pos, text, tech], building) => {
    if (tech != null && engine.techState(me, tech) !== 2) return null;
    return button(`morph-${type}`, pos, type, text, pay(unitCost(type), () => { game.send(building ? engine.cmd.morphBuilding(type) : engine.cmd.morph(type)); game.acknowledge(); }),
      { cost: unitCost(type), enabled: tech != null ? engine.can('tech', tech) : engine.can('build', type) });
  };
  const burrowButton = (pos) => {
    if (engine.techState(me, T.Burrowing) !== 2) return null;
    return now('burrow', pos, ICON.burrow, 371, () => engine.cmd.burrow(), false);
  };

  // ---- eggs and cocoons: only cancelling ----
  if (units.every((u) => EGGS.has(u.type))) return [cancel('cancelMorph', () => engine.cmd.cancelMorph())];

  // ---- burrowed units: unburrow (lurkers still fight) ----
  if (units.every((u) => u.burrowed)) {
    const list = [now('unburrow', 8, ICON.unburrow, 'unburrow', () => engine.cmd.unburrow(), false)];
    if (types.size === 1 && types.has(U.Zerg_Lurker)) list.push(now('stop', 1, ICON.stop, 'stop', () => engine.cmd.stop()), order('attack', 2, ICON.attack, 'attack', O.AttackDefault));
    return list;
  }

  // ---- one building ----
  if (one && one.building) {
    if (!one.completed) {
      const zerg = one.type >= U.Zerg_Hatchery && one.type <= U.Zerg_Extractor || one.type === U.Zerg_Infested_Command_Center;
      const protoss = one.type >= U.Protoss_Nexus && one.type <= U.Protoss_Shield_Battery;
      return [cancel(zerg ? 'cancelMutation' : protoss ? 'cancelWarp' : 'cancelConstruction', () => engine.cmd.cancelConstruction())];
    }
    if (one.flying) {
      return [
        order('move', 0, ICON.move, 'move', O.Move),
        now('stop', 1, ICON.stop, 'stop', () => engine.cmd.stop(), false),
        button('land', 8, ICON.land, 'land', () => game.target('land', { type: one.type, button: 'land' })),
      ];
    }
    // A Protoss building away from a pylon does nothing.
    if (!one.powered) return [];
    const def = BUILDINGS[one.type] || {};
    // Busy buildings show only how to stop what they do.
    if (one.research >= 0) return [cancel('cancelResearch', () => engine.cmd.cancelResearch())];
    if (one.upgrade >= 0) return [cancel('cancelUpgrade', () => engine.cmd.cancelUpgrade())];
    if (one.addonProgress >= 0) return [cancel('cancelAddon', () => engine.cmd.cancelAddon())];
    const list = [];
    if (def.larva != null) {
      list.push(button('larva', def.larva, U.Zerg_Larva, 'larva', () => {
        if (engine.selectLarva()) { game.send(engine.cmd.select()); game.updateState(); game.voice('what'); }
      }));
    }
    for (const t of def.train || []) list.push(train(t));
    for (const r of def.research || []) list.push(research(r));
    for (const u of def.upgrade || []) list.push(upgrade(u));
    for (const m of def.morph || []) list.push(morph(m, true));
    for (const [name, pos] of def.spells || []) list.push(spell(name, pos));
    if (def.basicAttack) list.push(now('stop', 1, ICON.stop, 'stop', () => engine.cmd.stop(), false), order('attack', 2, ICON.attack, 'attack', O.AttackDefault));
    if (def.unload) list.push(now('unload', 8, ICON.unloadAll, 'unload', () => engine.cmd.unloadAll()));
    // A Nydus Canal without an exit places one, on creep anywhere you can see.
    if (def.exit != null && engine.can('build', U.Zerg_Nydus_Canal)) {
      list.push(button('exit', def.exit, U.Zerg_Nydus_Canal, 618, () => game.target('build', { type: U.Zerg_Nydus_Canal, button: 'exit' })));
    }
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

  // ---- larvae: what they can become (every selected larva morphs) ----
  if (types.size === 1 && types.has(U.Zerg_Larva)) {
    return LARVA.map(([type, pos, text]) => button(`morph-${type}`, pos, type, text, pay(unitCost(type), () => { game.send(engine.cmd.morph(type)); game.acknowledge(); }),
      { cost: unitCost(type), enabled: engine.can('build', type) }));
  }

  // ---- workers ----
  const worker = types.size === 1 ? WORKERS[units[0].type] : null;
  if (worker) {
    if (one && (menu === 'build' || menu === 'advanced')) {
      const list = (menu === 'build' ? worker.basic : worker.advanced).map(([type, pos, text]) => button(`build-${type}`, pos, type, text,
        pay(unitCost(type), () => game.target('build', { type, button: `build-${type}` })), { cost: unitCost(type), enabled: engine.can('build', type) }));
      return [...list, button('cancel', 8, ICON.cancel, 'cancel', () => { game.menu = null; game.mode = null; })];
    }
    return [
      ...basic().filter((b) => b.pos < 3),
      ...(worker.repair ? [order('repair', 3, ICON.repair, 'repair', O.Repair)] : []),
      order('gather', 4, ICON.gather, 'gather', O.Harvest1),
      { ...now('return', 5, ICON.returnCargo, 'returnCargo', () => engine.cmd.returnCargo()), enabled: units.some((u) => u.carrying > 0) },
      ...(one ? [
        button('build', 6, ICON.build[worker.race], worker.text[0], () => { game.menu = 'build'; }),
        button('advanced', 7, ICON.buildAdvanced[worker.race], worker.text[1], () => { game.menu = 'advanced'; }),
      ] : []),
      ...(worker.burrow ? [burrowButton(8)] : []),
    ].filter(Boolean);
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
  for (const m of def.morph || []) list.push(morph(m, false));
  if (def.burrow != null) list.push(burrowButton(def.burrow));
  // Two or more templars merge into an archon.
  if (def.archon != null && units.length >= 2 && engine.techState(me, T.Archon_Warp) === 2) {
    list.push(now('archon', def.archon, engine.tech(T.Archon_Warp).icon, 403, () => engine.cmd.archon()));
  }
  if (def.darkArchon != null && units.length >= 2 && engine.techState(me, T.Dark_Archon_Meld) === 2) {
    list.push(now('darkArchon', def.darkArchon, engine.tech(T.Dark_Archon_Meld).icon, 1263, () => engine.cmd.darkArchon()));
  }
  // Carriers and reavers build their own interceptors and scarabs.
  if (def.fighter) {
    const [type, pos, text] = def.fighter;
    list.push(button(`fighter-${type}`, pos, type, text, pay(unitCost(type), () => game.send(engine.cmd.trainFighter())),
      { cost: unitCost(type), enabled: engine.can('build', type) }));
  }
  if (def.unload && units.some((u) => u.loaded?.length)) list.push(now('unload', 8, ICON.unloadAll, 'unload', () => engine.cmd.unloadAll()));
  return list.filter(Boolean);
}
