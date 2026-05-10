# hyperfaceless-render-node

Thin webhook wrapper around [Hyperframes](https://github.com/heygen-com/hyperframes) (Apache 2.0 HTML-to-video) for the **budget mode** path of the [HyperFaceless](#) faceless crypto-video factory.

Deploy to Railway in one click and you get a public URL like:

```
POST https://your-service.up.railway.app/render
```

that turns a script + ElevenLabs MP3 + captions into an MP4. Combine with the **premium** Creatomate path via the `RENDER_MODE` toggle in HyperAgent.

> **⚠️ Status: scaffolded plumbing only.** The HTML composition (`templates/placeholder.html`) is a deliberate placeholder. It proves the wiring works end-to-end but produces a stark "PLACEHOLDER COMPOSITION" video. The real visual template is a separate follow-on task. Premium mode (Creatomate) is unaffected — use this only when you've intentionally toggled to budget mode.

---

## Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new?template=https%3A%2F%2Fgithub.com%2FDhammerr6304%2Fhyperfaceless-render-node)

After deploy, Railway gives you a public URL. Copy it (with `/render` appended) into the HyperAgent env var `HYPERFRAMES_WEBHOOK_URL`.

> **Capital note:** Railway's hobby tier costs ~$5/mo after the free trial credit runs out. If you're at $0 capital, watch the trial counter and switch back to premium mode (Creatomate) when it expires.

## Local dev

```bash
npm install
PORT=3000 npm run dev
# in another shell:
curl -X POST http://localhost:3000/render \
  -H 'content-type: application/json' \
  -d '{
    "script": "Token X just pumped 200%. Here is why.",
    "audio_url": "https://example.com/audio.mp3",
    "captions": [],
    "token_meta": { "symbol": "PEPE" },
    "job_id": "smoke_test_001"
  }'
```

You'll need Chromium and FFmpeg installed locally. The Docker image bundles both.

## API

### `GET /health`

Returns `200` with service status. Railway's healthcheck hits this.

### `POST /render`

**Body** (JSON):

| Field | Type | Required | Notes |
|---|---|---|---|
| `script` | string | yes | Winning script text from the rubric judge |
| `audio_url` | string | yes | Public URL to the ElevenLabs MP3 |
| `captions` | array | no | Caption objects (shape defined by the upstream Writer Agent) |
| `token_meta` | object | no | `{ symbol, address, ... }` — used by the template |
| `job_id` | string | no | Optional client-supplied ID. Auto-generated if omitted. Sanitized to `[A-Za-z0-9_-]{1,64}` |

**Response** (`200`):

```json
{
  "ok": true,
  "job_id": "job_1700000000_abc123",
  "mode": "budget",
  "output_url": "https://your-service.up.railway.app/files/job_1700000000_abc123/output.mp4",
  "size_bytes": 1234567,
  "template_warning": "Rendered with PLACEHOLDER composition...",
  "hyperframes_log_tail": "..."
}
```

**Errors**: `400` for missing fields, `500` with `error` and `detail` for render failures.

### `GET /files/:job_id/output.mp4`

Static file served from `HYPERFRAMES_WORK_DIR`. The `output_url` returned by `/render` points here.

## Env vars

See `.env.example`. Only `PORT` (auto), `HYPERFRAMES_WORK_DIR` (default `/data/renders`), and `RENDER_TIMEOUT_MS` (default `300000`) are configurable. **No secrets baked in.** Render-side credentials (Creatomate, ElevenLabs, Airtable) live in the HyperAgent runner, not here.

## Replacing the placeholder template

Edit `templates/placeholder.html`. Token replacements available:

- `{{TOKEN}}` — token symbol or address
- `{{SCRIPT}}` — script text (HTML-escaped)
- `{{AUDIO_URL}}` — MP3 URL (HTML-escaped)
- `{{CAPTIONS_JSON}}` — JSON-stringified captions array (HTML-escaped)

Follow [Hyperframes composition rules](https://hyperframes.heygen.com/introduction): `data-start`, `data-duration`, `data-track-index`, body-level `data-fps` and `data-duration-seconds`. GSAP / Anime.js / CSS animations are all supported.

## License

Apache-2.0 (matching upstream Hyperframes).
