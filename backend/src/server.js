require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { generateStructure, reviseStructure } = require('./structureService');
const { generateManualContent, ManualGenerationError } = require('./generationService');
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
    sendErrorResponse(res, err, 'ERROR /api/structure');
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
    sendErrorResponse(res, err, 'ERROR /api/structure/revise');
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
      return res.status(500).json({
        error: 'No se encontró template_v1.tex en backend/src/'
      });
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
      glossary_count: contentResult.glossary?.length || 0,
      debug: contentResult.debug || null
    });
  } catch (err) {
    sendErrorResponse(res, err, 'ERROR /api/generate-tex');
  }
});

app.post('/api/compile-pdf', async (req, res) => {
  try {
    const { tex } = req.body;

    if (!tex || !tex.trim()) {
      return res.status(400).json({ error: 'Falta el contenido .tex' });
    }

    const result = compileTexToPdf(tex);

    if (!result.success) {
      return res.status(500).json({
        error: 'Error en compilación PDF',
        compile_log: result.compile_log,
        details: result.details || null
      });
    }

    res.json(result);
  } catch (err) {
    sendErrorResponse(res, err, 'ERROR /api/compile-pdf');
  }
});

function sendErrorResponse(res, err, logPrefix) {
  console.error(logPrefix + ':', err);

  const status =
    err instanceof ManualGenerationError
      ? 422
      : 500;

  res.status(status).json({
    error: err.message || 'Error interno',
    details: err.details || null,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

function compileTexToPdf(tex) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'manualtex-'));
  const texPath = path.join(workdir, 'manual.tex');
  const pdfPath = path.join(workdir, 'manual.pdf');
  const logPath = path.join(workdir, 'manual.log');

  fs.writeFileSync(texPath, tex, 'utf8');

  let log = '';
  let success = false;
  let pdfBase64 = null;
  let details = null;

  try {
    const runOnce = (passLabel) => {
      const output = execFileSync(
        'pdflatex',
        ['-interaction=nonstopmode', '-halt-on-error', 'manual.tex'],
        {
          cwd: workdir,
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 20 * 1024 * 1024
        }
      );

      log += `\n\n=== ${passLabel} ===\n\n`;
      log += output || '';
    };

    runOnce('FIRST PASS');
    runOnce('SECOND PASS');

    if (fs.existsSync(logPath)) {
      log += '\n\n=== LATEX LOG FILE ===\n\n';
      log += fs.readFileSync(logPath, 'utf8');
    }

    if (fs.existsSync(pdfPath)) {
      pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
      success = true;
    }
  } catch (err) {
    log += '\n\n=== COMPILE ERROR ===\n\n';

    if (typeof err.stdout === 'string' && err.stdout.trim()) {
      log += err.stdout;
    }

    if (typeof err.stderr === 'string' && err.stderr.trim()) {
      log += '\n' + err.stderr;
    }

    if (fs.existsSync(logPath)) {
      log += '\n\n=== LATEX LOG FILE ===\n\n';
      log += fs.readFileSync(logPath, 'utf8');
    }

    details = {
      stage: 'pdflatex_compile',
      command: 'pdflatex -interaction=nonstopmode -halt-on-error manual.tex',
      tex_length: tex.length,
      tex_snippet: safeSnippet(tex, 2000),
      stdout_snippet: safeSnippet(err.stdout || '', 2000),
      stderr_snippet: safeSnippet(err.stderr || '', 2000),
      latex_log_snippet: fs.existsSync(logPath)
        ? safeSnippet(fs.readFileSync(logPath, 'utf8'), 2000)
        : ''
    };

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
    compile_log: log,
    details
  };
}

function safeSnippet(text, max = 1200) {
  const raw = String(text || '').replace(/\u0000/g, '');
  return raw.length <= max ? raw : `${raw.slice(0, max)}…[truncated]`;
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
});
