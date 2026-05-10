// hyperfaceless-render-node
// Thin webhook wrapper around the `hyperframes` CLI for budget-mode rendering.
// Accepts POST /render { script, audio_url, captions, token_meta, job_id? }
// Returns { ok, output_url, mode: "budget" }.
//
// IMPORTANT: This ships with a PLACEHOLDER HTML composition (templates/placeholder.html).
// The real visual template is a follow-on task. Until that lands, /render produces a
// minimal "wiring works" video that proves the toggle and pipeline are functional but
// is not production-ready visual content.

import express from 'express';
import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execp = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const WORK_DIR = process.env.HYPERFRAMES_WORK_DIR || path.join(os.tmpdir(), 'hf-renders');
const RAILWAY_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN; // auto-set by Railway in prod
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS) || 5 * 60 * 1000;

await fs.mkdir(WORK_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'hyperfaceless-render-node',
    mode: 'budget',
    work_dir: WORK_DIR,
    public_domain: RAILWAY_DOMAIN || null,
    template_status: 'PLACEHOLDER — real composition is a follow-on task',
  });
});

// Static serving so callers can fetch the rendered MP4 from /files/{job_id}/output.mp4
app.use('/files', express.static(WORK_DIR, { fallthrough: false }));

app.post('/render', async (req, res) => {
  const { script, audio_url, captions, token_meta, job_id } = req.body || {};

  if (!script || typeof script !== 'string') {
    return res.status(400).json({ ok: false, error: 'script (string) is required' });
  }
  if (!audio_url || typeof audio_url !== 'string') {
    return res.status(400).json({ ok: false, error: 'audio_url (string) is required' });
  }

  const id = sanitizeJobId(job_id) || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = path.join(WORK_DIR, id);
  await fs.mkdir(jobDir, { recursive: true });

  const indexPath = path.join(jobDir, 'index.html');
  const outputPath = path.join(jobDir, 'output.mp4');

  // Build composition from placeholder template.
  let template;
  try {
    template = await fs.readFile(path.join(__dirname, 'templates', 'placeholder.html'), 'utf8');
  } catch (err) {
    return res.status(500).json({
      ok: false,
      job_id: id,
      error: 'placeholder template missing',
      hint: 'templates/placeholder.html should exist in the deployed image. Check Dockerfile COPY step.',
    });
  }

  const composed = template
    .replaceAll('{{SCRIPT}}', escapeHtml(script))
    .replaceAll('{{TOKEN}}', escapeHtml(token_meta?.symbol || token_meta?.address || 'TOKEN'))
    .replaceAll('{{AUDIO_URL}}', escapeHtml(audio_url))
    .replaceAll('{{CAPTIONS_JSON}}', escapeHtml(JSON.stringify(captions || [])));

  await fs.writeFile(indexPath, composed, 'utf8');

  // Render with hyperframes CLI (npx fetches if not installed).
  const cmd = `npx --yes hyperframes render --input ${shellQuote(indexPath)} --output ${shellQuote(outputPath)}`;
  let stdout = '';
  let stderr = '';
  try {
    const result = await execp(cmd, { timeout: RENDER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
    stdout = result.stdout || '';
    stderr = result.stderr || '';
  } catch (err) {
    return res.status(500).json({
      ok: false,
      job_id: id,
      error: 'hyperframes render failed',
      detail: String(err.message || err),
      stderr: (err.stderr || '').slice(-1000),
      hint: 'Verify Chromium and FFmpeg are installed in the runtime (see Dockerfile). Also confirm the placeholder template is valid Hyperframes HTML.',
    });
  }

  let stat;
  try {
    stat = await fs.stat(outputPath);
  } catch {
    return res.status(500).json({
      ok: false,
      job_id: id,
      error: 'render completed without producing output.mp4',
      stdout: stdout.slice(-1000),
    });
  }

  const baseUrl = RAILWAY_DOMAIN ? `https://${RAILWAY_DOMAIN}` : `http://localhost:${PORT}`;
  const outputUrl = `${baseUrl}/files/${id}/output.mp4`;

  return res.json({
    ok: true,
    job_id: id,
    mode: 'budget',
    output_url: outputUrl,
    size_bytes: stat.size,
    template_warning: 'Rendered with PLACEHOLDER composition. Replace templates/placeholder.html with real composition before shipping to audience.',
    hyperframes_log_tail: stdout.slice(-500),
  });
});

app.use((err, _req, res, _next) => {
  console.error('unhandled error', err);
  res.status(500).json({ ok: false, error: String(err?.message || err) });
});

app.listen(PORT, () => {
  console.log(`hyperfaceless-render-node listening on :${PORT}`);
  console.log(`work_dir=${WORK_DIR}`);
  if (RAILWAY_DOMAIN) console.log(`public=https://${RAILWAY_DOMAIN}`);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function sanitizeJobId(id) {
  if (!id || typeof id !== 'string') return null;
  // allow only safe filesystem chars
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned.slice(0, 64) || null;
}
