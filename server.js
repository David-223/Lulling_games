const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lulling123';
const DATA_FILE = path.join(__dirname, 'data', 'rules.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

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
    points: parseInt(points) || 100,
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
  if (points !== undefined) data.rules[idx].points = parseInt(points) || 100;
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🍺 Lulling Games läuft auf Port ${PORT}`);
  console.log(`   Lokal:   http://localhost:${PORT}`);
  console.log(`   Admin:   http://localhost:${PORT}/admin.html`);
  console.log(`   Passwort: ${ADMIN_PASSWORD}\n`);
});
