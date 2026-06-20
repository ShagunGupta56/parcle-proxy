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

import express from 'express';
import cors from 'cors';

const app = express();
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
    });
  }
  if (!res.ok) throw new Error(`Parcle update failed: ${res.status}`);
  return res.status === 204 ? payload : res.json();
}

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
app.patch('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

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
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Parcle proxy listening on port ${PORT}`);
  console.log(`Parcle backend: ${PARCLE_BASE || '(not configured)'}`);
});
