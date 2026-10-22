// Page setup: password gate, menu, online lobby, loading the engine and data, and starting matches.
import { Engine } from './engine.js';
import { Sound } from './sound.js';
import { Game, SoloLockstep } from './game.js';
import { NetLockstep } from './lockstep.js';
import { Net, netErrorText } from './net.js';

const $ = (id) => document.getElementById(id);
const TERRAN = 1;
const DEFAULT_MAP = /crystallis/i;
// Command icons for the resource counters (Remastered's own small icons are DDS only):
// mineral field, then per race (Z, T, P) the gas building and the supply provider.
const RESOURCE_ICONS = { minerals: 176, gas: [149, 110, 157], supply: [42, 109, 156] };
const PANELS = ['menu', 'loading', 'pause', 'result', 'gate', 'lobby'];

let engine = null;
let game = null;
let maps = [];
const sound = new Sound();
const params = new URLSearchParams(location.search);

function showOnly(id) {
  for (const p of PANELS) $(p).hidden = p !== id;
}

function progress(text, loaded, total) {
  $('loading-text').textContent = text;
  $('loading-bar').style.width = total ? `${Math.round(loaded / total * 100)}%` : '0';
}

function localStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function localStorageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }

function fillMaps(select) {
  for (const m of maps) {
    const o = document.createElement('option');
    o.value = m.file;
    o.textContent = `${m.name}  ·  ${m.folder === '.' ? '기본' : m.folder}`;
    select.append(o);
  }
  const saved = localStorageGet('sc-map');
  const pick = maps.find((m) => m.file === saved) || maps.find((m) => DEFAULT_MAP.test(m.name)) || maps[0];
  if (pick) select.value = pick.file;
}

const mapName = (file) => maps.find((m) => m.file === file)?.name || file;

async function init() {
  showOnly('menu');
  $('player-name').value = localStorageGet('sc-name') || '';
  try {
    engine = await Engine.load();
  } catch (err) {
    console.error(err);
    $('notice').textContent = `게임 데이터를 불러오지 못했어요 (${err.message}). 데이터 변환(npm run sc:pack)을 했는지 확인해 주세요.`;
    $('solo').textContent = '불러오기 실패';
    return;
  }
  maps = engine.maps.filter((m) => m.players >= 2).sort((a, b) => a.players - b.players || a.name.localeCompare(b.name));
  fillMaps($('map'));
  fillMaps($('lobby-map'));
  $('solo').disabled = false;
  $('solo').textContent = '혼자 테스트 시작';
  $('host').disabled = false;
  $('join').disabled = false;
}

// Puts icons next to the resource counters.
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

// Loads the map and starts a game. `me` is this player's index; `makeLockstep` builds the
// command channel once the game slots are known.
async function launch({ file, seed, players, me, makeLockstep }) {
  sound.unlock();
  showOnly('loading');
  progress(`${mapName(file)} 불러오는 중…`);
  const slots = await engine.start(file, seed, players.map(() => TERRAN), (l, t) => progress('타일셋 불러오는 중…', l, t));
  const mySlot = slots[me];
  engine.setViewer(mySlot);
  $('loading').hidden = true;
  $('hud').hidden = false;
  showBanner('');
  placeResourceIcons(TERRAN);
  game = new Game({ engine, sound, me: mySlot, slots, lockstep: makeLockstep(slots, mySlot), onEnd: onGameEvent });
  game.start();
  if (params.has('debug')) window.sc = { engine, game, online };
}

async function startSolo() {
  const file = $('map').value;
  localStorageSet('sc-map', file);
  // ?seed=N replays the same start (positions, random rolls), for testing.
  const seed = Number(params.get('seed')) || (Math.random() * 2 ** 32) >>> 0;
  try {
    await launch({ file, seed, players: [0, 1], me: 0, makeLockstep: (slots, mySlot) => new SoloLockstep(mySlot) });
  } catch (err) {
    showOnly('menu');
    $('notice').textContent = err.message;
  }
}

function onGameEvent(kind) {
  if (kind === 'menu') { togglePause(); return; }
  $('result-title').textContent = kind === 'victory' ? '승리!' : kind === 'left' ? '상대가 나갔어요. 승리!' : '패배';
  $('result').hidden = false;
  $('result-ok').textContent = online ? '대기실로' : '메뉴로';
}

function togglePause() {
  if (!game) return;
  $('pause').hidden = !$('pause').hidden;
  $('quit').textContent = online ? '항복하고 나가기' : '나가기';
}

function endGame() {
  game?.stop();
  game = null;
  if (online) online.lockstep = null;
  $('hud').hidden = true;
  $('pause').hidden = true;
  $('result').hidden = true;
  $('view').getContext('2d').clearRect(0, 0, 1e5, 1e5);
}

function quit() {
  if (online && game && !game.ended) online.net.send({ t: 'leave' });
  endGame();
  if (online) showLobby();
  else showOnly('menu');
}

// ---- online: room, lobby, match ----

let online = null; // { role, net, code, hostName, guestName, map, lockstep }

function playerName() {
  const name = $('player-name').value.trim();
  if (!name) {
    netStatus('이름을 먼저 적어 주세요.');
    $('player-name').focus();
    return null;
  }
  localStorageSet('sc-name', name);
  return name;
}

function netStatus(text) { $('net-status').textContent = text; }
function lobbyStatus(text) { $('lobby-status').textContent = text; }

function showBanner(text) {
  $('net-banner').textContent = text;
  $('net-banner').hidden = !text;
}

// A short beep when the friend arrives.
function chime() {
  if (!sound.ctx) return;
  const o = sound.ctx.createOscillator(), g = sound.ctx.createGain();
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.15, sound.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, sound.ctx.currentTime + 0.4);
  o.connect(g).connect(sound.ctx.destination);
  o.start();
  o.stop(sound.ctx.currentTime + 0.4);
}

function showLobby() {
  showOnly('lobby');
  renderLobby();
}

function renderLobby() {
  if (!online) return;
  const host = online.role === 'host';
  $('lobby-code').textContent = online.code || '';
  const li = (text, empty) => Object.assign(document.createElement('li'), { textContent: text, className: empty ? 'empty' : '' });
  $('lobby-players').replaceChildren(
    li(`${online.hostName || '방장'} (방장)`),
    online.guestName ? li(online.guestName) : li('친구를 기다리는 중…', true),
  );
  $('lobby-map-label').hidden = !host;
  $('lobby-map-name').textContent = host ? '' : `맵: ${online.map ? mapName(online.map) : '방장이 고르는 중'}`;
  $('lobby-start').hidden = !host;
  $('lobby-start').disabled = !online.guestName;
}

function openNet(role) {
  return new Net({
    onIncoming: () => lobbyStatus('친구가 들어오는 중…'),
    onConnected: () => online.net.send({ t: 'hello', name: online.guestName }),
    onMessage: (m) => (role === 'host' ? onHostMessage(m) : onGuestMessage(m)),
    onClosed: friendLeft,
    onError: (err) => { leaveOnline(); netStatus(netErrorText(err)); },
    onLost: () => (game ? showBanner('상대 연결이 끊겼어요. 다시 들어오기를 기다리는 중… (최대 1분)') : lobbyStatus('상대 연결이 잠깐 끊겼어요…')),
    onBack: () => { showBanner(''); lobbyStatus(''); },
  });
}

async function hostRoom() {
  const name = playerName();
  if (!name) return;
  sound.unlock();
  netStatus('방 만드는 중…');
  online = { role: 'host', hostName: name, guestName: null, map: $('lobby-map').value };
  online.net = openNet('host');
  try {
    online.code = await online.net.host();
  } catch (err) {
    leaveOnline();
    netStatus(netErrorText(err));
    return;
  }
  netStatus('');
  lobbyStatus('친구에게 방 코드를 알려 주세요.');
  showLobby();
}

async function joinRoom() {
  const name = playerName();
  if (!name) return;
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 5) { netStatus('방 코드 5자리를 적어 주세요.'); return; }
  sound.unlock();
  netStatus('방 찾는 중…');
  online = { role: 'guest', guestName: name, code };
  online.net = openNet('guest');
  try {
    await online.net.join(code);
  } catch (err) {
    leaveOnline();
    netStatus(netErrorText(err));
    return;
  }
  netStatus('');
  lobbyStatus('방장이 게임을 시작하기를 기다리는 중…');
  showLobby();
}

const lobbyInfo = () => ({ t: 'lobby', host: online.hostName, guest: online.guestName, map: online.map });

function onHostMessage(m) {
  if (m.t === 'hello') {
    online.guestName = String(m.name || '친구').slice(0, 10);
    online.net.send(lobbyInfo());
    chime();
    lobbyStatus(`${online.guestName} 님이 들어왔어요.`);
    renderLobby();
  } else {
    gameMessage(m);
  }
}

function onGuestMessage(m) {
  if (m.t === 'lobby') {
    Object.assign(online, { hostName: m.host, map: m.map });
    renderLobby();
  } else if (m.t === 'start') {
    online.map = m.map;
    startOnline(m.map, m.seed);
  } else if (m.t === 'lobby-back') {
    endGame();
    showLobby();
  } else {
    gameMessage(m);
  }
}

// Messages during a match: lockstep packets and a surrender.
function gameMessage(m) {
  if (m.t === 'turn' || m.t === 'need') online.lockstep?.receive(m);
  else if (m.t === 'leave' && game && !game.ended) { game.ended = true; onGameEvent('left'); }
}

function startHostMatch() {
  online.map = $('lobby-map').value;
  localStorageSet('sc-map', online.map);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  online.net.send({ t: 'start', map: online.map, seed });
  startOnline(online.map, seed);
}

async function startOnline(file, seed) {
  const me = online.role === 'host' ? 0 : 1;
  // The lockstep exists before loading so packets that arrive meanwhile are kept.
  const lockstep = new NetLockstep({
    net: online.net, me, slots: [0, 1],
    onDesync: (frame) => showBanner(`게임이 서로 어긋났어요 (프레임 ${frame}). 이 판은 두 화면의 결과가 다를 수 있어요.`),
  });
  online.lockstep = lockstep;
  try {
    await launch({ file, seed, players: [0, 1], me, makeLockstep: (slots) => { lockstep.slots = slots; return lockstep; } });
  } catch (err) {
    online.lockstep = null;
    showLobby();
    lobbyStatus(err.message);
  }
}

function friendLeft() {
  if (!online) return;
  if (online.role === 'host') {
    online.guestName = null;
    online.net.dropGuest();
    if (game && !game.ended) { game.ended = true; onGameEvent('left'); }
    lobbyStatus('친구가 나갔어요. 같은 코드로 다시 들어올 수 있어요.');
    renderLobby();
  } else {
    if (game && !game.ended) { game.ended = true; onGameEvent('left'); }
    leaveOnline();
    netStatus('방장이 방을 닫았어요.');
  }
}

function leaveOnline() {
  online?.net?.close();
  online = null;
  endGame();
  showOnly('menu');
}

function resultOk() {
  endGame();
  if (online) {
    if (online.role === 'host') online.net.send({ t: 'lobby-back' });
    showLobby();
  } else {
    showOnly('menu');
  }
}

$('solo').onclick = startSolo;
$('host').onclick = hostRoom;
$('join').onclick = joinRoom;
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('lobby-start').onclick = startHostMatch;
$('lobby-leave').onclick = leaveOnline;
$('lobby-map').onchange = () => { online.map = $('lobby-map').value; online.net.send(lobbyInfo()); };
$('copy-code').onclick = () => navigator.clipboard?.writeText(online?.code || '').then(() => lobbyStatus('복사했어요.'), () => {});
$('menu-button').onclick = togglePause;
$('resume').onclick = togglePause;
$('quit').onclick = quit;
$('result-ok').onclick = resultOk;
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
