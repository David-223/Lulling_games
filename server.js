const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lulling123';
const DATA_FILE = path.join(__dirname, 'data', 'rules.json');
const PLAYERS_FILE = path.join(__dirname, 'data', 'players.json');

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

// ── Admin auth helper ──

function checkAdminAuth(body) {
  const { password, adminPlayerId } = body || {};
  if (password === ADMIN_PASSWORD) return true;
  if (adminPlayerId) {
    const data = readPlayers();
    const player = data.players.find(p => p.id === parseInt(adminPlayerId));
    return !!(player && player.isAdmin);
  }
  return false;
}

// ── Roster (pre-defined player list with PINs) ──

const ROSTER_FILE = path.join(__dirname, 'data', 'roster.json');

function readRoster() {
  if (!fs.existsSync(ROSTER_FILE)) return { players: [] };
  return JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf-8'));
}
function writeRoster(data) {
  fs.writeFileSync(ROSTER_FILE, JSON.stringify(data, null, 2));
}

// Public: names + domainIdx only (no PINs)
app.get('/api/roster', (req, res) => {
  const { players } = readRoster();
  res.json(players.map(({ pin, ...rest }) => rest));
});

// Admin: full list including PINs
app.get('/api/roster/admin', (req, res) => {
  if (!checkAdminAuth(req.query)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const active = readPlayers().players;
  const { players } = readRoster();
  res.json(players.map(p => ({
    ...p,
    active: active.some(a => a.rosterPlayerId === p.id),
  })));
});

// Check in: validate PIN → register into active players
app.post('/api/roster/checkin', (req, res) => {
  const { name, pin } = req.body;
  const { players: roster } = readRoster();
  const entry = roster.find(p => p.name.toLowerCase() === (name || '').trim().toLowerCase());
  if (!entry) return res.status(404).json({ error: 'Name nicht in der Spielerliste' });
  if (String(entry.pin) !== String(pin).trim()) return res.status(401).json({ error: 'Falscher PIN' });

  const ALWAYS_ADMIN = ['david', 'felix'];
  const isAdmin = ALWAYS_ADMIN.includes(entry.name.toLowerCase());

  const pdata = readPlayers();
  let player = pdata.players.find(p => p.rosterPlayerId === entry.id);
  if (!player) {
    player = {
      id: pdata.nextId++,
      name: entry.name,
      role: 'Normaler Mensch',
      points: 1000,
      domainCoins: 3,
      isAdmin,
      domainIdx: entry.domainIdx,
      rosterPlayerId: entry.id,
    };
    pdata.players.push(player);
  } else {
    player.domainIdx = entry.domainIdx; // sync domain in case admin changed it
    player.isAdmin = isAdmin;            // always enforce admin status on login
  }
  writePlayers(pdata);
  res.json(player);
});

// Admin: change domain assignment for a roster player
app.patch('/api/roster/:id/domain', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const id = parseInt(req.params.id);
  const domainIdx = parseInt(req.body.domainIdx);
  const { players: roster } = readRoster();
  const entry = roster.find(p => p.id === id);
  if (!entry) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  entry.domainIdx = domainIdx;
  writeRoster({ players: roster });
  // Sync into active players if already checked in
  const pdata = readPlayers();
  const active = pdata.players.find(p => p.rosterPlayerId === id);
  if (active) { active.domainIdx = domainIdx; writePlayers(pdata); }
  res.json(entry);
});

// ── Players API ──

app.get('/api/players', (req, res) => {
  const data = readPlayers();
  const { players: roster } = readRoster();
  // Always sync domainIdx from roster so changes take effect without re-login
  let dirty = false;
  data.players.forEach(p => {
    const entry = roster.find(r => r.id === p.rosterPlayerId);
    if (entry && entry.domainIdx !== undefined && p.domainIdx !== entry.domainIdx) {
      p.domainIdx = entry.domainIdx;
      dirty = true;
    }
  });
  if (dirty) writePlayers(data);
  res.json(data.players);
});

app.post('/api/players', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { name, role } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'Name und Rolle erforderlich' });
  const data = readPlayers();
  const player = { id: data.nextId, name: name.trim(), role, points: 1000, isAdmin: false };
  data.players.push(player);
  data.nextId += 1;
  writePlayers(data);
  res.status(201).json(player);
});

app.patch('/api/players/:id/points', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { delta } = req.body;
  const id = parseInt(req.params.id);
  const data = readPlayers();
  const idx = data.players.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  data.players[idx].points = Math.max(0, data.players[idx].points + (parseInt(delta) || 0));
  writePlayers(data);
  res.json(data.players[idx]);
});

app.patch('/api/players/:id/admin', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const id = parseInt(req.params.id);
  const data = readPlayers();
  const idx = data.players.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  data.players[idx].isAdmin = !data.players[idx].isAdmin;
  writePlayers(data);
  res.json(data.players[idx]);
});

app.delete('/api/players/:id', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const id = parseInt(req.params.id);
  const data = readPlayers();
  const idx = data.players.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  data.players.splice(idx, 1);
  writePlayers(data);
  res.json({ success: true });
});

// Public self-registration: returns existing player by name or creates a new one
app.post('/api/players/register', (req, res) => {
  const { name, role } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const data = readPlayers();
  const existing = data.players.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return res.json(existing);
  const player = { id: data.nextId, name: name.trim(), role: role || 'Normaler Mensch', points: 1000, isAdmin: false };
  data.players.push(player);
  data.nextId += 1;
  writePlayers(data);
  res.status(201).json(player);
});

// ── Rules API ──

// GET alle Regeln
app.get('/api/rules', (req, res) => {
  const data = readData();
  res.json(data.rules);
});

// POST neue Regel (Admin)
app.post('/api/rules', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { title, description, points } = req.body;
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

// POST Regel kaufen (Spieler, kostet 670 Punkte)
app.post('/api/rules/buy', (req, res) => {
  const { playerId, title, description } = req.body;
  if (!playerId || !title || !description) {
    return res.status(400).json({ error: 'Spieler, Titel und Beschreibung erforderlich' });
  }
  const pdata = readPlayers();
  const pidx = pdata.players.findIndex(p => p.id === parseInt(playerId));
  if (pidx === -1) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  if (pdata.players[pidx].points < 670) {
    return res.status(400).json({ error: 'Nicht genug Punkte (670 benötigt)' });
  }
  pdata.players[pidx].points -= 670;
  writePlayers(pdata);
  // Keep in-memory poker chips in sync so the deduction isn't overwritten at showdown
  if (pokerGame) {
    const gp = pokerGame.players.find(p => p.id === parseInt(playerId));
    if (gp) gp.chips = Math.max(0, gp.chips - 670);
  }
  const rdata = readData();
  const newRule = { id: rdata.nextId, points: null, title: title.trim(), description: description.trim() };
  rdata.rules.push(newRule);
  rdata.nextId += 1;
  writeData(rdata);
  res.status(201).json({ rule: newRule, player: pdata.players[pidx] });
});

// PUT Regel bearbeiten (Admin)
app.put('/api/rules/:id', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { title, description, points } = req.body;
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
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
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
  if (checkAdminAuth(req.body)) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Falsches Passwort' });
  }
});

// ── Poker ──

const BOUNTIES_FILE = path.join(__dirname, 'data', 'bounties.json');
const BOUNTIES_DEFAULT = [
  { id: 1,  spirit: 'Jogo',   condition: 'Wer als nächster foldet, trinkt 3 Schlücke.' },
  { id: 2,  spirit: 'Jogo',   condition: 'Wer raised, ohne zu gewinnen, trinkt 2 Schlücke.' },
  { id: 3,  spirit: 'Hanami', condition: 'Der Gewinner verteilt 4 Schlücke frei.' },
  { id: 4,  spirit: 'Hanami', condition: 'Wer als erster checked, trinkt 2 Schlücke.' },
  { id: 5,  spirit: 'Dagon',  condition: 'Wer die wenigsten Chips hat und foldet, trinkt 3 Schlücke.' },
  { id: 6,  spirit: 'Dagon',  condition: 'Alle aktiven Spieler trinken 1 Schluck vor ihrer ersten Aktion.' },
  { id: 7,  spirit: 'Choso',  condition: 'Wer mehr als einmal raised, trinkt 3 Schlücke.' },
  { id: 8,  spirit: 'Choso',  condition: 'Der Verlierer trinkt 2 Schlücke extra.' },
  { id: 9,  spirit: 'Rika',   condition: 'Wer allin geht und verliert, trinkt 5 Schlücke.' },
  { id: 10, spirit: 'Rika',   condition: 'Wer foldet ohne jemals geraised zu haben, trinkt 2 Schlücke.' },
  { id: 11, spirit: 'Mahito', condition: 'Alle zahlen 1 Schluck Eintritt vor dem Preflop.' },
  { id: 12, spirit: 'Mahito', condition: 'Wer nach dem River foldet, trinkt 4 Schlücke.' },
];

function readBounties() {
  if (!fs.existsSync(BOUNTIES_FILE)) return { entries: BOUNTIES_DEFAULT, nextId: 13 };
  return JSON.parse(fs.readFileSync(BOUNTIES_FILE, 'utf-8'));
}

function writeBounties(data) {
  fs.writeFileSync(BOUNTIES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/bounties', (req, res) => {
  res.json(readBounties().entries);
});

app.post('/api/bounties', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { spirit, condition } = req.body;
  if (!spirit || !condition) return res.status(400).json({ error: 'Spirit und Bedingung erforderlich' });
  const data = readBounties();
  const entry = { id: data.nextId++, spirit: spirit.trim(), condition: condition.trim() };
  data.entries.push(entry);
  writeBounties(data);
  res.status(201).json(entry);
});

app.put('/api/bounties/:id', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const id = parseInt(req.params.id);
  const { spirit, condition } = req.body;
  const data = readBounties();
  const idx = data.entries.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
  if (spirit)    data.entries[idx].spirit    = spirit.trim();
  if (condition) data.entries[idx].condition = condition.trim();
  writeBounties(data);
  res.json(data.entries[idx]);
});

app.delete('/api/bounties/:id', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const id = parseInt(req.params.id);
  const data = readBounties();
  const idx = data.entries.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
  data.entries.splice(idx, 1);
  writeBounties(data);
  res.json({ success: true });
});

let pokerGame = null;
let pendingDomainActivation = null; // { playerId, playerName, domain }

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
  const stngs = readSettings();
  if (pdata.players.length < 2) return res.status(400).json({ error: 'Mindestens 2 Spieler nötig' });

  // Dealer-Position vom letzten Spiel wiederherstellen
  let startDealerIdx = 0;
  if (stngs.nextDealerPlayerId) {
    const idx = pdata.players.findIndex(p => p.id === stngs.nextDealerPlayerId);
    if (idx !== -1) startDealerIdx = idx;
  }

  pokerGame = {
    phase: 'setup',
    pot: 0, currentBet: 0,
    dealerIdx: startDealerIdx, sbIdx: -1, bbIdx: -1, currentPlayerIdx: -1, toAct: [],
    players: pdata.players.map(p => ({
      id: p.id, name: p.name, chips: p.points,
      roundBet: 0, totalBet: 0, folded: false, allIn: false
    })),
    blindSmall: Math.max(1, parseInt(blindSmall) || stngs.blindSmall || 5),
    blindBig: Math.max(2, parseInt(blindBig) || stngs.blindBig || 10),
    handNum: 0, winner: null, winnerId: null,
    awayEvents: [], sipTotals: {},
  };
  res.json(pokerGame);
});

app.post('/api/poker/deal', (req, res) => {
  if (!pokerGame) return res.status(400).json({ error: 'Kein Spiel' });
  const g = pokerGame;
  const n = g.players.length;

  // Need at least 2 players with chips to start a new hand
  const activePlayers = g.players.filter(p => p.chips > 0);
  if (activePlayers.length < 2) {
    return res.status(400).json({ error: 'Zu wenige Spieler mit Punkten — Spiel beenden!' });
  }

  if (g.handNum > 0) {
    let tries = 0;
    do { g.dealerIdx = (g.dealerIdx + 1) % n; tries++; }
    while (g.players[g.dealerIdx].chips <= 0 && tries < n);
  }
  g.handNum++;
  g.pot = 0; g.currentBet = 0; g.winner = null; g.winnerId = null; g.phase = 'preflop';
  g.awayEvents = [];
  g.players.forEach(p => { p.roundBet = 0; p.totalBet = 0; p.folded = p.chips <= 0; p.allIn = false; });

  // Record chips at start of hand for drink calculation later
  g.handStartChips = {};
  g.players.forEach(p => { g.handStartChips[p.id] = p.chips; });

  let sbIdx = (g.dealerIdx + 1) % n;
  let sbTries = 0;
  while (g.players[sbIdx].chips <= 0 && sbTries < n) { sbIdx = (sbIdx + 1) % n; sbTries++; }
  let bbIdx = (sbIdx + 1) % n;
  let bbTries = 0;
  while ((g.players[bbIdx].chips <= 0 || bbIdx === sbIdx) && bbTries < n) { bbIdx = (bbIdx + 1) % n; bbTries++; }

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

  // Deal cards if enabled
  const settings = readSettings();
  g.cardsEnabled = settings.cardsEnabled;
  g._holeCards = {};
  g._communityCards = [];
  if (settings.cardsEnabled) {
    const deck = shuffleDeck(createDeck());
    const activePlayers = g.players.filter(p => !p.folded);
    // deal 2 hole cards to each active player
    for (const p of activePlayers) {
      g._holeCards[p.id] = [deck.pop(), deck.pop()];
    }
    // burn 1, set aside 5 community cards
    deck.pop();
    g._communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  }

  // Domain Expansion: manual activation takes priority, otherwise 20% random chance
  g.domainExpansion = null;
  if (pendingDomainActivation) {
    g.domainExpansion = pendingDomainActivation.domain;
    pendingDomainActivation = null;
  } else if (Math.random() < 0.20) {
    const de = readDE();
    const pool = (de.expansions || []).filter(e => e.enabled);
    if (pool.length > 0)
      g.domainExpansion = pool[Math.floor(Math.random() * pool.length)];
  }

  // Cursed Spirit Bounty: configurable chance per hand when enabled
  g.cursedSpiritBounty = null;
  if (settings.bountyEnabled !== false && Math.random() * 100 < (settings.bountyChance ?? 35)) {
    const pool = readBounties().entries;
    if (pool.length > 0) g.cursedSpiritBounty = pool[Math.floor(Math.random() * pool.length)];
  }

  res.json(g);
});

app.get('/api/poker/state', (req, res) => {
  if (!pokerGame) return res.status(404).json({ error: 'Kein Spiel' });
  const g = pokerGame;
  const n = communityRevealCount(g.phase);
  const showHoleCards = (g.phase === 'showdown' || g.phase === 'ended') && g.cardsEnabled;
  const pub = { ...g, _holeCards: undefined, _communityCards: undefined,
    communityCards: g.cardsEnabled ? (g._communityCards || []).slice(0, n) : [],
    holeCards: showHoleCards ? (g._holeCards || {}) : undefined };
  res.json(pub);
});

app.get('/api/poker/mycards', (req, res) => {
  if (!pokerGame) return res.status(404).json({ error: 'Kein Spiel' });
  const id = parseInt(req.query.playerId);
  if (!id) return res.status(400).json({ error: 'playerId erforderlich' });
  if (!pokerGame.cardsEnabled) return res.json({ cards: [], enabled: false });
  const cards = (pokerGame._holeCards || {})[id] || [];
  res.json({ cards, enabled: true });
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
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  if (!pokerGame) return res.status(400).json({ error: 'Kein Spiel' });
  const g = pokerGame;
  // Accept winnerIds (array) for split pot, or legacy winnerId (single)
  const ids = req.body.winnerIds
    ? req.body.winnerIds.map(id => parseInt(id))
    : [parseInt(req.body.winnerId)];
  const winners = ids.map(id => g.players.find(p => p.id === id)).filter(Boolean);
  if (!winners.length) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  const share = Math.floor(g.pot / winners.length);
  const remainder = g.pot - share * winners.length;
  winners.forEach((p, i) => { p.chips += share + (i === 0 ? remainder : 0); });
  g.winner = winners.map(p => p.name).join(' & ');
  g.winnerId = winners[0].id;
  g.splitPot = winners.length > 1;
  g.winnerPot = g.pot;
  g.pot = 0; g.phase = 'ended';
  g.winningHand = req.body.winningHand || null;

  // Accumulate sip totals (1 sip per 25 chips lost vs hand start)
  if (!g.sipTotals) g.sipTotals = {};
  if (g.handStartChips) {
    g.players.forEach(p => {
      const start = g.handStartChips[p.id];
      if (start === undefined) return;
      const lost = start - p.chips;
      if (lost > 0) {
        const sips = Math.floor(lost / 25);
        if (sips > 0) g.sipTotals[p.id] = (g.sipTotals[p.id] || 0) + sips;
      }
    });
  }

  const pdata = readPlayers();
  g.players.forEach(gp => { const pp = pdata.players.find(p => p.id === gp.id); if (pp) pp.points = gp.chips; });
  // Vierling (Four of a Kind) grants +1 domain coin to the winner(s)
  if (g.winningHand === 'four_of_a_kind') {
    winners.forEach(w => {
      const pp = pdata.players.find(p => p.id === w.id);
      if (pp) pp.domainCoins = (pp.domainCoins ?? 0) + 1;
    });
  }
  writePlayers(pdata);
  res.json(g);
});

app.post('/api/poker/end', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  if (pokerGame) {
    const pdata = readPlayers();
    pokerGame.players.forEach(gp => { const pp = pdata.players.find(p => p.id === gp.id); if (pp) pp.points = gp.chips; });
    writePlayers(pdata);

    // Nächsten Dealer merken, damit das nächste Spiel dort weitermacht
    const g = pokerGame;
    const n = g.players.length;
    if (n > 0) {
      let nextIdx = (g.dealerIdx + 1) % n;
      let tries = 0;
      while (g.players[nextIdx].chips <= 0 && tries < n) { nextIdx = (nextIdx + 1) % n; tries++; }
      const settings = readSettings();
      settings.nextDealerPlayerId = g.players[nextIdx].id;
      writeSettings(settings);
    }
  }
  pokerGame = null;
  pendingDomainActivation = null;
  res.json({ success: true });
});

// ── Poker: Away-from-table event (Instagram detector) ──
app.post('/api/poker/away', (req, res) => {
  if (!pokerGame) return res.status(400).json({ error: 'Kein Spiel' });
  const g = pokerGame;
  if (!['preflop', 'flop', 'turn', 'river', 'showdown'].includes(g.phase))
    return res.status(400).json({ error: 'Keine aktive Hand' });
  const { playerId } = req.body;
  if (!playerId) return res.status(400).json({ error: 'Spieler erforderlich' });
  const player = g.players.find(p => p.id === parseInt(playerId));
  if (!player) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  if (!g.awayEvents) g.awayEvents = [];
  // Throttle: max one entry per player per 4 seconds
  const now = Date.now();
  const last = g.awayEvents.filter(e => e.playerId === player.id).pop();
  if (last && now - last.at < 4000) return res.json({ success: true, skipped: true });
  g.awayEvents.push({ playerId: player.id, name: player.name, handNum: g.handNum, phase: g.phase, at: now });
  // Keep log to last 20 entries total
  if (g.awayEvents.length > 20) g.awayEvents.shift();
  res.json({ success: true });
});

// ── Wheel entries ──

const WHEEL_FILE = path.join(__dirname, 'data', 'wheel.json');

function readWheel() {
  if (!fs.existsSync(WHEEL_FILE)) return { entries: [] };
  return JSON.parse(fs.readFileSync(WHEEL_FILE, 'utf-8'));
}

function writeWheel(data) {
  fs.writeFileSync(WHEEL_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/wheel', (req, res) => {
  res.json(readWheel().entries);
});

app.post('/api/wheel', (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries must be array' });
  writeWheel({ entries: entries.slice(0, 20) });
  res.json({ success: true });
});

// ── Knuggelige Rad entries ──

const KNUGG_FILE = path.join(__dirname, 'data', 'knuggelige-rad.json');

const KNUGG_DEFAULTS = [
  '3 Jelly Beans essen',
  'Bordstein fressen',
  'Mischtrunk aus der Hölle',
  "David Ms linke Socke essen",
];

function readKnugg() {
  if (!fs.existsSync(KNUGG_FILE)) return { entries: KNUGG_DEFAULTS };
  return JSON.parse(fs.readFileSync(KNUGG_FILE, 'utf-8'));
}

function writeKnugg(data) {
  fs.writeFileSync(KNUGG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/knuggelige-rad', (req, res) => {
  res.json(readKnugg().entries);
});

app.post('/api/knuggelige-rad', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries must be array' });
  writeKnugg({ entries: entries.slice(0, 30) });
  res.json({ success: true, entries: entries.slice(0, 30) });
});

// ── Wheel last result (for TV display) ──
const WHEEL_RESULT_FILE = path.join(__dirname, 'data', 'wheel-result.json');

app.get('/api/wheel/result', (req, res) => {
  if (!fs.existsSync(WHEEL_RESULT_FILE)) return res.json(null);
  res.json(JSON.parse(fs.readFileSync(WHEEL_RESULT_FILE, 'utf-8')));
});

app.post('/api/wheel/result', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const data = { text, timestamp: Date.now() };
  fs.writeFileSync(WHEEL_RESULT_FILE, JSON.stringify(data), 'utf-8');
  res.json(data);
});

// ── Binding Vows ──

const VOWS_FILE = path.join(__dirname, 'data', 'binding-vows.json');

function readVows() {
  if (!fs.existsSync(VOWS_FILE)) return { vows: [], nextId: 1 };
  return JSON.parse(fs.readFileSync(VOWS_FILE, 'utf-8'));
}

function writeVows(data) {
  fs.writeFileSync(VOWS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/binding-vows', (req, res) => {
  const { vows } = readVows();
  const players = readPlayers().players;
  const enriched = vows.map(v => ({
    ...v,
    player1: players.find(p => p.id === v.player1Id) || null,
    player2: players.find(p => p.id === v.player2Id) || null,
  }));
  res.json(enriched);
});

app.post('/api/binding-vows', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { player1Id, player2Id } = req.body;
  if (!player1Id || !player2Id) return res.status(400).json({ error: 'Zwei Spieler erforderlich' });
  if (player1Id === player2Id) return res.status(400).json({ error: 'Spieler muss verschieden sein' });
  const data = readVows();
  const already = data.vows.find(v =>
    (v.player1Id === player1Id && v.player2Id === player2Id) ||
    (v.player1Id === player2Id && v.player2Id === player1Id)
  );
  if (already) return res.status(409).json({ error: 'Gelübde besteht bereits' });
  const vow = { id: data.nextId++, player1Id: parseInt(player1Id), player2Id: parseInt(player2Id) };
  data.vows.push(vow);
  writeVows(data);
  res.json({ success: true, vow });
});

app.delete('/api/binding-vows/:id', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const id = parseInt(req.params.id);
  const data = readVows();
  const idx = data.vows.findIndex(v => v.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Gelübde nicht gefunden' });
  data.vows.splice(idx, 1);
  writeVows(data);
  res.json({ success: true });
});

// ── Settings ──

const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return { cardsEnabled: false, blindSmall: 5, blindBig: 10, bountyEnabled: true, testMode: false };
  const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  if (s.blindSmall    === undefined) s.blindSmall    = 5;
  if (s.blindBig      === undefined) s.blindBig      = 10;
  if (s.bountyEnabled === undefined) s.bountyEnabled = true;
  if (s.bountyChance  === undefined) s.bountyChance  = 35;
  if (s.testMode      === undefined) s.testMode      = false;
  return s;
}

function writeSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/settings', (req, res) => res.json(readSettings()));

app.post('/api/settings', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const current = readSettings();
  const { cardsEnabled, blindSmall, blindBig, bountyEnabled, bountyChance, testMode } = req.body;
  if (cardsEnabled  !== undefined) current.cardsEnabled  = !!cardsEnabled;
  if (blindSmall    !== undefined) current.blindSmall    = Math.max(1, parseInt(blindSmall) || 5);
  if (blindBig      !== undefined) current.blindBig      = Math.max(2, parseInt(blindBig)   || 10);
  if (bountyEnabled !== undefined) current.bountyEnabled = !!bountyEnabled;
  if (bountyChance  !== undefined) current.bountyChance  = Math.min(100, Math.max(0, parseInt(bountyChance) || 35));
  if (testMode      !== undefined) current.testMode      = !!testMode;
  writeSettings(current);
  res.json(current);
});

// ── Test-Umgebung ──

const TEST_BOT_EXEMPT = ['david', 'felix']; // Diese Spieler spielen manuell

// Alle Roster-Spieler automatisch einloggen (Testmodus)
app.post('/api/test-mode/checkin-all', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { players: roster } = readRoster();
  const ALWAYS_ADMIN = ['david', 'felix'];
  const pdata = readPlayers();
  let added = 0;
  for (const entry of roster) {
    const isAdmin = ALWAYS_ADMIN.includes(entry.name.toLowerCase());
    let player = pdata.players.find(p => p.rosterPlayerId === entry.id);
    if (!player) {
      player = {
        id: pdata.nextId++,
        name: entry.name,
        role: 'Normaler Mensch',
        points: 1000,
        domainCoins: 3,
        isAdmin,
        domainIdx: entry.domainIdx ?? 0,
        rosterPlayerId: entry.id,
      };
      pdata.players.push(player);
      added++;
    } else {
      player.domainIdx = entry.domainIdx ?? player.domainIdx;
      player.isAdmin = isAdmin;
    }
  }
  writePlayers(pdata);
  res.json({ success: true, added, total: pdata.players.length });
});

// Bot-Tick: Automatisch callen/checken für alle Spieler außer David und Felix
function runBotTick() {
  try {
    const settings = readSettings();
    if (!settings.testMode) return;
    if (!pokerGame) return;
    const g = pokerGame;
    if (!['preflop', 'flop', 'turn', 'river'].includes(g.phase)) return;
    if (g.toAct.length === 0) return;
    const currentIdx = g.currentPlayerIdx;
    if (currentIdx === -1 || currentIdx === undefined) return;
    const currentPlayer = g.players[currentIdx];
    if (!currentPlayer || currentPlayer.folded || currentPlayer.allIn) return;
    if (TEST_BOT_EXEMPT.includes(currentPlayer.name.toLowerCase())) return;

    // Bot-Aktion: call wenn nötig, sonst check
    const action = g.currentBet > currentPlayer.roundBet ? 'call' : 'check';
    g.toAct.shift();

    if (action === 'call') {
      const toCall = Math.min(g.currentBet - currentPlayer.roundBet, currentPlayer.chips);
      currentPlayer.chips -= toCall;
      currentPlayer.roundBet += toCall;
      currentPlayer.totalBet += toCall;
      g.pot += toCall;
      if (currentPlayer.chips === 0) currentPlayer.allIn = true;
    }
    // check: keine Chip-Änderung nötig

    const active = g.players.filter(p => !p.folded);
    if (active.length === 1) {
      g.phase = 'showdown'; g.toAct = []; g.currentPlayerIdx = -1;
    } else if (g.toAct.length === 0) {
      g.currentPlayerIdx = -1;
    } else {
      g.currentPlayerIdx = g.toAct[0];
    }
    console.log(`[Bot] ${currentPlayer.name} → ${action}`);
  } catch (err) {
    console.error('[Bot-Tick Fehler]', err.message);
  }
}

setInterval(runBotTick, 1500);

// ── Backup / Restore ──

app.get('/api/backup', (req, res) => {
  if (!checkAdminAuth(req.query)) return res.status(401).json({ error: 'Keine Berechtigung' });
  res.json({
    players:  readPlayers(),
    rules:    readData(),
    wheel:    readWheel(),
    vows:     readVows(),
    settings: readSettings(),
    de:       readDE(),
  });
});

app.post('/api/restore', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { players, rules, wheel, vows, settings, de } = req.body;
  if (players)  writePlayers(players);
  if (rules)    writeData(rules);
  if (wheel)    writeWheel(wheel);
  if (vows)     writeVows(vows);
  if (settings) writeSettings(settings);
  if (de)       writeDE(de);
  res.json({ success: true });
});

// ── Card helpers ──

function createDeck() {
  const suits = ['♠', '♣', '♥', '♦'];
  const vals  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const deck  = [];
  for (const s of suits) for (const v of vals) deck.push({ v, s });
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function communityRevealCount(phase) {
  return { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5, ended: 5 }[phase] ?? 0;
}

// ── Domain Expansions ──

const DE_FILE = path.join(__dirname, 'data', 'domain-expansions.json');

function readDE() {
  if (!fs.existsSync(DE_FILE)) return { enabled: false, chance: 20, expansions: [] };
  return JSON.parse(fs.readFileSync(DE_FILE, 'utf-8'));
}

function writeDE(data) {
  fs.writeFileSync(DE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/domain-expansion', (req, res) => {
  res.json(readDE());
});

app.post('/api/domain-expansion', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const current = readDE();
  const { enabled, expansions } = req.body;
  if (enabled !== undefined) current.enabled = !!enabled;
  if (Array.isArray(expansions)) current.expansions = expansions;
  writeDE(current);
  res.json(current);
});

app.post('/api/domain-expansion/add', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const { name, subname, caster, theme, effect, chance } = req.body;
  if (!name || !subname || !effect) return res.status(400).json({ error: 'Name, Subname und Effekt erforderlich' });
  const current = readDE();
  const id = 'de_' + Date.now();
  current.expansions.push({
    id, name: name.trim(), subname: subname.trim(),
    caster: (caster || '').trim(), theme: theme || 'ao',
    effect: effect.trim(), enabled: true,
    chance: Math.min(100, Math.max(0, parseInt(chance) || 10))
  });
  writeDE(current);
  res.json(current);
});

app.delete('/api/domain-expansion/:id', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const current = readDE();
  current.expansions = current.expansions.filter(e => e.id !== req.params.id);
  writeDE(current);
  res.json(current);
});

// ── Domain Activation (manual, costs 1 domain coin) ──

app.get('/api/domain-activation', (req, res) => {
  const playerId = parseInt(req.query.playerId);
  let myCoins = null;
  if (playerId) {
    const pdata = readPlayers();
    const player = pdata.players.find(p => p.id === playerId);
    myCoins = player ? (player.domainCoins ?? 0) : 0;
  }
  res.json({ pending: pendingDomainActivation, myCoins });
});

app.post('/api/domain-activation', (req, res) => {
  const { playerId, domain } = req.body;
  if (!playerId || !domain) return res.status(400).json({ error: 'playerId und domain erforderlich' });
  if (pendingDomainActivation) return res.status(409).json({ error: 'Bereits eine Domain aktiviert' });
  const pdata = readPlayers();
  const player = pdata.players.find(p => p.id === parseInt(playerId));
  if (!player) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  if ((player.domainCoins ?? 0) < 1) return res.status(402).json({ error: 'Nicht genug Domain-Münzen' });
  player.domainCoins = (player.domainCoins ?? 0) - 1;
  writePlayers(pdata);
  pendingDomainActivation = { playerId: player.id, playerName: player.name, domain };
  res.json({ success: true, myCoins: player.domainCoins, pending: pendingDomainActivation });
});

app.delete('/api/domain-activation', (req, res) => {
  const { playerId } = req.body;
  if (!pendingDomainActivation) return res.status(404).json({ error: 'Keine aktive Reservierung' });
  if (pendingDomainActivation.playerId !== parseInt(playerId))
    return res.status(403).json({ error: 'Nicht deine Domain-Reservierung' });
  // Coin is NOT refunded — spent permanently
  const pdata = readPlayers();
  const player = pdata.players.find(p => p.id === parseInt(playerId));
  pendingDomainActivation = null;
  res.json({ success: true, myCoins: player ? (player.domainCoins ?? 0) : null });
});

// Grant 1 wheel spin to a player (admin only)
app.post('/api/players/:id/wheel-spins/grant', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const id = parseInt(req.params.id);
  const pdata = readPlayers();
  const player = pdata.players.find(p => p.id === id);
  if (!player) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  player.wheelSpins = (player.wheelSpins ?? 0) + 1;
  writePlayers(pdata);
  res.json({ success: true, wheelSpins: player.wheelSpins });
});

// Use 1 wheel spin (player themselves)
app.post('/api/players/:id/wheel-spins/use', (req, res) => {
  const id = parseInt(req.params.id);
  const pdata = readPlayers();
  const player = pdata.players.find(p => p.id === id);
  if (!player) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  if ((player.wheelSpins ?? 0) < 1) return res.status(402).json({ error: 'Keine Spins übrig' });
  player.wheelSpins = player.wheelSpins - 1;
  writePlayers(pdata);
  res.json({ success: true, wheelSpins: player.wheelSpins });
});

// Admin: adjust domain coins by delta (can be negative to subtract)
app.patch('/api/players/:id/domain-coins', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const id = parseInt(req.params.id);
  const delta = parseInt(req.body.delta) || 0;
  const data = readPlayers();
  const player = data.players.find(p => p.id === id);
  if (!player) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  player.domainCoins = Math.max(0, (player.domainCoins ?? 0) + delta);
  writePlayers(data);
  res.json(player);
});

// Grant 1 domain coin to a player (e.g. triggered by wheel result)
app.post('/api/players/:id/domain-coins', (req, res) => {
  const id = parseInt(req.params.id);
  const pdata = readPlayers();
  const player = pdata.players.find(p => p.id === id);
  if (!player) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  player.domainCoins = (player.domainCoins ?? 0) + 1;
  writePlayers(pdata);
  res.json({ success: true, domainCoins: player.domainCoins });
});

// ── Hand rules (server-side, shared across all devices) ──

const HAND_RULES_FILE = path.join(__dirname, 'data', 'hand-rules.json');

function readHandRules() {
  if (!fs.existsSync(HAND_RULES_FILE)) return {};
  return JSON.parse(fs.readFileSync(HAND_RULES_FILE, 'utf-8'));
}

app.get('/api/hand-rules', (req, res) => {
  res.json(readHandRules());
});

app.post('/api/hand-rules', (req, res) => {
  const { id, rule } = req.body;
  if (!id) return res.status(400).json({ error: 'id fehlt' });
  const rules = readHandRules();
  rules[id] = rule ?? '';
  fs.writeFileSync(HAND_RULES_FILE, JSON.stringify(rules, null, 2));
  res.json(rules);
});

// ── Kogane (AI game master) ────────────────────────────────────────────────

const BACKUPS_DIR = path.join(__dirname, 'data', 'backups');

function autoBackup() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshot = {
    ts,
    players:  readPlayers(),
    rules:    readData(),
    wheel:    readWheel(),
    vows:     readVows(),
    settings: readSettings(),
    de:       readDE(),
  };
  const file = path.join(BACKUPS_DIR, `backup-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  // Keep only the last 30 backups
  const all = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json')).sort();
  if (all.length > 30) all.slice(0, all.length - 30).forEach(f => fs.unlinkSync(path.join(BACKUPS_DIR, f)));
  return ts;
}

const KOGANE_TOOLS = [
  {
    name: 'get_players',
    description: 'Get all players and their current point totals.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_rules',
    description: 'Get all current Culling Game rules.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_game_state',
    description: 'Get the current poker hand state (phase, pot, player chips).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_player_points',
    description: 'Add or subtract points from a player. Positive delta = add, negative = subtract.',
    input_schema: {
      type: 'object',
      properties: {
        playerId: { type: 'integer', description: 'Player ID' },
        delta:    { type: 'integer', description: 'Points to add (positive) or subtract (negative)' },
      },
      required: ['playerId', 'delta'],
    },
  },
  {
    name: 'add_rule',
    description: 'Add a new rule to the Culling Game.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Short rule title' },
        description: { type: 'string', description: 'Full rule description' },
        points:      { type: 'integer', description: 'Optional point value (omit if none)' },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'delete_rule',
    description: 'Remove a rule by ID.',
    input_schema: {
      type: 'object',
      properties: { ruleId: { type: 'integer' } },
      required: ['ruleId'],
    },
  },
  {
    name: 'create_binding_vow',
    description: 'Create a binding vow (alliance) between two players.',
    input_schema: {
      type: 'object',
      properties: {
        player1Id: { type: 'integer' },
        player2Id: { type: 'integer' },
      },
      required: ['player1Id', 'player2Id'],
    },
  },
];

function executeKoganeTool(name, input) {
  switch (name) {
    case 'get_players':
      return readPlayers().players;

    case 'get_rules':
      return readData().rules;

    case 'get_game_state':
      return pokerGame || { status: 'Kein aktives Spiel' };

    case 'update_player_points': {
      const pdata = readPlayers();
      const idx = pdata.players.findIndex(p => p.id === input.playerId);
      if (idx === -1) return { error: 'Spieler nicht gefunden' };
      pdata.players[idx].points = Math.max(0, pdata.players[idx].points + input.delta);
      if (pokerGame) {
        const gp = pokerGame.players.find(p => p.id === input.playerId);
        if (gp) gp.chips = pdata.players[idx].points;
      }
      writePlayers(pdata);
      return { success: true, player: pdata.players[idx] };
    }

    case 'add_rule': {
      const rdata = readData();
      const rule = {
        id: rdata.nextId++,
        title: input.title.trim(),
        description: input.description.trim(),
        points: input.points ?? null,
      };
      rdata.rules.push(rule);
      writeData(rdata);
      return { success: true, rule };
    }

    case 'delete_rule': {
      const rdata = readData();
      const idx = rdata.rules.findIndex(r => r.id === input.ruleId);
      if (idx === -1) return { error: 'Regel nicht gefunden' };
      rdata.rules.splice(idx, 1);
      writeData(rdata);
      return { success: true };
    }

    case 'create_binding_vow': {
      const vdata = readVows();
      const vow = { id: vdata.nextId++, player1Id: input.player1Id, player2Id: input.player2Id };
      vdata.vows.push(vow);
      writeVows(vdata);
      return { success: true, vow };
    }

    default:
      return { error: `Unbekanntes Tool: ${name}` };
  }
}

app.get('/api/kogane/backups', (req, res) => {
  if (!fs.existsSync(BACKUPS_DIR)) return res.json([]);
  const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
  res.json(files.map(f => ({ file: f, ts: f.replace('backup-', '').replace('.json', '') })));
});

app.post('/api/kogane/restore/:file', (req, res) => {
  if (!checkAdminAuth(req.body)) return res.status(401).json({ error: 'Keine Berechtigung' });
  const file = path.join(BACKUPS_DIR, req.params.file);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Backup nicht gefunden' });
  const snap = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (snap.players)  writePlayers(snap.players);
  if (snap.rules)    writeData(snap.rules);
  if (snap.wheel)    writeWheel(snap.wheel);
  if (snap.vows)     writeVows(snap.vows);
  if (snap.settings) writeSettings(snap.settings);
  if (snap.de)       writeDE(snap.de);
  res.json({ success: true, restoredFrom: snap.ts });
});

app.post('/api/kogane/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY nicht gesetzt. Bitte in .env eintragen.' });

  const { messages: history = [], message } = req.body;
  if (!message) return res.status(400).json({ error: 'Nachricht fehlt' });

  // Auto-backup before every Kogane interaction
  const backupTs = autoBackup();

  // Build fresh context snapshot for the system prompt
  const players = readPlayers().players;
  const rules   = readData().rules;
  const game    = pokerGame
    ? `Phase: ${pokerGame.phase}, Pot: ${pokerGame.pot}, ` +
      `Spieler: ${pokerGame.players.map(p => `${p.name}(${p.chips})`).join(', ')}`
    : 'Kein aktives Spiel';

  const systemPrompt = `Du bist Kogane — der unparteiische Regelgeist der Lalling Games, inspiriert von Kogane aus Jujutsu Kaisen. Du bist ein kleiner, schwebender Würfel-Geist, der die Regeln des Spiels durchsetzt.

Deine Persönlichkeit:
- Formal, unparteiisch, leicht dramatisch
- Kurze, prägnante Sätze
- Bestätige Aktionen mit Phrasen wie "Diese Regel wurde festgelegt.", "Bedingung erfüllt.", "Dieses Kogane bestätigt..."
- Du verstehst umgangssprachliche Sprache (Deutsch/Englisch), antwortest aber formal
- Du kannst Regeln hinzufügen/löschen, Punkte anpassen, Binding Vows schließen

Aktueller Spielstand:
Spieler: ${players.map(p => `${p.name} (ID:${p.id}, ${p.points} Punkte)`).join(' | ')}
Regeln (${rules.length}): ${rules.map(r => `[${r.id}] ${r.title}`).join(', ')}
Spiel: ${game}
Backup erstellt: ${backupTs}

Führe erbetene Änderungen direkt aus. Erkläre kurz was du getan hast.`;

  const client = new Anthropic({ apiKey });
  const msgs = [
    ...history.slice(-10), // last 10 messages for context
    { role: 'user', content: message },
  ];

  try {
    let response;
    // Tool use loop
    while (true) {
      response = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system:     systemPrompt,
        tools:      KOGANE_TOOLS,
        messages:   msgs,
      });

      if (response.stop_reason === 'end_turn') break;

      // Process tool calls
      msgs.push({ role: 'assistant', content: response.content });
      const toolResults = response.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          type:        'tool_result',
          tool_use_id: b.id,
          content:     JSON.stringify(executeKoganeTool(b.name, b.input)),
        }));
      if (!toolResults.length) break;
      msgs.push({ role: 'user', content: toolResults });
    }

    const text = response.content.find(b => b.type === 'text')?.text || '...';
    res.json({ response: text, backupTs });
  } catch (err) {
    console.error('[Kogane]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚔  Lalling Games läuft auf Port ${PORT}`);
  console.log(`   Lokal:   http://localhost:${PORT}`);
  console.log(`   Admin:   http://localhost:${PORT}/admin.html`);
  console.log(`   Passwort: ${ADMIN_PASSWORD}\n`);
});
