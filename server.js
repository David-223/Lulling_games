const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lulling123';
const DATA_FILE = path.join(__dirname, 'data', 'rules.json');
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');
const LOBBIES_FILE = path.join(__dirname, 'data', 'lobbies.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function readPlayers() {
  if (!fs.existsSync(PLAYERS_FILE)) return { players: [], nextId: 1 };
  return JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf-8'));
}

function writePlayers(data) {
  fs.writeFileSync(PLAYERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Players API ──

app.get('/api/players', (req, res) => {
  const data = readPlayers();
  res.json(data.players);
});

app.post('/api/players', (req, res) => {
  const { password, name, role } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Falsches Passwort' });
  if (!name || !role) return res.status(400).json({ error: 'Name und Rolle erforderlich' });
  const data = readPlayers();
  const player = { id: data.nextId, name: name.trim(), role, points: 100 };
  data.players.push(player);
  data.nextId += 1;
  writePlayers(data);
  res.status(201).json(player);
});

app.patch('/api/players/:id/points', (req, res) => {
  const { password, delta } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Falsches Passwort' });
  const id = parseInt(req.params.id);
  const data = readPlayers();
  const idx = data.players.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  data.players[idx].points = Math.max(0, data.players[idx].points + (parseInt(delta) || 0));
  writePlayers(data);
  res.json(data.players[idx]);
});

app.delete('/api/players/:id', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Falsches Passwort' });
  const id = parseInt(req.params.id);
  const data = readPlayers();
  const idx = data.players.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  data.players.splice(idx, 1);
  writePlayers(data);
  res.json({ success: true });
});

// ── Rules API ──

// GET alle Regeln
app.get('/api/rules', (req, res) => {
  const data = readData();
  res.json(data.rules);
});

// POST neue Regel (Admin)
app.post('/api/rules', (req, res) => {
  const { password, title, description, points } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Falsches Passwort' });
  }
  if (!title || !description) {
    return res.status(400).json({ error: 'Titel und Beschreibung erforderlich' });
  }
  const data = readData();
  const newRule = {
    id: data.nextId,
    points: (points !== undefined && points !== null && points !== '') ? (parseInt(points) || 0) : null,
    title: title.trim(),
    description: description.trim()
  };
  data.rules.push(newRule);
  data.nextId += 1;
  writeData(data);
  res.status(201).json(newRule);
});

// POST Regel kaufen (Spieler, kostet 100 Punkte)
app.post('/api/rules/buy', (req, res) => {
  const { playerId, title, description } = req.body;
  if (!playerId || !title || !description) {
    return res.status(400).json({ error: 'Spieler, Titel und Beschreibung erforderlich' });
  }
  const pdata = readPlayers();
  const pidx = pdata.players.findIndex(p => p.id === parseInt(playerId));
  if (pidx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  if (pdata.players[pidx].points < 100) {
    return res.status(400).json({ error: 'Nicht genug Punkte (100 benötigt)' });
  }
  pdata.players[pidx].points -= 100;
  writePlayers(pdata);
  const rdata = readData();
  const newRule = { id: rdata.nextId, points: null, title: title.trim(), description: description.trim() };
  rdata.rules.push(newRule);
  rdata.nextId += 1;
  writeData(rdata);
  res.status(201).json({ rule: newRule, player: pdata.players[pidx] });
});

// PUT Regel bearbeiten (Admin)
app.put('/api/rules/:id', (req, res) => {
  const { password, title, description, points } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Falsches Passwort' });
  }
  const id = parseInt(req.params.id);
  const data = readData();
  const idx = data.rules.findIndex(r => r.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Regel nicht gefunden' });
  }
  if (title) data.rules[idx].title = title.trim();
  if (description) data.rules[idx].description = description.trim();
  if (points !== undefined) data.rules[idx].points = (points === null || points === '') ? null : (parseInt(points) || 0);
  writeData(data);
  res.json(data.rules[idx]);
});

// DELETE Regel (Admin)
app.delete('/api/rules/:id', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Falsches Passwort' });
  }
  const id = parseInt(req.params.id);
  const data = readData();
  const idx = data.rules.findIndex(r => r.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Regel nicht gefunden' });
  }
  data.rules.splice(idx, 1);
  writeData(data);
  res.json({ success: true });
});

// Admin-Passwort prüfen
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Falsches Passwort' });
  }
});

// ── Lobby System ──

function readLobbies() {
  if (!fs.existsSync(LOBBIES_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(LOBBIES_FILE, 'utf-8')); } catch { return {}; }
}

function writeLobbies() {
  const obj = {};
  for (const [code, lobby] of lobbies) obj[code] = lobby;
  fs.writeFileSync(LOBBIES_FILE, JSON.stringify(obj, null, 2), 'utf-8');
}

const lobbies = new Map(Object.entries(readLobbies()));

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function cleanupOldLobbies() {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [code, lobby] of lobbies) {
    if (lobby.createdAt < cutoff) lobbies.delete(code);
  }
}

app.post('/api/lobby/create', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  cleanupOldLobbies();
  let code;
  do { code = generateCode(); } while (lobbies.has(code));
  const hostId = generateId();
  const lobby = {
    code,
    hostId,
    players: [{ id: hostId, name: name.trim(), isHost: true, joinedAt: Date.now() }],
    status: 'waiting',
    createdAt: Date.now()
  };
  lobbies.set(code, lobby);
  writeLobbies();
  res.json({ code, playerId: hostId, lobby });
});

app.post('/api/lobby/:code/join', (req, res) => {
  const code = req.params.code.toUpperCase();
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const lobby = lobbies.get(code);
  if (!lobby) return res.status(404).json({ error: 'Lobby nicht gefunden' });
  if (lobby.status !== 'waiting') return res.status(400).json({ error: 'Das Spiel hat bereits begonnen' });
  const playerId = generateId();
  lobby.players.push({ id: playerId, name: name.trim(), isHost: false, joinedAt: Date.now() });
  writeLobbies();
  res.json({ code, playerId, lobby });
});

app.get('/api/lobby/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const lobby = lobbies.get(code);
  if (!lobby) return res.status(404).json({ error: 'Lobby nicht gefunden' });
  res.json(lobby);
});

app.post('/api/lobby/:code/start', (req, res) => {
  const code = req.params.code.toUpperCase();
  const { playerId } = req.body;
  const lobby = lobbies.get(code);
  if (!lobby) return res.status(404).json({ error: 'Lobby nicht gefunden' });
  if (lobby.hostId !== playerId) return res.status(403).json({ error: 'Nur der Host kann das Spiel starten' });
  lobby.status = 'started';
  writeLobbies();

  // Alle Lobby-Spieler zu players.json hinzufügen (ersetzt vorherige Liste)
  const playerData = { players: [], nextId: 1 };
  for (const p of lobby.players) {
    playerData.players.push({ id: playerData.nextId, name: p.name, role: 'Normaler Mensch', points: 100 });
    playerData.nextId += 1;
  }
  writePlayers(playerData);

  res.json(lobby);
});

app.post('/api/lobby/:code/leave', (req, res) => {
  const code = req.params.code.toUpperCase();
  const { playerId } = req.body;
  const lobby = lobbies.get(code);
  if (!lobby) return res.json({ success: true });
  lobby.players = lobby.players.filter(p => p.id !== playerId);
  if (lobby.players.length === 0) {
    lobbies.delete(code);
  } else if (lobby.hostId === playerId) {
    lobby.hostId = lobby.players[0].id;
    lobby.players[0].isHost = true;
  }
  writeLobbies();
  res.json({ success: true });
});

app.post('/api/lobby/:code/end', (req, res) => {
  const code = req.params.code.toUpperCase();
  lobbies.delete(code);
  writeLobbies();
  res.json({ success: true });
});

// ── Poker ──

let pokerGame = null;

function pokerBuildToAct(game, startIdx) {
  const n = game.players.length;
  const result = [];
  let i = startIdx % n;
  for (let c = 0; c < n; c++) {
    const p = game.players[i];
    if (!p.folded && !p.allIn) result.push(i);
    i = (i + 1) % n;
  }
  return result;
}

function pokerAdvancePhase(game) {
  const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const idx = phases.indexOf(game.phase);
  if (idx < 0 || idx >= phases.length - 1) return;
  game.phase = phases[idx + 1];
  if (game.phase !== 'showdown') {
    game.currentBet = 0;
    game.players.forEach(p => { p.roundBet = 0; });
    const n = game.players.length;
    const toAct = pokerBuildToAct(game, (game.dealerIdx + 1) % n);
    if (toAct.length === 0) { pokerAdvancePhase(game); }
    else { game.toAct = toAct; game.currentPlayerIdx = toAct[0]; }
  } else {
    game.toAct = [];
    game.currentPlayerIdx = -1;
  }
}

app.post('/api/poker/new', (req, res) => {
  const { blindSmall, blindBig } = req.body;
  const pdata = readPlayers();
  if (pdata.players.length < 2) return res.status(400).json({ error: 'Mindestens 2 Spieler nötig' });
  pokerGame = {
    phase: 'setup',
    pot: 0, currentBet: 0,
    dealerIdx: 0, sbIdx: -1, bbIdx: -1, currentPlayerIdx: -1, toAct: [],
    players: pdata.players.map(p => ({
      id: p.id, name: p.name, chips: p.points,
      roundBet: 0, totalBet: 0, folded: false, allIn: false
    })),
    blindSmall: Math.max(1, parseInt(blindSmall) || 5),
    blindBig: Math.max(2, parseInt(blindBig) || 10),
    handNum: 0, winner: null, winnerId: null,
  };
  res.json(pokerGame);
});

app.post('/api/poker/deal', (req, res) => {
  if (!pokerGame) return res.status(400).json({ error: 'Kein Spiel' });
  const g = pokerGame;
  const n = g.players.length;
  if (g.handNum > 0) {
    let tries = 0;
    do { g.dealerIdx = (g.dealerIdx + 1) % n; tries++; }
    while (g.players[g.dealerIdx].chips <= 0 && tries < n);
  }
  g.handNum++;
  g.pot = 0; g.currentBet = 0; g.winner = null; g.winnerId = null; g.phase = 'preflop';
  g.players.forEach(p => { p.roundBet = 0; p.totalBet = 0; p.folded = p.chips <= 0; p.allIn = false; });

  let sbIdx = (g.dealerIdx + 1) % n;
  while (g.players[sbIdx].chips <= 0) sbIdx = (sbIdx + 1) % n;
  let bbIdx = (sbIdx + 1) % n;
  while (g.players[bbIdx].chips <= 0 || bbIdx === sbIdx) bbIdx = (bbIdx + 1) % n;

  const postBlind = (idx, amt) => {
    const actual = Math.min(amt, g.players[idx].chips);
    g.players[idx].chips -= actual; g.players[idx].roundBet = actual;
    g.players[idx].totalBet = actual; g.players[idx].allIn = g.players[idx].chips === 0;
    g.pot += actual; return actual;
  };
  postBlind(sbIdx, g.blindSmall);
  const bbPosted = postBlind(bbIdx, g.blindBig);
  g.currentBet = bbPosted; g.sbIdx = sbIdx; g.bbIdx = bbIdx;

  const utgIdx = (bbIdx + 1) % n;
  const toAct = pokerBuildToAct(g, utgIdx);
  if (!g.players[bbIdx].allIn) {
    const bbPos = toAct.indexOf(bbIdx);
    if (bbPos > 0) { toAct.splice(bbPos, 1); toAct.push(bbIdx); }
  }
  g.toAct = toAct;
  g.currentPlayerIdx = toAct[0] ?? -1;
  res.json(g);
});

app.get('/api/poker/state', (req, res) => {
  if (!pokerGame) return res.status(404).json({ error: 'Kein Spiel' });
  res.json(pokerGame);
});

app.post('/api/poker/action', (req, res) => {
  if (!pokerGame) return res.status(400).json({ error: 'Kein Spiel' });
  const g = pokerGame;
  if (!['preflop', 'flop', 'turn', 'river'].includes(g.phase))
    return res.status(400).json({ error: 'Keine Bettingrunde aktiv' });
  const { playerId, action, amount } = req.body;
  const pidx = g.players.findIndex(p => p.id === parseInt(playerId));
  if (pidx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  if (g.currentPlayerIdx !== pidx) return res.status(400).json({ error: 'Nicht dein Zug' });

  const p = g.players[pidx];
  const n = g.players.length;
  g.toAct.shift();

  if (action === 'fold') {
    p.folded = true;
    g.toAct = g.toAct.filter(i => i !== pidx);
  } else if (action === 'check') {
    if (p.roundBet < g.currentBet)
      return res.status(400).json({ error: `Calle ${g.currentBet - p.roundBet} oder raise` });
  } else if (action === 'call') {
    const toCall = Math.min(g.currentBet - p.roundBet, p.chips);
    p.chips -= toCall; p.roundBet += toCall; p.totalBet += toCall; g.pot += toCall;
    if (p.chips === 0) p.allIn = true;
  } else if (action === 'raise') {
    const raiseTo = parseInt(amount);
    if (!raiseTo || raiseTo <= g.currentBet)
      return res.status(400).json({ error: `Raise muss über ${g.currentBet} sein` });
    const actual = Math.min(raiseTo - p.roundBet, p.chips);
    p.chips -= actual; p.roundBet += actual; p.totalBet += actual; g.pot += actual;
    if (p.chips === 0) p.allIn = true;
    g.currentBet = p.roundBet;
    g.toAct = pokerBuildToAct(g, (pidx + 1) % n).filter(i => i !== pidx);
  } else if (action === 'allin') {
    const allInAmt = p.chips;
    p.chips = 0; p.roundBet += allInAmt; p.totalBet += allInAmt; g.pot += allInAmt; p.allIn = true;
    if (p.roundBet > g.currentBet) {
      g.currentBet = p.roundBet;
      g.toAct = pokerBuildToAct(g, (pidx + 1) % n).filter(i => i !== pidx);
    }
  } else {
    return res.status(400).json({ error: 'Unbekannte Aktion' });
  }

  const active = g.players.filter(p2 => !p2.folded);
  if (active.length === 1) {
    g.phase = 'showdown'; g.toAct = []; g.currentPlayerIdx = -1;
  } else if (g.toAct.length === 0) {
    g.currentPlayerIdx = -1; // betting done, wait for advance
  } else {
    g.currentPlayerIdx = g.toAct[0];
  }
  res.json(g);
});

app.post('/api/poker/advance', (req, res) => {
  if (!pokerGame) return res.status(400).json({ error: 'Kein Spiel' });
  if (pokerGame.toAct.length > 0) return res.status(400).json({ error: 'Bettingrunde noch nicht beendet' });
  pokerAdvancePhase(pokerGame);
  res.json(pokerGame);
});

app.post('/api/poker/winner', (req, res) => {
  if (!pokerGame) return res.status(400).json({ error: 'Kein Spiel' });
  const { winnerId } = req.body;
  const g = pokerGame;
  const widx = g.players.findIndex(p => p.id === parseInt(winnerId));
  if (widx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  g.players[widx].chips += g.pot;
  g.winner = g.players[widx].name;
  g.winnerId = parseInt(winnerId);
  g.pot = 0; g.phase = 'ended';
  const pdata = readPlayers();
  g.players.forEach(gp => { const pp = pdata.players.find(p => p.id === gp.id); if (pp) pp.points = gp.chips; });
  writePlayers(pdata);
  res.json(g);
});

app.post('/api/poker/end', (req, res) => {
  if (pokerGame) {
    const pdata = readPlayers();
    pokerGame.players.forEach(gp => { const pp = pdata.players.find(p => p.id === gp.id); if (pp) pp.points = gp.chips; });
    writePlayers(pdata);
  }
  pokerGame = null;
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚔  Lalling Games läuft auf Port ${PORT}`);
  console.log(`   Lokal:   http://localhost:${PORT}`);
  console.log(`   Admin:   http://localhost:${PORT}/admin.html`);
  console.log(`   Passwort: ${ADMIN_PASSWORD}\n`);
});
