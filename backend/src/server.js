require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { generateStructure, reviseStructure } = require('./structureService');
const { generateManualContent } = require('./generationService');
const { renderManualToTex } = require('./latexRenderer');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '25mb' }));

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

app.post('/api/generate-tex', async (req, res) => {
  try {
    const { corpus, approvedStructure } = req.body;

    if (!corpus || !approvedStructure) {
      return res.status(400).json({ error: 'Faltan corpus o estructura aprobada' });
    }

    const templatePath = path.join(__dirname, 'template_v1.tex');

    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ error: 'No se encontró template_v1.tex en backend/src/' });
    }

    const template = fs.readFileSync(templatePath, 'utf8');

    const contentResult = await generateManualContent(corpus, approvedStructure);

    const tex = renderManualToTex(
      corpus,
      approvedStructure,
      contentResult,
      template
    );

    res.json({
      success: true,
      tex,
      usage: contentResult.usage,
      chapter_count: contentResult.chapters?.length || 0
    });
  } catch (err) {
    console.error('ERROR /api/generate-tex:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
});
