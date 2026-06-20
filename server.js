<<<<<<< HEAD
=======
/**
 * Parcle Memory Proxy — Express.js
 * Render entry point: server.js
 *
 * Environment variables (set in Render dashboard):
 *   PARCLE_API_KEY   — your Parcle secret key
 *   PARCLE_BASE_URL  — Parcle API base, e.g. https://api.parcle.ai/v1
 *   PORT             — set automatically by Render (default 3000)
 *   FRONTEND_ORIGIN  — your published frontend URL for CORS
 */

>>>>>>> 824d7004d3b0f81c02ff24750902ba089104d3d1
import express from 'express';
import cors from 'cors';

const app = express();
<<<<<<< HEAD

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
=======
const PORT = process.env.PORT ?? 3000;

const PARCLE_BASE = (process.env.PARCLE_BASE_URL ?? '').replace(/\/$/, '');
const PARCLE_KEY  = process.env.PARCLE_API_KEY ?? '';

if (!PARCLE_KEY)  console.warn('[WARN] PARCLE_API_KEY is not set');
if (!PARCLE_BASE) console.warn('[WARN] PARCLE_BASE_URL is not set');

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? '*' }));
app.use(express.json());

// ── Parcle client helpers ─────────────────────────────────────────────────────

const parcleHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${PARCLE_KEY}`,
});

/**
 * Fetch all memory items stored in Parcle.
 * Adjust the path/query params to match your Parcle plan's list endpoint.
 */
async function parcleList() {
  const res = await fetch(`${PARCLE_BASE}/memory`, {
    headers: parcleHeaders(),
  });
  if (!res.ok) throw new Error(`Parcle list failed: ${res.status}`);
  const data = await res.json();
  // Parcle may return { items: [...] } or an array directly — normalise either
  return Array.isArray(data) ? data : (data.items ?? data.memories ?? []);
}

async function parcleCreate(payload) {
  const res = await fetch(`${PARCLE_BASE}/memory`, {
    method: 'POST',
    headers: parcleHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Parcle create failed: ${res.status}`);
  return res.json();
}

async function parcleUpdate(id, payload) {
  // Try PATCH first, fall back to PUT
  let res = await fetch(`${PARCLE_BASE}/memory/${id}`, {
    method: 'PATCH',
    headers: parcleHeaders(),
    body: JSON.stringify(payload),
  });
  if (res.status === 405) {
    res = await fetch(`${PARCLE_BASE}/memory/${id}`, {
      method: 'PUT',
      headers: parcleHeaders(),
      body: JSON.stringify(payload),
>>>>>>> 824d7004d3b0f81c02ff24750902ba089104d3d1
    });
  }
  if (!res.ok) throw new Error(`Parcle update failed: ${res.status}`);
  return res.status === 204 ? payload : res.json();
}

<<<<<<< HEAD
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
=======
async function parcleDelete(id) {
  const res = await fetch(`${PARCLE_BASE}/memory/${id}`, {
    method: 'DELETE',
    headers: parcleHeaders(),
  });
  if (!res.ok && res.status !== 404)
    throw new Error(`Parcle delete failed: ${res.status}`);
}

// ── Client-side computation helpers (search & summary) ────────────────────────

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function computeSearch(tasks, query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const now           = new Date();
  const todayStart    = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const lastWeekStart = new Date(todayStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const results = [];

  for (const task of tasks) {
    const createdAt  = new Date(task.createdAt);
    const completedAt = task.completedAt ? new Date(task.completedAt) : null;
    const reasons = [];

    if (q.includes('today') && (isSameDay(createdAt, now) || (completedAt && isSameDay(completedAt, now))))
      reasons.push('studied today');
    if (q.includes('yesterday') && (isSameDay(createdAt, yesterdayStart) || (completedAt && isSameDay(completedAt, yesterdayStart))))
      reasons.push('studied yesterday');
    if ((q.includes('last week') || q.includes('week')) && (createdAt >= lastWeekStart || (completedAt && completedAt >= lastWeekStart)))
      reasons.push('studied this week');
    if ((q.includes('completed') || q.includes('done') || q.includes('finished')) && task.status === 'completed')
      reasons.push('completed task');
    if ((q.includes('active') || q.includes('pending') || q.includes('todo')) && task.status === 'active')
      reasons.push('active task');
    if (q.includes('goal') && task.type === 'goal')
      reasons.push('learning goal');

    const knownSubjects = ['math','science','history','languages','cs','literature','art','other'];
    for (const sub of knownSubjects) {
      if (q.includes(sub) && task.subject?.toLowerCase() === sub)
        reasons.push(`subject: ${task.subject}`);
    }

    const stopWords = new Set(['the','and','for','did','what','study']);
    const words = q.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    for (const word of words) {
      if (task.title?.toLowerCase().includes(word) || task.notes?.toLowerCase().includes(word))
        reasons.push(`matches "${word}"`);
    }

    if ((q.includes('high') || q.includes('urgent') || q.includes('important')) && task.priority === 'high')
      reasons.push('high priority');

    if (reasons.length > 0)
      results.push({ task, matchReason: reasons.slice(0, 2).join(' · ') });
  }

  // General fallback
  if (results.length === 0) {
    for (const task of tasks) {
      const haystack = `${task.title} ${task.subject} ${task.notes ?? ''}`.toLowerCase();
      if (haystack.includes(q))
        results.push({ task, matchReason: `matches "${q}"` });
    }
  }

  return results;
}

function computeSummary(tasks, date) {
  const dayTasks = tasks.filter(t => {
    const created   = new Date(t.createdAt);
    const completed = t.completedAt ? new Date(t.completedAt) : null;
    return isSameDay(created, date) || (completed && isSameDay(completed, date));
  });

  const completed = dayTasks.filter(t => t.status === 'completed');

  const subjectMap = new Map();
  for (const t of dayTasks) {
    const s = subjectMap.get(t.subject) ?? { count: 0, completed: 0 };
    s.count++;
    if (t.status === 'completed') s.completed++;
    subjectMap.set(t.subject, s);
  }
  const subjects = [...subjectMap.entries()]
    .map(([subject, val]) => ({ subject, ...val }))
    .sort((a, b) => b.count - a.count);

  // Streak
  const checkDay = startOfDay(new Date());
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const hasActivity = tasks.some(t => {
      const cr = new Date(t.createdAt);
      const cp = t.completedAt ? new Date(t.completedAt) : null;
      return isSameDay(cr, checkDay) || (cp && isSameDay(cp, checkDay));
    });
    if (!hasActivity) break;
    streak++;
    checkDay.setDate(checkDay.getDate() - 1);
  }

  return {
    date: date.toISOString(),
    totalTasks:     dayTasks.length,
    completedTasks: completed.length,
    activeTasks:    dayTasks.length - completed.length,
    subjects,
    streak,
    topSubject: subjects[0]?.subject ?? null,
  };
}

// ── Task normaliser ───────────────────────────────────────────────────────────
// Parcle may wrap the stored object — unwrap to raw StudyTask shape.

function toTask(parcleItem) {
  // If Parcle wraps content in a `data` or `content` field, unwrap it
  const raw = parcleItem?.data ?? parcleItem?.content ?? parcleItem;
  return {
    id:          raw.id          ?? parcleItem.id,
    title:       raw.title       ?? '',
    subject:     raw.subject     ?? 'Other',
    type:        raw.type        ?? 'task',
    status:      raw.status      ?? 'active',
    priority:    raw.priority    ?? 'medium',
    createdAt:   raw.createdAt   ?? parcleItem.created_at ?? new Date().toISOString(),
    completedAt: raw.completedAt ?? parcleItem.completed_at ?? undefined,
    notes:       raw.notes       ?? undefined,
    tags:        raw.tags        ?? [],
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── POST /tasks  — create a new task ─────────────────────────────────────────
app.post('/tasks', async (req, res) => {
  try {
    const { title, subject, type, status, priority, notes, tags, createdAt } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const taskPayload = {
      id:        `task_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
      title,
      subject:   subject  ?? 'Other',
      type:      type     ?? 'task',
      status:    status   ?? 'active',
      priority:  priority ?? 'medium',
      createdAt: createdAt ?? new Date().toISOString(),
      notes:     notes ?? null,
      tags:      tags  ?? [],
    };

    const created = await parcleCreate(taskPayload);
    res.status(201).json(toTask({ ...taskPayload, ...created }));
  } catch (err) {
    console.error('POST /tasks', err);
    res.status(502).json({ error: err.message });
  }
});

// ── GET /tasks  — list all tasks (optional filter by status/subject/type) ─────
app.get('/tasks', async (req, res) => {
  try {
    const raw = await parcleList();
    let tasks = raw.map(toTask);

    const { status, subject, type } = req.query;
    if (status)  tasks = tasks.filter(t => t.status  === status);
    if (subject) tasks = tasks.filter(t => t.subject === subject);
    if (type)    tasks = tasks.filter(t => t.type    === type);

    // Newest first
    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(tasks);
  } catch (err) {
    console.error('GET /tasks', err);
    res.status(502).json({ error: err.message });
  }
});

// ── PATCH /tasks/:id  — update a task (complete, change status, etc.) ─────────
>>>>>>> 824d7004d3b0f81c02ff24750902ba089104d3d1
app.patch('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

<<<<<<< HEAD
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
=======
    // Fetch current state so we can merge
    const all   = await parcleList();
    const found = all.map(toTask).find(t => t.id === id);
    if (!found) return res.status(404).json({ error: 'Task not found' });

    const merged = { ...found, ...updates, id };
    const updated = await parcleUpdate(id, merged);
    res.json(toTask({ ...merged, ...updated }));
  } catch (err) {
    console.error('PATCH /tasks/:id', err);
    res.status(502).json({ error: err.message });
  }
});

// ── DELETE /tasks/:id  — delete a task ───────────────────────────────────────
app.delete('/tasks/:id', async (req, res) => {
  try {
    await parcleDelete(req.params.id);
    res.sendStatus(204);
  } catch (err) {
    console.error('DELETE /tasks/:id', err);
    res.status(502).json({ error: err.message });
  }
});

// ── POST /tasks/search  — natural language memory search ─────────────────────
app.post('/tasks/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.json([]);

    const raw   = await parcleList();
    const tasks = raw.map(toTask);
    const results = computeSearch(tasks, query);
    res.json(results);
  } catch (err) {
    console.error('POST /tasks/search', err);
    res.status(502).json({ error: err.message });
  }
});

// ── GET /tasks/summary  — daily study summary ────────────────────────────────
app.get('/tasks/summary', async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    if (isNaN(date.getTime())) return res.status(400).json({ error: 'Invalid date' });

    const raw     = await parcleList();
    const tasks   = raw.map(toTask);
    const summary = computeSummary(tasks, date);
    res.json(summary);
  } catch (err) {
    console.error('GET /tasks/summary', err);
    res.status(502).json({ error: err.message });
>>>>>>> 824d7004d3b0f81c02ff24750902ba089104d3d1
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
app.listen(PORT, () => console.log(`[parcle-proxy] listening on port ${PORT}`));
=======
app.listen(PORT, () => {
  console.log(`Parcle proxy listening on port ${PORT}`);
  console.log(`Parcle backend: ${PARCLE_BASE || '(not configured)'}`);
});
>>>>>>> 824d7004d3b0f81c02ff24750902ba089104d3d1
