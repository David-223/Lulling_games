const express = require('express');
const fs = require('fs');
const path = require('path');

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

const lobbies = new Map();

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
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚔  Lalling Games läuft auf Port ${PORT}`);
  console.log(`   Lokal:   http://localhost:${PORT}`);
  console.log(`   Admin:   http://localhost:${PORT}/admin.html`);
  console.log(`   Passwort: ${ADMIN_PASSWORD}\n`);
});
