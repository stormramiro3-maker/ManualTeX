require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { generateStructure, reviseStructure } = require('./structureService');
const { generateManualContent } = require('./generationService');
const { renderManualToTex } = require('./latexRenderer');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '30mb' }));

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

    const tex = renderManualToTex({
      corpus,
      approvedStructure,
      manualContent: contentResult,
      template
    });

    res.json({
      success: true,
      tex,
      usage: contentResult.usage,
      chapter_count: contentResult.chapters?.length || 0,
      glossary_count: contentResult.glossary?.length || 0
    });
  } catch (err) {
    console.error('ERROR /api/generate-tex:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/compile-pdf', async (req, res) => {
  try {
    const { tex } = req.body;

    if (!tex || !tex.trim()) {
      return res.status(400).json({ error: 'Falta el contenido .tex' });
    }

    const result = compileTexToPdf(tex);

    res.json(result);
  } catch (err) {
    console.error('ERROR /api/compile-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

function compileTexToPdf(tex) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'manualtex-'));
  const texPath = path.join(workdir, 'manual.tex');
  const pdfPath = path.join(workdir, 'manual.pdf');

  fs.writeFileSync(texPath, tex, 'utf8');

  let log = '';
  let success = false;
  let pdfBase64 = null;

  try {
    const runOnce = () =>
      execFileSync(
        'pdflatex',
        ['-interaction=nonstopmode', '-halt-on-error', 'manual.tex'],
        {
          cwd: workdir,
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 20 * 1024 * 1024
        }
      );

    log += runOnce() || '';
    log += '\n\n=== SECOND PASS ===\n\n';
    log += runOnce() || '';

    if (fs.existsSync(pdfPath)) {
      pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
      success = true;
    }
  } catch (err) {
    log += '\n\n=== COMPILE ERROR ===\n\n';
    if (typeof err.stdout === 'string') log += err.stdout;
    if (typeof err.stderr === 'string') log += '\n' + err.stderr;
    if (fs.existsSync(pdfPath)) {
      pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
      success = true;
    }
  } finally {
    try {
      fs.rmSync(workdir, { recursive: true, force: true });
    } catch (_) {}
  }

  return {
    success,
    pdf_base64: pdfBase64,
    compile_log: log
  };
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
});
