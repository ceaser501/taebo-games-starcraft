// Page setup: password gate, menu, online lobby, loading the engine and data, and starting matches.
import { Engine } from './engine.js';
import { ConsoleUI } from './console-ui.js';
import { Sound } from './sound.js';
import { Game, SoloLockstep } from './game.js';
import { NetLockstep } from './lockstep.js';
import { Net, netErrorText } from './net.js';

const $ = (id) => document.getElementById(id);
// Races as the game numbers them; -1 picks one at random when the match starts.
const RACE_NAMES = { 0: 'Zerg', 1: 'Terran', 2: 'Protoss', '-1': 'Random' };
const RACE_KO = { 0: '저그', 1: '테란', 2: '프로토스', '-1': '랜덤' };
const pickRace = (r) => (r >= 0 ? r : Math.floor(Math.random() * 3));
const DEFAULT_MAP = /heartbreak ridge/i; // a standard 1:1 map with gas
const PANELS = ['menu', 'loading', 'gate', 'lobby'];

let engine = null;
let ui = null;
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
  $('race').value = localStorageGet('sc-race') ?? '1';
  $('enemy-race').value = localStorageGet('sc-enemy-race') ?? '1';
  try {
    [engine, ui] = await Promise.all([Engine.load(), ConsoleUI.load()]);
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

// Loads the map and starts a game. `me` is this player's index; `makeLockstep` builds the
// command channel once the game slots are known.
async function launch({ file, seed, races, me, cheats = false, names = [], onChat, makeLockstep }) {
  sound.unlock();
  showOnly('loading');
  progress(`${mapName(file)} 불러오는 중…`);
  const slots = await engine.start(file, seed, races, (l, t) => progress('타일셋 불러오는 중…', l, t));
  const mySlot = slots[me];
  engine.setViewer(mySlot);
  $('loading').hidden = true;
  // Names by game slot, for chat lines.
  const slotNames = [];
  slots.forEach((slot, i) => { slotNames[slot] = names[i]; });
  game = new Game({ engine, ui, sound, me: mySlot, slots, race: races[me], cheats, names: slotNames, onChat, online: !!online, lockstep: makeLockstep(slots, mySlot), onEnd: onGameEvent });
  game.start();
  if (params.has('debug')) window.sc = { engine, game, online };
}

async function startSolo() {
  const file = $('map').value;
  localStorageSet('sc-map', file);
  // ?seed=N replays the same start (positions, random rolls), for testing.
  const seed = Number(params.get('seed')) || (Math.random() * 2 ** 32) >>> 0;
  try {
    const name = $('player-name').value.trim() || 'Player';
    localStorageSet('sc-race', $('race').value);
    localStorageSet('sc-enemy-race', $('enemy-race').value);
    const races = [pickRace(Number($('race').value)), pickRace(Number($('enemy-race').value))];
    await launch({ file, seed, races, me: 0, cheats: true, names: [name, 'Computer'], makeLockstep: (slots, mySlot) => new SoloLockstep(mySlot) });
  } catch (err) {
    showOnly('menu');
    $('notice').textContent = err.message;
  }
}

// From the game: 'quit' (Quit Mission / Surrender), 'continue' (after victory or defeat).
function onGameEvent(kind) {
  if (kind === 'quit') quit();
  else if (kind === 'continue') resultOk();
}

// The opponent left: the remaining player wins.
function opponentLeft() {
  if (!game || game.ended) return;
  game.ended = true;
  game.showResult('left');
}

function endGame() {
  game?.stop();
  game = null;
  if (online) online.lockstep = null;
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

// A line of status text in the game's message area (connection trouble, desync).
function showBanner(text) {
  if (game) game.banner = text;
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
  const race = (r) => RACE_KO[r ?? 1];
  $('lobby-players').replaceChildren(
    li(`${online.hostName || '방장'} (방장) · ${race(online.hostRace)}`),
    online.guestName ? li(`${online.guestName} · ${race(online.guestRace)}`) : li('친구를 기다리는 중…', true),
  );
  $('lobby-race').value = String(host ? online.hostRace : online.guestRace);
  $('lobby-map-label').hidden = !host;
  $('lobby-map-name').textContent = host ? '' : `맵: ${online.map ? mapName(online.map) : '방장이 고르는 중'}`;
  $('lobby-start').hidden = !host;
  $('lobby-start').disabled = !online.guestName;
}

function openNet(role) {
  return new Net({
    onIncoming: () => lobbyStatus('친구가 들어오는 중…'),
    onConnected: () => online.net.send({ t: 'hello', name: online.guestName, race: online.guestRace }),
    onMessage: (m) => (role === 'host' ? onHostMessage(m) : onGuestMessage(m)),
    onClosed: friendLeft,
    onError: (err) => { leaveOnline(); netStatus(netErrorText(err)); },
    onLost: () => (game ? showBanner('Opponent disconnected. Waiting up to 1 minute...') : lobbyStatus('상대 연결이 잠깐 끊겼어요…')),
    onBack: () => { showBanner(''); lobbyStatus(''); },
  });
}

async function hostRoom() {
  const name = playerName();
  if (!name) return;
  sound.unlock();
  netStatus('방 만드는 중…');
  online = { role: 'host', hostName: name, guestName: null, map: $('lobby-map').value, hostRace: myRace(), guestRace: 1 };
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
  online = { role: 'guest', guestName: name, code, guestRace: myRace(), hostRace: 1 };
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

const lobbyInfo = () => ({ t: 'lobby', host: online.hostName, guest: online.guestName, map: online.map, hostRace: online.hostRace, guestRace: online.guestRace });
const validRace = (r) => ([-1, 0, 1, 2].includes(Number(r)) ? Number(r) : 1);
function myRace() {
  localStorageSet('sc-race', $('race').value);
  return validRace($('race').value);
}

function onHostMessage(m) {
  if (m.t === 'hello') {
    online.guestName = String(m.name || '친구').slice(0, 10);
    online.guestRace = validRace(m.race);
    online.net.send(lobbyInfo());
    chime();
    lobbyStatus(`${online.guestName} 님이 들어왔어요.`);
    renderLobby();
  } else if (m.t === 'race') {
    online.guestRace = validRace(m.race);
    online.net.send(lobbyInfo());
    renderLobby();
  } else {
    gameMessage(m);
  }
}

function onGuestMessage(m) {
  if (m.t === 'lobby') {
    Object.assign(online, { hostName: m.host, map: m.map, hostRace: validRace(m.hostRace), guestRace: validRace(m.guestRace) });
    renderLobby();
  } else if (m.t === 'start') {
    online.map = m.map;
    startOnline(m.map, m.seed, m.races.map(validRace));
  } else if (m.t === 'lobby-back') {
    endGame();
    showLobby();
  } else {
    gameMessage(m);
  }
}

// Messages during a match: lockstep packets, chat and a surrender.
function gameMessage(m) {
  if (m.t === 'turn' || m.t === 'need') online.lockstep?.receive(m);
  else if (m.t === 'chat' && game) game.showChat(game.slots[online.role === 'host' ? 1 : 0], String(m.text).slice(0, 80));
  else if (m.t === 'leave') opponentLeft();
}

function startHostMatch() {
  online.map = $('lobby-map').value;
  localStorageSet('sc-map', online.map);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  // Random races are settled here, so both computers start the same game.
  const races = [pickRace(online.hostRace), pickRace(online.guestRace)];
  online.net.send({ t: 'start', map: online.map, seed, races });
  startOnline(online.map, seed, races);
}

async function startOnline(file, seed, races) {
  const me = online.role === 'host' ? 0 : 1;
  // The lockstep exists before loading so packets that arrive meanwhile are kept.
  const lockstep = new NetLockstep({
    net: online.net, me, slots: [0, 1],
    onDesync: (frame) => showBanner(`Game out of sync at frame ${frame}.`),
  });
  online.lockstep = lockstep;
  try {
    await launch({
      file, seed, races, me, names: [online.hostName, online.guestName],
      onChat: (text) => online?.net.send({ t: 'chat', text }),
      makeLockstep: (slots) => { lockstep.slots = slots; return lockstep; },
    });
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
    opponentLeft();
    lobbyStatus('친구가 나갔어요. 같은 코드로 다시 들어올 수 있어요.');
    renderLobby();
  } else {
    opponentLeft();
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
$('lobby-race').onchange = () => {
  const race = validRace($('lobby-race').value);
  $('race').value = String(race);
  localStorageSet('sc-race', String(race));
  if (online.role === 'host') { online.hostRace = race; online.net.send(lobbyInfo()); }
  else { online.guestRace = race; online.net.send({ t: 'race', race }); }
  renderLobby();
};
$('copy-code').onclick = () => navigator.clipboard?.writeText(online?.code || '').then(() => lobbyStatus('복사했어요.'), () => {});
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
