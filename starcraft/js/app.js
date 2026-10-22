// Page setup: password gate, menu, loading the engine and data, and starting matches.
import { Engine } from './engine.js';
import { Sound } from './sound.js';
import { Game, SoloLockstep } from './game.js';

const $ = (id) => document.getElementById(id);
const TERRAN = 1;
const DEFAULT_MAP = /crystallis/i;
// Command icons for the resource counters (Remastered's own small icons are DDS only):
// mineral field, then per race (Z, T, P) the gas building and the supply provider.
const RESOURCE_ICONS = { minerals: 176, gas: [149, 110, 157], supply: [42, 109, 156] };

let engine = null;
let game = null;
const sound = new Sound();

function showOnly(id) {
  for (const p of ['menu', 'loading', 'pause', 'result', 'gate']) $(p).hidden = p !== id;
}

function progress(text, loaded, total) {
  $('loading-text').textContent = text;
  $('loading-bar').style.width = total ? `${Math.round(loaded / total * 100)}%` : '0';
}

async function init() {
  showOnly('menu');
  try {
    engine = await Engine.load();
  } catch (err) {
    console.error(err);
    $('notice').textContent = `게임 데이터를 불러오지 못했어요 (${err.message}). 데이터 변환(npm run sc:pack)을 했는지 확인해 주세요.`;
    $('solo').textContent = '불러오기 실패';
    return;
  }
  const maps = engine.maps.filter((m) => m.players >= 2).sort((a, b) => a.players - b.players || a.name.localeCompare(b.name));
  const select = $('map');
  for (const m of maps) {
    const o = document.createElement('option');
    o.value = m.file;
    o.textContent = `${m.name}  ·  ${m.folder === '.' ? '기본' : m.folder}`;
    select.append(o);
  }
  const saved = localStorageGet('sc-map');
  const pick = maps.find((m) => m.file === saved) || maps.find((m) => DEFAULT_MAP.test(m.name)) || maps[0];
  if (pick) select.value = pick.file;
  $('solo').disabled = false;
  $('solo').textContent = '혼자 테스트 시작';
}

function localStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function localStorageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }

// Puts the original resource icons next to the counters.
function placeResourceIcons(race) {
  const frames = [RESOURCE_ICONS.minerals, RESOURCE_ICONS.gas[race], RESOURCE_ICONS.supply[race]];
  document.querySelectorAll('#resources .icon').forEach((el, i) => {
    const src = engine.icon(frames[i], 0);
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    el.replaceChildren(c);
  });
}

async function startSolo() {
  sound.unlock();
  const file = $('map').value;
  localStorageSet('sc-map', file);
  showOnly('loading');
  progress('맵 불러오는 중…');
  let slots;
  try {
    // ?seed=N replays the same start (positions, random rolls), for testing.
    const seed = Number(new URLSearchParams(location.search).get('seed')) || (Math.random() * 2 ** 32) >>> 0;
    slots = await engine.start(file, seed, [TERRAN, TERRAN], (l, t) => progress('타일셋 불러오는 중…', l, t));
  } catch (err) {
    showOnly('menu');
    $('notice').textContent = err.message;
    return;
  }
  const me = slots[0];
  engine.setViewer(me);
  $('loading').hidden = true;
  $('hud').hidden = false;
  placeResourceIcons(TERRAN);
  game = new Game({ engine, sound, me, slots, lockstep: new SoloLockstep(me), onEnd: onGameEvent });
  game.start();
  if (new URLSearchParams(location.search).has('debug')) window.sc = { engine, game };
}

function onGameEvent(kind) {
  if (kind === 'menu') { togglePause(); return; }
  $('result-title').textContent = kind === 'victory' ? '승리!' : '패배';
  $('result').hidden = false;
}

function togglePause() {
  if (!game) return;
  $('pause').hidden = !$('pause').hidden;
}

function quit() {
  game?.stop();
  game = null;
  $('hud').hidden = true;
  showOnly('menu');
  $('view').getContext('2d').clearRect(0, 0, 1e5, 1e5);
}

$('solo').onclick = startSolo;
$('menu-button').onclick = togglePause;
$('resume').onclick = togglePause;
$('quit').onclick = quit;
$('result-ok').onclick = quit;
$('fullscreen').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
  $('pause').hidden = true;
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'F10' && game) { e.preventDefault(); togglePause(); }
});

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// `SITE_PASSWORD=... npm run build` adds a password screen. Only the hash is in the page,
// so this keeps casual visitors out but is not real access control.
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
const remembered = () => localStorageGet('sc-pass') === PASSWORD_HASH;
if (!PASSWORD_HASH || remembered()) {
  init();
} else {
  showOnly('gate');
  $('gate-input').focus();
  $('gate').onsubmit = async (e) => {
    e.preventDefault();
    if (await sha256($('gate-input').value) !== PASSWORD_HASH) {
      $('gate-error').textContent = '비밀번호가 틀렸어요.';
      return;
    }
    localStorageSet('sc-pass', PASSWORD_HASH);
    init();
  };
}
