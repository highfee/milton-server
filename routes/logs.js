import { Router } from 'express';
import prisma from '../config/prisma.js';
import { authenticateOptional } from '../middleware/auth.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/logs/app — log a user page visit
// Authenticated users: user info is pulled from JWT.
// Unauthenticated users (guests): log is still stored without user info.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/app', authenticateOptional, async (req, res) => {
  try {
    const { pageName } = req.body;

    if (!pageName || typeof pageName !== 'string') {
      return res.status(400).json({ error: 'pageName is required.' });
    }

    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;

    await prisma.appLog.create({
      data: {
        user_id:    req.user?.id    ?? null,
        user_email: req.user?.email ?? null,
        user_role:  req.user?.role  ?? null,
        page_name:  pageName,
        ip_address: ip,
        user_agent: userAgent,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /logs/app]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/logs/app — retrieve activity logs (admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/app', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    const { _limit, _sort, user_id, user_role, page_name } = req.query;

    const where = {};
    if (user_id)    where.user_id    = user_id;
    if (user_role)  where.user_role  = user_role;
    if (page_name)  where.page_name  = page_name;

    const orderBy = _sort
      ? { [_sort.replace(/^-/, '')]: _sort.startsWith('-') ? 'desc' : 'asc' }
      : { created_date: 'desc' };

    const take = _limit ? parseInt(_limit) : 100;

    const logs = await prisma.appLog.findMany({ where, orderBy, take });
    return res.json(logs);
  } catch (err) {
    console.error('[GET /logs/app]', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
