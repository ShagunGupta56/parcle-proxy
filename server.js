import express from 'express';
import cors from 'cors';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────
const PARCLE_BASE = 'https://api.parcle.ai';
const API_KEY     = process.env.PARCLE_API_KEY;   // required — set in Render env vars
const USER_ID     = process.env.PARCLE_USER_ID ?? 'study-app-user';
const PORT        = process.env.PORT ?? 3000;

if (!API_KEY) console.warn('[warn] PARCLE_API_KEY is not set — all Parcle calls will fail with 401');

// ── Parcle helper ─────────────────────────────────────────────────────────────
async function parcleReq(path, options = {}) {
  const url = `${PARCLE_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      ...(options.headers ?? {}),
    },
  });
  return res;
}

// Helper: read JSON or return error text
async function readBody(res) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/',       (_req, res) => res.json({ status: 'Parcle Proxy Running' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', user_id: USER_ID }));

// ── POST /tasks — create ──────────────────────────────────────────────────────
// Parcle: POST /v1/memories/ingest_dialog
app.post('/tasks', async (req, res) => {
  try {
    const {
      title,
      subject,
      priority   = 'medium',
      type       = 'task',
      notes      = '',
      status     = 'active',
      createdAt  = new Date().toISOString(),
    } = req.body;

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // All task fields live in `tag` — returned verbatim by /v1/memories/sources
    const tag = {
      marker:    'study_task',   // used as tag_filter key to avoid colliding with Parcle's own `type`
      task_id:   taskId,
      title,
      subject,
      priority,
      taskType:  type,           // avoid shadowing Parcle's `type` field
      notes,
      status,
      createdAt,
      completedAt: null,
    };

    const r = await parcleReq('/v1/memories/ingest_dialog', {
      method: 'POST',
      body: JSON.stringify({
        user_id:    USER_ID,
        session_id: taskId,      // session_id doubles as our stable task ID
        messages: [{
          role:    'user',
          content: `Task: ${title}\nSubject: ${subject}\nPriority: ${priority}\nType: ${type}\nStatus: ${status}\nNotes: ${notes}`,
        }],
        tag,
      }),
    });

    if (!r.ok) {
      const body = await readBody(r);
      return res.status(r.status).json({ error: 'Parcle ingest failed', detail: body });
    }

    // Return a StudyTask-shaped object to the frontend
    res.status(201).json({
      id: taskId, title, subject, priority, type, notes, status, createdAt, completedAt: null,
    });
  } catch (err) {
    res.status(500).json({ error: `create failed: ${err.message}` });
  }
});

// ── GET /tasks — list ─────────────────────────────────────────────────────────
// Parcle: POST /v1/memories/sources  (all task data lives in source.tag)
app.get('/tasks', async (req, res) => {
  try {
    const tagFilter = { marker: 'study_task' };
    if (req.query.status)  tagFilter.status   = req.query.status;
    if (req.query.subject) tagFilter.subject  = req.query.subject;
    if (req.query.type)    tagFilter.taskType = req.query.type;

    const r = await parcleReq('/v1/memories/sources', {
      method: 'POST',
      body: JSON.stringify({
        user_id:    USER_ID,
        tag_filter: tagFilter,
        limit:      100,
        order:      'desc',
      }),
    });

    if (!r.ok) {
      const body = await readBody(r);
      return res.status(r.status).json({ error: 'Parcle sources failed', detail: body });
    }

    const data = await r.json();

    const tasks = (data.sources ?? []).map(s => ({
      id:          s.tag.task_id    ?? s.id,
      title:       s.tag.title      ?? '',
      subject:     s.tag.subject    ?? 'General',
      priority:    s.tag.priority   ?? 'medium',
      type:        s.tag.taskType   ?? 'task',
      notes:       s.tag.notes      ?? '',
      status:      s.tag.status     ?? 'active',
      createdAt:   s.tag.createdAt  ?? s.updated_at,
      completedAt: s.tag.completedAt ?? null,
    }));

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: `list failed: ${err.message}` });
  }
});

// ── PATCH /tasks/:id — update ─────────────────────────────────────────────────
// Parcle has no edit: delete session → re-ingest with updated tag + same session_id
app.patch('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 1. Fetch the existing tag so we keep all fields
    const srcR = await parcleReq('/v1/memories/sources', {
      method: 'POST',
      body: JSON.stringify({
        user_id:    USER_ID,
        tag_filter: { marker: 'study_task', task_id: id },
        limit: 1,
      }),
    });
    const srcData = await srcR.json();
    const existing = srcData.sources?.[0]?.tag ?? {};

    // 2. Delete old session (fire-and-forget; if it's already gone that's fine)
    await parcleReq('/v1/memories/by_session', {
      method: 'DELETE',
      body: JSON.stringify({ user_id: USER_ID, session_id: id }),
    }).catch(() => {});

    // 3. Merge updates — remap `type` → `taskType` to avoid Parcle field collision
    const merged = { ...existing, ...updates, task_id: id, marker: 'study_task' };
    if ('type' in updates) { merged.taskType = updates.type; delete merged.type; }

    // 4. Re-ingest with same session_id (gives updated `tag` to /v1/memories/sources)
    const r = await parcleReq('/v1/memories/ingest_dialog', {
      method: 'POST',
      body: JSON.stringify({
        user_id:    USER_ID,
        session_id: id,
        messages: [{
          role:    'user',
          content: `Task: ${merged.title}\nSubject: ${merged.subject}\nPriority: ${merged.priority}\nStatus: ${merged.status}`,
        }],
        tag: merged,
      }),
    });

    if (!r.ok) {
      const body = await readBody(r);
      return res.status(r.status).json({ error: 'Parcle re-ingest failed', detail: body });
    }

    res.json({
      id:          merged.task_id,
      title:       merged.title,
      subject:     merged.subject,
      priority:    merged.priority,
      type:        merged.taskType,
      notes:       merged.notes      ?? '',
      status:      merged.status,
      createdAt:   merged.createdAt,
      completedAt: merged.completedAt ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: `update failed: ${err.message}` });
  }
});

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────
// Parcle: DELETE /v1/memories/by_session
app.delete('/tasks/:id', async (req, res) => {
  try {
    const r = await parcleReq('/v1/memories/by_session', {
      method: 'DELETE',
      body: JSON.stringify({ user_id: USER_ID, session_id: req.params.id }),
    });

    if (!r.ok) {
      const body = await readBody(r);
      return res.status(r.status).json({ error: 'Parcle delete failed', detail: body });
    }

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: `delete failed: ${err.message}` });
  }
});

// ── POST /tasks/search — semantic search ──────────────────────────────────────
// Parcle: POST /v1/memories/search  → SSE stream; proxy parses and returns JSON
app.post('/tasks/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const r = await parcleReq('/v1/memories/search', {
      method: 'POST',
      body: JSON.stringify({
        user_id:    USER_ID,
        query,
        tag_filter: { marker: 'study_task' },
      }),
    });

    if (!r.ok) {
      const body = await readBody(r);
      return res.status(r.status).json({ error: 'Parcle search failed', detail: body });
    }

    // Parcle search returns SSE — parse stream for the `final` event
    const text = await r.text();
    let currentEvent = '';
    let answer = null;

    for (const line of text.split('\n')) {
      const trimmed = line.trimEnd();
      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice('event:'.length).trim();
      } else if (trimmed.startsWith('data:')) {
        if (currentEvent === 'final') {
          const raw = trimmed.slice('data:'.length).trim();
          try { answer = JSON.parse(raw); } catch { answer = { text: raw }; }
          break;
        } else if (currentEvent === 'error') {
          const raw = trimmed.slice('data:'.length).trim();
          try {
            const errObj = JSON.parse(raw);
            return res.status(502).json({ error: 'Parcle search error', detail: errObj });
          } catch {
            return res.status(502).json({ error: 'Parcle search error', detail: raw });
          }
        }
      } else if (trimmed === '') {
        // blank line resets event name (standard SSE spec)
        if (currentEvent !== 'final') currentEvent = '';
      }
    }

    res.json({ answer, query });
  } catch (err) {
    res.status(500).json({ error: `search failed: ${err.message}` });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`[parcle-proxy] listening on port ${PORT}`));