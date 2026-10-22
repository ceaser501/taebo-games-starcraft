// Unit names and the command card (3x3 buttons, hotkeys and icons as in the original).
// Icon numbers are cmdicons.grp frames: unit icons share the unit id; commands start at 228.
export const UNIT = { marine: 0, scv: 7, commandCenter: 106, supplyDepot: 109, barracks: 111 };
const ICON = { move: 228, stop: 229, attack: 230, gather: 231, repair: 232, returnCargo: 233, build: 234, cancel: 236, patrol: 254, hold: 255 };
const ORDER = { move: 6, attack: 14, patrol: 152, gather: 79, repair: 34 };

export const names = {
  0: '테란 마린',
  7: '테란 SCV',
  106: '테란 커맨드 센터',
  109: '테란 서플라이 디포',
  111: '테란 배럭',
  176: '미네랄 필드',
  177: '미네랄 필드',
  178: '미네랄 필드',
  188: '베스핀 간헐천',
};

// What one or more of the player's units can do. `menu` is 'build' while the SCV build list is open.
export function commandCard(units, menu, game) {
  const types = new Set(units.map((u) => u.type));
  const one = units.length === 1 ? units[0] : null;
  const order = (id, pos, icon, key, label) => ({ id, pos, icon, key, label, run: () => game.target('order', { order: ORDER[id], button: id }) });
  const basic = [
    order('move', 0, ICON.move, 'M', '이동'),
    { id: 'stop', pos: 1, icon: ICON.stop, key: 'S', label: '정지', run: () => { game.send(game.engine.cmd.stop()); game.acknowledge(); } },
    order('attack', 2, ICON.attack, 'A', '공격'),
  ];
  const patrolHold = [
    order('patrol', 3, ICON.patrol, 'P', '정찰'),
    { id: 'hold', pos: 4, icon: ICON.hold, key: 'H', label: '위치 사수', run: () => { game.send(game.engine.cmd.hold()); game.acknowledge(); } },
  ];
  const cancel = (label, run) => ({ id: 'cancel', pos: 8, icon: ICON.cancel, key: 'Esc', label, run });

  // A building still under construction can only be cancelled.
  if (one && one.building && !one.completed) {
    return [cancel('건설 취소', () => game.send(game.engine.cmd.cancelConstruction()))];
  }

  if (one && one.building) {
    const train = (type, key) => {
      const t = game.engine.unitType(type);
      return {
        id: `train-${type}`, pos: 0, icon: type, key, label: `${names[type]} 생산`, cost: `미네랄 ${t.minerals}`,
        run: () => {
          const why = game.needResources(type);
          if (why) { game.notice(why); return; }
          if (one.queue.length >= 5) { game.notice('생산 대기열이 가득 찼습니다.'); return; }
          game.send(game.engine.cmd.train(type));
        },
      };
    };
    const list = [];
    if (one.type === UNIT.commandCenter) list.push(train(UNIT.scv, 'S'));
    if (one.type === UNIT.barracks) list.push(train(UNIT.marine, 'M'));
    if (one.queue.length) list.push(cancel('마지막 생산 취소', () => game.send(game.engine.cmd.cancelQueue(254))));
    return list;
  }

  if (types.size === 1 && types.has(UNIT.scv)) {
    if (menu === 'build' && one) {
      const build = (type, pos, key) => {
        const t = game.engine.unitType(type);
        return {
          id: `build-${type}`, pos, icon: type, key, label: `${names[type]} 건설`, cost: `미네랄 ${t.minerals}`,
          run: () => {
            const why = game.needResources(type);
            if (why) { game.notice(why); return; }
            game.target('build', { type, button: `build-${type}` });
          },
        };
      };
      return [
        build(UNIT.commandCenter, 0, 'C'),
        build(UNIT.supplyDepot, 1, 'S'),
        build(UNIT.barracks, 3, 'B'),
        cancel('취소', () => { game.menu = null; game.mode = null; }),
      ];
    }
    return [
      ...basic,
      order('repair', 3, ICON.repair, 'R', '수리'),
      order('gather', 4, ICON.gather, 'G', '자원 채취'),
      { id: 'return', pos: 5, icon: ICON.returnCargo, key: 'C', label: '자원 반납', enabled: units.some((u) => u.carrying > 0), run: () => { game.send(game.engine.cmd.returnCargo()); game.acknowledge(); } },
      // Only a single SCV can be told to build.
      ...(one ? [{ id: 'build', pos: 6, icon: ICON.build, key: 'B', label: '기본 건물 짓기', run: () => { game.menu = 'build'; } }] : []),
    ];
  }

  // Groups of units (marines, SCVs together...): the shared orders.
  if (units.every((u) => !u.building)) return [...basic, ...patrolHold];
  return [];
}
