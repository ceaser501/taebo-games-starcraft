// The command card: 3x3 buttons with the original hotkeys, icons and button texts.
// Icon numbers are cmdicons.grp frames: unit icons share the unit id; commands start at 228.
export const UNIT = { marine: 0, scv: 7, commandCenter: 106, supplyDepot: 109, barracks: 111 };
const ICON = { move: 228, stop: 229, attack: 230, gather: 231, repair: 232, returnCargo: 233, build: 234, cancel: 236, patrol: 254, hold: 255 };
const ORDER = { move: 6, attack: 14, patrol: 152, gather: 79, repair: 34 };

// Messages the original shows for refused orders.
export const MESSAGES = {
  minerals: 'Not enough minerals...mine more minerals.',
  gas: 'Not enough Vespene gas...harvest more gas.',
  supply: 'Additional supply depots required.',
  location: 'Invalid location.',
  queue: 'Queue is full.',
};

// What one or more of the player's units can do. `menu` is 'build' while the SCV build list is open.
export function commandCard(units, menu, game) {
  const types = new Set(units.map((u) => u.type));
  const one = units.length === 1 ? units[0] : null;
  const order = (id, pos, icon, key, tip) => ({ id, pos, icon, key, tip, run: () => game.target('order', { order: ORDER[id], button: id }) });
  const basic = [
    order('move', 0, ICON.move, 'M', 'Move'),
    { id: 'stop', pos: 1, icon: ICON.stop, key: 'S', tip: 'Stop', run: () => { game.send(game.engine.cmd.stop()); game.acknowledge(); } },
    order('attack', 2, ICON.attack, 'A', 'Attack'),
  ];
  const patrolHold = [
    order('patrol', 3, ICON.patrol, 'P', 'Patrol'),
    { id: 'hold', pos: 4, icon: ICON.hold, key: 'H', tip: 'Hold Position', run: () => { game.send(game.engine.cmd.hold()); game.acknowledge(); } },
  ];
  const cancel = (tip, run) => ({ id: 'cancel', pos: 8, icon: ICON.cancel, key: 'Esc', tip, run });
  const cost = (type) => {
    const t = game.engine.unitType(type);
    return t.gas ? `${t.minerals} / ${t.gas}` : String(t.minerals);
  };

  // A building still under construction can only be cancelled.
  if (one && one.building && !one.completed) {
    return [cancel('Cancel', () => game.send(game.engine.cmd.cancelConstruction()))];
  }

  if (one && one.building) {
    const train = (type, key, tip) => ({
      id: `train-${type}`, pos: 0, icon: type, key, tip: `${tip}  (${cost(type)})`,
      run: () => {
        const why = game.needResources(type);
        if (why) { game.notice(why); return; }
        if (one.queue.length >= 5) { game.notice(MESSAGES.queue); return; }
        game.send(game.engine.cmd.train(type));
      },
    });
    const list = [];
    if (one.type === UNIT.commandCenter) list.push(train(UNIT.scv, 'S', 'Build SCV'));
    if (one.type === UNIT.barracks) list.push(train(UNIT.marine, 'M', 'Train Marine'));
    if (one.queue.length) list.push(cancel('Cancel Last', () => game.send(game.engine.cmd.cancelQueue(254))));
    return list;
  }

  if (types.size === 1 && types.has(UNIT.scv)) {
    if (menu === 'build' && one) {
      const build = (type, pos, key, tip) => ({
        id: `build-${type}`, pos, icon: type, key, tip: `${tip}  (${cost(type)})`,
        run: () => {
          const why = game.needResources(type);
          if (why) { game.notice(why); return; }
          game.target('build', { type, button: `build-${type}` });
        },
      });
      return [
        build(UNIT.commandCenter, 0, 'C', 'Build Command Center'),
        build(UNIT.supplyDepot, 1, 'S', 'Build Supply Depot'),
        build(UNIT.barracks, 3, 'B', 'Build Barracks'),
        cancel('Cancel', () => { game.menu = null; game.mode = null; }),
      ];
    }
    return [
      ...basic,
      order('repair', 3, ICON.repair, 'R', 'Repair'),
      order('gather', 4, ICON.gather, 'G', 'Gather'),
      { id: 'return', pos: 5, icon: ICON.returnCargo, key: 'C', tip: 'Return Cargo', enabled: units.some((u) => u.carrying > 0), run: () => { game.send(game.engine.cmd.returnCargo()); game.acknowledge(); } },
      // Only a single SCV can be told to build.
      ...(one ? [{ id: 'build', pos: 6, icon: ICON.build, key: 'B', tip: 'Build Structure', run: () => { game.menu = 'build'; } }] : []),
    ];
  }

  // Groups of units (marines, SCVs together...): the shared orders.
  if (units.every((u) => !u.building)) return [...basic, ...patrolHold];
  return [];
}
