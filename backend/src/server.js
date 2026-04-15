require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { generateStructure, reviseStructure } = require('./structureService');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'manualtex-backend',
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/structure', async (req, res) => {
  try {
    const { corpus } = req.body;

    if (!corpus || !corpus.metadata || !Array.isArray(corpus.documents)) {
      return res.status(400).json({ error: 'Corpus inválido' });
    }

    const result = await generateStructure(corpus);
    res.json(result);
  } catch (err) {
    console.error('ERROR /api/structure:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/structure/revise', async (req, res) => {
  try {
    const { corpus, previousStructure, feedbackText } = req.body;

    if (!corpus || !previousStructure || !feedbackText?.trim()) {
      return res.status(400).json({ error: 'Faltan datos para rehacer estructura' });
    }

    const result = await reviseStructure(corpus, previousStructure, feedbackText);
    res.json(result);
  } catch (err) {
    console.error('ERROR /api/structure/revise:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
});
