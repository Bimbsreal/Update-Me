/**
 * Moderation & Trust Center — queue, detail, metrics, actions.
 * Reuses reports/community tables, audit log, and data-quality freshness.
 * No AI, no parallel audit system, no invented trust scores.
 */

import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  MODERATION_ACTIONS,
  MODERATION_REASONS,
  isActionAllowedForContentType,
  moderationReasonLabel,
  allowedActionsForContentType,
} from '../config/admin.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { reportService } from './reportService.js';
import {
  computeFreshnessState,
  sourceFromType,
  verificationFromRow,
  formatAgeLabel,
} from './dataQualityService.js';

function metaFromReq(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.get?.('user-agent') || null,
  };
}

async function writeAudit(admin, payload, req) {
  const m = metaFromReq(req);
  const newState = payload.newState ? { ...payload.newState } : {};
  if (req?.requestId) newState.requestId = req.requestId;
  return adminAuditRepository.create({
    actorUserId: admin?.userId || null,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId || null,
    previousState: payload.previousState || null,
    newState: Object.keys(newState).length ? newState : null,
    reason: payload.reason || null,
    ipAddress: m.ipAddress,
    userAgent: m.userAgent,
  });
}

function composeReason({ reasonCode, reason }) {
  const label = reasonCode ? moderationReasonLabel(reasonCode) : null;
  const text = String(reason || '').trim();
  if (label && text && !text.toLowerCase().startsWith(label.toLowerCase())) {
    return `${label}: ${text}`.slice(0, 1000);
  }
  if (label && !text) return label;
  return text;
}

function parseQueueId(queueId) {
  if (String(queueId).includes(':')) {
    const [contentType, id] = String(queueId).split(':');
    return { contentType, id };
  }
  return { contentType: 'report', id: String(queueId) };
}

function mapReportQueueItem(r) {
  const contentType = r.category_code === 'local_alerts' ? 'alert' : 'report';
  const freshness = computeFreshnessState(r, {
    fresh_within_minutes: r.fresh_within_minutes,
    recent_within_minutes: r.recent_within_minutes,
    stale_after_minutes: r.stale_after_minutes,
  });
  const source = sourceFromType(r.source_type);
  const verification = verificationFromRow(r);
  return {
    id: r.id,
    queueId: `report:${r.id}`,
    contentType,
    category: r.category_code,
    categoryName: r.category_name,
    title: r.title,
    summary: r.description ? String(r.description).slice(0, 180) : null,
    location: r.location_id
      ? {
          id: r.location_id,
          name: r.location_name,
          state: r.state_name || null,
          lga: r.lga_name || null,
        }
      : null,
    creator: r.user_id
      ? { id: r.user_id, displayName: r.user_display_name || null }
      : null,
    sourceType: r.source_type,
    sourceLabel: source.label,
    verificationLabel: verification.label,
    status: r.status,
    moderationState: r.moderation_state,
    flagCount: Number(r.flag_count || 0),
    openFlagCount: Number(r.open_flag_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    reason: r.latest_flag_reason || null,
    freshness: {
      state: freshness.state,
      label: freshness.label,
      ageLabel: formatAgeLabel(r.last_confirmed_at || r.occurred_at || r.created_at),
    },
    isOfficial: r.source_type === 'official',
    isSafety: contentType === 'alert' || r.moderation_priority === 'urgent',
    moderationPriority: r.moderation_priority || 'normal',
    eventGroupId: r.event_group_id || null,
    relatedOfficialUpdateId: r.related_official_update_id || null,
    allowedActions: allowedActionsForContentType(contentType),
  };
}

function reportWhereForView(view) {
  switch (view) {
    case 'pending':
      return `(
        r.status = 'under_review'
        OR r.moderation_state IN ('queued', 'in_review')
      )`;
    case 'flagged':
      return `(
        r.status = 'flagged'
        OR r.moderation_state = 'flagged'
        OR EXISTS (SELECT 1 FROM report_flags f WHERE f.report_id = r.id AND f.status = 'open')
      )`;
    case 'escalated':
      return `r.moderation_state = 'escalated'`;
    case 'removed':
      return `r.status = 'removed'`;
    case 'attention':
    default:
      return `(
        r.status IN ('flagged', 'under_review')
        OR r.moderation_state IN ('flagged', 'queued', 'in_review', 'escalated')
        OR EXISTS (SELECT 1 FROM report_flags f WHERE f.report_id = r.id AND f.status = 'open')
      )`;
  }
}

function questionWhereForView(view) {
  switch (view) {
    case 'pending':
      return `(q.status = 'under_review' OR q.moderation_state IN ('queued', 'in_review'))`;
    case 'flagged':
      return `(q.status = 'flagged' OR q.moderation_state = 'flagged')`;
    case 'escalated':
      return `q.moderation_state = 'escalated'`;
    case 'removed':
      return `q.status = 'removed'`;
    case 'attention':
    default:
      return `(
        q.status IN ('flagged', 'under_review')
        OR q.moderation_state IN ('flagged', 'queued', 'in_review', 'escalated')
      )`;
  }
}

function answerWhereForView(view) {
  switch (view) {
    case 'pending':
      return `(a.status = 'under_review' OR a.moderation_state IN ('queued', 'in_review'))`;
    case 'flagged':
      return `(a.status = 'flagged' OR a.moderation_state = 'flagged')`;
    case 'escalated':
      return `a.moderation_state = 'escalated'`;
    case 'removed':
      return `a.status = 'removed'`;
    case 'attention':
    default:
      return `(
        a.status IN ('flagged', 'under_review', 'removed')
        OR a.moderation_state IN ('flagged', 'queued', 'in_review', 'escalated')
      )`;
  }
}

export const moderationCenterService = {
  reasons() {
    return MODERATION_REASONS;
  },

  async metrics() {
    const pool = getPool();
    const [
      pending,
      flagged,
      escalated,
      removed,
      reviewedToday,
      stale,
      reportsToday,
      approvedToday,
      rejectedToday,
      priority,
      duplicateCandidates,
    ] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM reports r
             WHERE r.status = 'under_review' OR r.moderation_state IN ('queued', 'in_review'))
           + (SELECT COUNT(*)::int FROM questions q
             WHERE q.status = 'under_review' OR q.moderation_state IN ('queued', 'in_review'))
           + (SELECT COUNT(*)::int FROM answers a
             WHERE a.status = 'under_review' OR a.moderation_state IN ('queued', 'in_review'))
           AS c`
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM reports r
             WHERE r.status = 'flagged' OR r.moderation_state = 'flagged'
                OR EXISTS (SELECT 1 FROM report_flags f WHERE f.report_id = r.id AND f.status = 'open'))
           + (SELECT COUNT(*)::int FROM questions q
             WHERE q.status = 'flagged' OR q.moderation_state = 'flagged')
           + (SELECT COUNT(*)::int FROM answers a
             WHERE a.status = 'flagged' OR a.moderation_state = 'flagged')
           AS c`
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM reports WHERE moderation_state = 'escalated')
           + (SELECT COUNT(*)::int FROM questions WHERE moderation_state = 'escalated')
           + (SELECT COUNT(*)::int FROM answers WHERE moderation_state = 'escalated')
           AS c`
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM reports WHERE status = 'removed')
           + (SELECT COUNT(*)::int FROM questions WHERE status = 'removed')
           + (SELECT COUNT(*)::int FROM answers WHERE status = 'removed')
           AS c`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM admin_audit_log
         WHERE action LIKE 'moderation.%' AND created_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM reports r
         WHERE r.status = 'stale'
            OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW() AND r.status NOT IN ('removed','expired'))`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM reports WHERE created_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM admin_audit_log
         WHERE action IN ('moderation.approve', 'moderation.confirm', 'moderation.restore')
           AND created_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM admin_audit_log
         WHERE action IN ('moderation.remove', 'moderation.mark_inaccurate', 'moderation.mark_duplicate')
           AND created_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM reports
         WHERE moderation_priority IN ('priority', 'urgent')
           AND status NOT IN ('removed', 'expired')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM (
           SELECT r.location_id, r.category_id
           FROM reports r
           WHERE r.created_at >= NOW() - INTERVAL '24 hours'
             AND r.status NOT IN ('removed')
             AND r.source_type = 'community'
           GROUP BY r.location_id, r.category_id
           HAVING COUNT(*) >= 2
         ) d`
      ),
    ]);

    return {
      pending: pending.rows[0]?.c || 0,
      flagged: flagged.rows[0]?.c || 0,
      escalated: escalated.rows[0]?.c || 0,
      removed: removed.rows[0]?.c || 0,
      reviewedToday: reviewedToday.rows[0]?.c || 0,
      staleReports: stale.rows[0]?.c || 0,
      reportsToday: reportsToday.rows[0]?.c || 0,
      approvedToday: approvedToday.rows[0]?.c || 0,
      rejectedToday: rejectedToday.rows[0]?.c || 0,
      priorityReports: priority.rows[0]?.c || 0,
      duplicateCandidates: duplicateCandidates.rows[0]?.c || 0,
      note: 'Counts are live database aggregates — not invented trust scores.',
    };
  },

  async queue({
    view = 'attention',
    type,
    q,
    limit = 30,
    offset = 0,
    sort = 'updated',
  } = {}) {
    const pool = getPool();
    const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const off = Math.max(Number(offset) || 0, 0);
    const like = q && String(q).trim().length >= 2 ? `%${String(q).trim()}%` : null;
    const items = [];

    if (view === 'reviewed') {
      return this.recentlyReviewed({ limit: lim, offset: off, q });
    }

    const orderSql =
      sort === 'flags'
        ? `open_flag_count DESC NULLS LAST, CASE r.moderation_priority WHEN 'urgent' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, r.updated_at DESC`
        : sort === 'created'
          ? `CASE r.moderation_priority WHEN 'urgent' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, r.created_at DESC`
          : `CASE r.moderation_priority WHEN 'urgent' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END,
             CASE WHEN c.code = 'local_alerts' THEN 0 ELSE 1 END,
             open_flag_count DESC NULLS LAST,
             CASE WHEN r.moderation_state = 'escalated' THEN 0 ELSE 1 END,
             r.updated_at DESC`;

    if (!type || type === 'report' || type === 'alert') {
      const catFilter =
        type === 'alert'
          ? `AND c.code = 'local_alerts'`
          : type === 'report'
            ? `AND c.code <> 'local_alerts'`
            : '';
      const params = [];
      let searchClause = '';
      if (like) {
        params.push(like);
        searchClause = `AND (r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`;
      }
      params.push(80);
      const reports = await pool.query(
        `SELECT r.id, r.title, r.description, r.status, r.moderation_state, r.flag_count,
                r.source_type, r.created_at, r.updated_at, r.occurred_at, r.last_confirmed_at,
                r.expires_at, r.user_id, r.location_id, r.confirmed_accurate_count,
                r.moderation_priority, r.event_group_id, r.related_official_update_id,
                c.code AS category_code, c.name AS category_name,
                loc.name AS location_name, s.name AS state_name, l.name AS lga_name,
                u.display_name AS user_display_name,
                p.fresh_within_minutes, p.recent_within_minutes, p.stale_after_minutes,
                (SELECT COUNT(*)::int FROM report_flags f WHERE f.report_id = r.id AND f.status = 'open') AS open_flag_count,
                (
                  SELECT f.reason::text FROM report_flags f
                  WHERE f.report_id = r.id AND f.status = 'open'
                  ORDER BY f.created_at DESC LIMIT 1
                ) AS latest_flag_reason
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         LEFT JOIN locations loc ON loc.id = r.location_id
         LEFT JOIN lgas l ON l.id = loc.lga_id
         LEFT JOIN states s ON s.id = loc.state_id
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
         WHERE ${reportWhereForView(view)}
         ${catFilter}
         ${searchClause}
         ORDER BY ${orderSql}
         LIMIT $${params.length}`,
        params
      );
      for (const r of reports.rows) items.push(mapReportQueueItem(r));
    }

    if (!type || type === 'question') {
      const params = [];
      let searchClause = '';
      if (like) {
        params.push(like);
        searchClause = `AND (q.title ILIKE $${params.length} OR q.description ILIKE $${params.length})`;
      }
      params.push(40);
      const qs = await pool.query(
        `SELECT q.id, q.title, q.description, q.status, q.moderation_state, q.flag_count,
                q.created_at, q.updated_at, q.category::text AS category_code,
                loc.id AS location_id, loc.name AS location_name,
                s.name AS state_name, l.name AS lga_name,
                u.id AS user_id, u.display_name AS user_display_name
         FROM questions q
         LEFT JOIN locations loc ON loc.id = q.location_id
         LEFT JOIN lgas l ON l.id = loc.lga_id
         LEFT JOIN states s ON s.id = loc.state_id
         LEFT JOIN users u ON u.id = q.user_id
         WHERE ${questionWhereForView(view)}
         ${searchClause}
         ORDER BY q.updated_at DESC
         LIMIT $${params.length}`,
        params
      );
      for (const q of qs.rows) {
        items.push({
          id: q.id,
          queueId: `question:${q.id}`,
          contentType: 'question',
          category: q.category_code,
          title: q.title,
          summary: q.description ? String(q.description).slice(0, 180) : null,
          location: q.location_id
            ? {
                id: q.location_id,
                name: q.location_name,
                state: q.state_name,
                lga: q.lga_name,
              }
            : null,
          creator: q.user_id ? { id: q.user_id, displayName: q.user_display_name } : null,
          sourceType: 'community',
          sourceLabel: 'Community Report',
          verificationLabel: 'Community',
          status: q.status,
          moderationState: q.moderation_state,
          flagCount: Number(q.flag_count || 0),
          openFlagCount: Number(q.flag_count || 0),
          createdAt: q.created_at,
          updatedAt: q.updated_at,
          reason: null,
          freshness: { state: null, label: formatAgeLabel(q.created_at), ageLabel: formatAgeLabel(q.created_at) },
          isOfficial: false,
          isSafety: false,
          allowedActions: allowedActionsForContentType('question'),
        });
      }
    }

    if (!type || type === 'answer') {
      const params = [];
      let searchClause = '';
      if (like) {
        params.push(like);
        searchClause = `AND (a.content ILIKE $${params.length} OR q.title ILIKE $${params.length})`;
      }
      params.push(40);
      const ans = await pool.query(
        `SELECT a.id, a.content, a.status, a.moderation_state, a.created_at, a.updated_at,
                a.question_id, q.title AS question_title,
                loc.id AS location_id, loc.name AS location_name,
                s.name AS state_name, l.name AS lga_name,
                u.id AS user_id, u.display_name AS user_display_name
         FROM answers a
         JOIN questions q ON q.id = a.question_id
         LEFT JOIN locations loc ON loc.id = COALESCE(a.location_id, q.location_id)
         LEFT JOIN lgas l ON l.id = loc.lga_id
         LEFT JOIN states s ON s.id = loc.state_id
         LEFT JOIN users u ON u.id = a.user_id
         WHERE ${answerWhereForView(view)}
         ${searchClause}
         ORDER BY a.updated_at DESC
         LIMIT $${params.length}`,
        params
      );
      for (const a of ans.rows) {
        items.push({
          id: a.id,
          queueId: `answer:${a.id}`,
          contentType: 'answer',
          category: 'community',
          title: a.question_title || 'Answer',
          summary: a.content ? String(a.content).slice(0, 180) : null,
          location: a.location_id
            ? {
                id: a.location_id,
                name: a.location_name,
                state: a.state_name,
                lga: a.lga_name,
              }
            : null,
          creator: a.user_id ? { id: a.user_id, displayName: a.user_display_name } : null,
          sourceType: 'community',
          sourceLabel: 'Community Report',
          verificationLabel: 'Community',
          status: a.status,
          moderationState: a.moderation_state,
          flagCount: 0,
          openFlagCount: 0,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
          reason: null,
          freshness: { state: null, label: formatAgeLabel(a.created_at), ageLabel: formatAgeLabel(a.created_at) },
          isOfficial: false,
          isSafety: false,
          questionId: a.question_id,
          allowedActions: allowedActionsForContentType('answer'),
        });
      }
    }

    items.sort((a, b) => {
      if (sort === 'flags') return (b.flagCount || 0) - (a.flagCount || 0);
      const ta = new Date(sort === 'created' ? a.createdAt : a.updatedAt || a.createdAt).getTime();
      const tb = new Date(sort === 'created' ? b.createdAt : b.updatedAt || b.createdAt).getTime();
      return tb - ta;
    });

    const total = items.length;
    const page = items.slice(off, off + lim);
    return {
      items: page,
      total,
      limit: lim,
      offset: off,
      view,
      reasons: MODERATION_REASONS,
    };
  },

  async recentlyReviewed({ limit = 30, offset = 0, q } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const off = Math.max(Number(offset) || 0, 0);
    const params = [];
    let search = '';
    if (q && String(q).trim().length >= 2) {
      params.push(`%${String(q).trim()}%`);
      search = `AND (a.reason ILIKE $${params.length} OR a.action ILIKE $${params.length})`;
    }
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.reason, a.previous_state, a.new_state,
              a.created_at, u.display_name AS actor_name
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.action LIKE 'moderation.%'
       ${search}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countRes = await getPool().query(
      `SELECT COUNT(*)::int AS c FROM admin_audit_log a
       WHERE a.action LIKE 'moderation.%' ${search}`,
      params.slice(0, -2)
    );
    const items = result.rows.map((row) => ({
      id: row.id,
      queueId: `${row.entity_type}:${row.entity_id}`,
      contentType: row.entity_type,
      title: `${row.action.replace('moderation.', '')} · ${row.entity_type}`,
      summary: row.reason,
      status: row.new_state?.status || row.new_state?.moderation_state || null,
      moderationState: row.new_state?.moderation_state || null,
      reviewedAt: row.created_at,
      reviewedBy: row.actor_name,
      previousState: row.previous_state,
      newState: row.new_state,
      isReviewedItem: true,
      allowedActions: [],
    }));
    return {
      items,
      total: countRes.rows[0]?.c || items.length,
      limit: lim,
      offset: off,
      view: 'reviewed',
      reasons: MODERATION_REASONS,
    };
  },

  async getDetail(queueId, { includeReporterPii = false } = {}) {
    const { contentType: rawType, id } = parseQueueId(queueId);
    const pool = getPool();

    if (rawType === 'report' || rawType === 'alert') {
      const result = await pool.query(
        `SELECT r.*, c.code AS category_code, c.name AS category_name,
                loc.name AS location_name, loc.latitude, loc.longitude,
                s.name AS state_name, lga.name AS lga_name,
                u.display_name AS user_display_name, u.email AS user_email,
                u.reporting_disabled_at,
                p.fresh_within_minutes, p.recent_within_minutes, p.stale_after_minutes,
                la.alert_category, la.severity AS alert_severity,
                ou.title AS related_official_title, ou.status AS related_official_status
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         LEFT JOIN locations loc ON loc.id = r.location_id
         LEFT JOIN lgas lga ON lga.id = loc.lga_id
         LEFT JOIN states s ON s.id = loc.state_id
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
         LEFT JOIN local_alert_reports la ON la.report_id = r.id
         LEFT JOIN official_updates ou ON ou.id = r.related_official_update_id
         WHERE r.id = $1`,
        [id]
      );
      const r = result.rows[0];
      if (!r) throw new AppError('Report not found.', 404, 'NOT_FOUND');
      const contentType = r.category_code === 'local_alerts' ? 'alert' : 'report';
      if (r.source_type === 'official') {
        // Official rows stay visible but actions are limited to metadata-safe set
      }
      const flags = await pool.query(
        `SELECT f.id, f.reason::text AS reason, f.details, f.status, f.created_at,
                u.display_name AS flagger_name
         FROM report_flags f
         LEFT JOIN users u ON u.id = f.user_id
         WHERE f.report_id = $1
         ORDER BY f.created_at DESC
         LIMIT 30`,
        [id]
      );
      const history = await pool.query(
        `SELECT event_type, previous_state, new_state, reason, created_at, actor_user_id
         FROM report_history WHERE report_id = $1
         ORDER BY created_at DESC LIMIT 40`,
        [id]
      );
      const audit = await pool.query(
        `SELECT a.action, a.reason, a.previous_state, a.new_state, a.created_at, u.display_name AS actor_name
         FROM admin_audit_log a
         LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.entity_type = 'report' AND a.entity_id = $1 AND a.action LIKE 'moderation.%'
         ORDER BY a.created_at DESC LIMIT 30`,
        [id]
      );
      const related = await pool.query(
        `SELECT r2.id, r2.title, r2.status, r2.created_at, c.code AS category,
                r2.confirmed_accurate_count, r2.confirmed_inaccurate_count
         FROM reports r2
         JOIN report_categories c ON c.id = r2.category_id
         WHERE r2.id <> $1
           AND r2.location_id = $2
           AND r2.category_id = $3
           AND r2.created_at > NOW() - INTERVAL '24 hours'
           AND r2.status NOT IN ('removed')
         ORDER BY r2.created_at DESC
         LIMIT 8`,
        [id, r.location_id, r.category_id]
      );
      const eventPeers = r.event_group_id
        ? await pool.query(
            `SELECT id, title, status, created_at FROM reports
             WHERE event_group_id = $1 AND id <> $2
             ORDER BY created_at DESC LIMIT 20`,
            [r.event_group_id, id]
          )
        : { rows: [] };
      const conflicts = related.rows.filter(
        (x) => Number(x.confirmed_inaccurate_count || 0) > 0
      );
      const queueItem = mapReportQueueItem({
        ...r,
        open_flag_count: flags.rows.filter((f) => f.status === 'open').length,
        latest_flag_reason: flags.rows.find((f) => f.status === 'open')?.reason || null,
      });
      let allowedActions = allowedActionsForContentType(contentType);
      if (r.source_type === 'official') {
        // Do not rewrite official-authored text via confirm/approve as if community-authored
        allowedActions = allowedActions.filter((a) =>
          ['under_review', 'escalate', 'remove', 'restore', 'expire', 'mark_stale', 'dismiss_flag'].includes(a)
        );
      }
      return {
        item: {
          ...queueItem,
          allowedActions,
          body: r.description,
          observedAt: r.occurred_at,
          submittedAt: r.created_at,
          coordinates:
            r.latitude != null && r.longitude != null
              ? { lat: Number(r.latitude), lng: Number(r.longitude) }
              : null,
          alertCategory: r.alert_category || null,
          alertSeverity: r.alert_severity || null,
          confirmations: {
            accurate: Number(r.confirmed_accurate_count || 0),
            inaccurate: Number(r.confirmed_inaccurate_count || 0),
            lastConfirmedAt: r.last_confirmed_at || null,
          },
          creator: r.user_id
            ? {
                id: r.user_id,
                displayName: r.user_display_name,
                reportingDisabled: Boolean(r.reporting_disabled_at),
                ...(includeReporterPii ? { email: r.user_email || null } : {}),
              }
            : null,
          relatedOfficial: r.related_official_update_id
            ? {
                id: r.related_official_update_id,
                title: r.related_official_title,
                status: r.related_official_status,
              }
            : null,
          qualitySignals: {
            missingLocation: !r.location_id,
            missingCategory: !r.category_id,
            missingObservedAt: !r.occurred_at,
            duplicateCandidate: related.rows.length >= 1,
            repeatedlyFlagged: Number(r.flag_count || 0) >= 3,
            conflicting: conflicts.length > 0,
            stale: queueItem.freshness?.state === 'stale' || queueItem.freshness?.state === 'expired',
          },
        },
        flags: flags.rows.map((f) => ({
          id: f.id,
          reason: f.reason,
          details: f.details,
          status: f.status,
          createdAt: f.created_at,
          flaggerName: f.flagger_name,
        })),
        history: history.rows.map((h) => ({
          eventType: h.event_type,
          fromStatus: h.previous_state?.status || null,
          toStatus: h.new_state?.status || null,
          note: h.reason,
          previousState: h.previous_state,
          newState: h.new_state,
          createdAt: h.created_at,
        })),
        moderationAudit: audit.rows.map((a) => ({
          action: a.action,
          reason: a.reason,
          previousState: a.previous_state,
          newState: a.new_state,
          createdAt: a.created_at,
          actorName: a.actor_name,
        })),
        relatedReports: related.rows.map((x) => ({
          id: x.id,
          title: x.title,
          status: x.status,
          category: x.category,
          createdAt: x.created_at,
          queueId: `report:${x.id}`,
        })),
        eventGroupReports: eventPeers.rows.map((x) => ({
          id: x.id,
          title: x.title,
          status: x.status,
          createdAt: x.created_at,
          queueId: `report:${x.id}`,
        })),
        conflictingReports: conflicts.map((x) => ({
          id: x.id,
          title: x.title,
          status: x.status,
          createdAt: x.created_at,
          queueId: `report:${x.id}`,
        })),
        reasons: MODERATION_REASONS,
        privacyNote: includeReporterPii
          ? 'Reporter contact visible under elevated permission.'
          : 'Reporter email hidden — requires moderation_reporter_pii.',
      };
    }

    if (rawType === 'question') {
      const result = await pool.query(
        `SELECT q.*, loc.name AS location_name, s.name AS state_name, l.name AS lga_name,
                u.display_name AS user_display_name, u.email AS user_email
         FROM questions q
         LEFT JOIN locations loc ON loc.id = q.location_id
         LEFT JOIN lgas l ON l.id = loc.lga_id
         LEFT JOIN states s ON s.id = loc.state_id
         LEFT JOIN users u ON u.id = q.user_id
         WHERE q.id = $1`,
        [id]
      );
      const q = result.rows[0];
      if (!q) throw new AppError('Question not found.', 404, 'NOT_FOUND');
      const flags = await pool.query(
        `SELECT f.id, f.reason::text AS reason, f.details, f.created_at, u.display_name AS flagger_name
         FROM question_flags f
         LEFT JOIN users u ON u.id = f.user_id
         WHERE f.question_id = $1
         ORDER BY f.created_at DESC LIMIT 30`,
        [id]
      );
      const audit = await pool.query(
        `SELECT a.action, a.reason, a.previous_state, a.new_state, a.created_at, u.display_name AS actor_name
         FROM admin_audit_log a
         LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.entity_type = 'question' AND a.entity_id = $1 AND a.action LIKE 'moderation.%'
         ORDER BY a.created_at DESC LIMIT 30`,
        [id]
      );
      return {
        item: {
          id: q.id,
          queueId: `question:${q.id}`,
          contentType: 'question',
          category: q.category,
          title: q.title,
          summary: q.description ? String(q.description).slice(0, 180) : null,
          body: q.description,
          location: q.location_id
            ? {
                id: q.location_id,
                name: q.location_name,
                state: q.state_name,
                lga: q.lga_name,
              }
            : null,
          creator: q.user_id
            ? {
                id: q.user_id,
                displayName: q.user_display_name,
                ...(includeReporterPii ? { email: q.user_email } : {}),
              }
            : null,
          sourceType: 'community',
          sourceLabel: 'Community Report',
          status: q.status,
          moderationState: q.moderation_state,
          flagCount: Number(q.flag_count || 0),
          createdAt: q.created_at,
          updatedAt: q.updated_at,
          isOfficial: false,
          isSafety: false,
          allowedActions: allowedActionsForContentType('question'),
        },
        flags: flags.rows.map((f) => ({
          id: f.id,
          reason: f.reason,
          details: f.details,
          status: 'open',
          createdAt: f.created_at,
          flaggerName: f.flagger_name,
        })),
        history: [],
        moderationAudit: audit.rows.map((a) => ({
          action: a.action,
          reason: a.reason,
          previousState: a.previous_state,
          newState: a.new_state,
          createdAt: a.created_at,
          actorName: a.actor_name,
        })),
        relatedReports: [],
        reasons: MODERATION_REASONS,
      };
    }

    if (rawType === 'answer') {
      const result = await pool.query(
        `SELECT a.*, q.title AS question_title, q.id AS question_id,
                loc.name AS location_name, s.name AS state_name, l.name AS lga_name,
                u.display_name AS user_display_name, u.email AS user_email
         FROM answers a
         JOIN questions q ON q.id = a.question_id
         LEFT JOIN locations loc ON loc.id = COALESCE(a.location_id, q.location_id)
         LEFT JOIN lgas l ON l.id = loc.lga_id
         LEFT JOIN states s ON s.id = loc.state_id
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.id = $1`,
        [id]
      );
      const a = result.rows[0];
      if (!a) throw new AppError('Answer not found.', 404, 'NOT_FOUND');
      const audit = await pool.query(
        `SELECT a.action, a.reason, a.previous_state, a.new_state, a.created_at, u.display_name AS actor_name
         FROM admin_audit_log a
         LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.entity_type = 'answer' AND a.entity_id = $1 AND a.action LIKE 'moderation.%'
         ORDER BY a.created_at DESC LIMIT 30`,
        [id]
      );
      return {
        item: {
          id: a.id,
          queueId: `answer:${a.id}`,
          contentType: 'answer',
          category: 'community',
          title: a.question_title,
          summary: a.content ? String(a.content).slice(0, 180) : null,
          body: a.content,
          questionId: a.question_id,
          location: a.location_id || a.location_name
            ? {
                id: a.location_id,
                name: a.location_name,
                state: a.state_name,
                lga: a.lga_name,
              }
            : null,
          creator: a.user_id
            ? {
                id: a.user_id,
                displayName: a.user_display_name,
                ...(includeReporterPii ? { email: a.user_email } : {}),
              }
            : null,
          sourceType: 'community',
          sourceLabel: 'Community Report',
          status: a.status,
          moderationState: a.moderation_state,
          flagCount: 0,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
          isOfficial: false,
          isSafety: false,
          allowedActions: allowedActionsForContentType('answer'),
        },
        flags: [],
        history: [],
        moderationAudit: audit.rows.map((row) => ({
          action: row.action,
          reason: row.reason,
          previousState: row.previous_state,
          newState: row.new_state,
          createdAt: row.created_at,
          actorName: row.actor_name,
        })),
        relatedReports: [],
        reasons: MODERATION_REASONS,
      };
    }

    throw new AppError('Unsupported moderation target.', 400, 'VALIDATION_ERROR');
  },

  async applyAction(
    admin,
    queueId,
    { action, reason, reasonCode, relatedReportId, officialUpdateId, priority },
    req
  ) {
    const def = MODERATION_ACTIONS.find((a) => a.code === action);
    if (!def) throw new AppError('Unknown moderation action.', 400, 'VALIDATION_ERROR');

    const composed = composeReason({ reasonCode, reason });
    if (!composed || composed.length < 3) {
      throw new AppError('A reason is required for moderation actions.', 400, 'VALIDATION_ERROR');
    }

    const { contentType: rawType, id } = parseQueueId(queueId);

    if (rawType === 'report' || rawType === 'alert') {
      const cat = await getPool().query(
        `SELECT c.code FROM reports r JOIN report_categories c ON c.id = r.category_id WHERE r.id = $1`,
        [id]
      );
      if (!cat.rows[0]) throw new AppError('Report not found.', 404, 'NOT_FOUND');
      const resolvedType = cat.rows[0].code === 'local_alerts' ? 'alert' : 'report';
      if (!isActionAllowedForContentType(resolvedType, action)) {
        throw new AppError('Action not allowed for this content type.', 400, 'ACTION_NOT_ALLOWED');
      }
    } else if (!isActionAllowedForContentType(rawType, action)) {
      throw new AppError('Action not allowed for this content type.', 400, 'ACTION_NOT_ALLOWED');
    }

    if (rawType === 'report' || rawType === 'alert') {
      const raw = await getPool().query(`SELECT * FROM reports WHERE id = $1`, [id]);
      const report = raw.rows[0];
      if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');
      if (report.source_type === 'official' && ['confirm', 'approve', 'mark_inaccurate'].includes(action)) {
        throw new AppError(
          'Official-source content cannot be rewritten as community authorship. Use hide/remove, restore, or escalate.',
          400,
          'OFFICIAL_CONTENT_PROTECTED'
        );
      }

      const prev = {
        status: report.status,
        moderationState: report.moderation_state,
        moderationPriority: report.moderation_priority,
        eventGroupId: report.event_group_id,
        relatedOfficialUpdateId: report.related_official_update_id,
      };

      if (action === 'set_priority') {
        const nextPriority = priority === 'urgent' ? 'urgent' : 'priority';
        await getPool().query(
          `UPDATE reports SET moderation_priority = $2, updated_at = NOW() WHERE id = $1`,
          [id, nextPriority]
        );
        await writeAudit(
          admin,
          {
            action: 'moderation.set_priority',
            entityType: 'report',
            entityId: id,
            previousState: prev,
            newState: { moderationPriority: nextPriority },
            reason: composed,
          },
          req
        );
        return { contentType: 'report', id, action, moderationPriority: nextPriority };
      }

      if (action === 'clear_priority') {
        await getPool().query(
          `UPDATE reports SET moderation_priority = 'normal', updated_at = NOW() WHERE id = $1`,
          [id]
        );
        await writeAudit(
          admin,
          {
            action: 'moderation.clear_priority',
            entityType: 'report',
            entityId: id,
            previousState: prev,
            newState: { moderationPriority: 'normal' },
            reason: composed,
          },
          req
        );
        return { contentType: 'report', id, action, moderationPriority: 'normal' };
      }

      if (action === 'link_official') {
        if (!officialUpdateId) {
          throw new AppError('officialUpdateId is required.', 400, 'VALIDATION_ERROR');
        }
        const ou = await getPool().query(`SELECT id, title FROM official_updates WHERE id = $1`, [
          officialUpdateId,
        ]);
        if (!ou.rows[0]) throw new AppError('Official update not found.', 404, 'NOT_FOUND');
        await getPool().query(
          `UPDATE reports SET related_official_update_id = $2, updated_at = NOW() WHERE id = $1`,
          [id, officialUpdateId]
        );
        await writeAudit(
          admin,
          {
            action: 'moderation.link_official',
            entityType: 'report',
            entityId: id,
            previousState: prev,
            newState: { relatedOfficialUpdateId: officialUpdateId, title: ou.rows[0].title },
            reason: composed,
          },
          req
        );
        return { contentType: 'report', id, action, relatedOfficialUpdateId: officialUpdateId };
      }

      if (action === 'link_event' || (action === 'mark_duplicate' && relatedReportId)) {
        const peerId = relatedReportId;
        if (!peerId) {
          throw new AppError('relatedReportId is required to link an event group.', 400, 'VALIDATION_ERROR');
        }
        if (peerId === id) {
          throw new AppError('Cannot link a report to itself.', 400, 'VALIDATION_ERROR');
        }
        const peer = await getPool().query(`SELECT * FROM reports WHERE id = $1`, [peerId]);
        if (!peer.rows[0]) throw new AppError('Related report not found.', 404, 'NOT_FOUND');
        let groupId = report.event_group_id || peer.rows[0].event_group_id;
        if (!groupId) {
          const created = await getPool().query(
            `INSERT INTO report_event_groups (category_id, location_id, title, canonical_report_id, status)
             VALUES ($1,$2,$3,$4,'open') RETURNING id`,
            [
              report.category_id,
              report.location_id,
              report.title,
              peerId,
            ]
          );
          groupId = created.rows[0].id;
        }
        await getPool().query(
          `UPDATE reports SET event_group_id = $2, updated_at = NOW() WHERE id = ANY($1::uuid[])`,
          [[id, peerId], groupId]
        );
        if (action === 'mark_duplicate') {
          await reportService.transitionStatus(admin.userId, id, 'removed', composed, {
            asModerator: true,
            moderationState: 'actioned',
          });
          await getPool().query(
            `UPDATE report_flags SET status = 'actioned', reviewed_at = NOW()
             WHERE report_id = $1 AND status = 'open'`,
            [id]
          );
        }
        await writeAudit(
          admin,
          {
            action: `moderation.${action}`,
            entityType: 'report',
            entityId: id,
            previousState: prev,
            newState: { eventGroupId: groupId, relatedReportId: peerId },
            reason: composed,
          },
          req
        );
        return { contentType: 'report', id, action, eventGroupId: groupId, relatedReportId: peerId };
      }

      let nextStatus = def.nextStatus;
      let moderationState = def.moderationState;

      if (action === 'dismiss_flag') {
        nextStatus = ['flagged', 'under_review'].includes(report.status) ? 'active' : report.status;
        moderationState = 'cleared';
      }
      if (action === 'escalate') {
        nextStatus = report.status === 'active' || report.status === 'submitted' ? 'under_review' : report.status;
        moderationState = 'escalated';
      }

      if (nextStatus && nextStatus !== report.status) {
        await reportService.transitionStatus(admin.userId, id, nextStatus, composed, {
          asModerator: true,
          moderationState,
        });
      } else if (moderationState) {
        await getPool().query(
          `UPDATE reports SET moderation_state = $2, updated_at = NOW() WHERE id = $1`,
          [id, moderationState]
        );
      }

      if (['approve', 'confirm', 'dismiss_flag', 'restore'].includes(action)) {
        await getPool().query(
          `UPDATE report_flags SET status = 'reviewed', reviewed_at = NOW()
           WHERE report_id = $1 AND status = 'open'`,
          [id]
        );
      } else if (['remove', 'mark_inaccurate', 'mark_duplicate'].includes(action)) {
        await getPool().query(
          `UPDATE report_flags SET status = 'actioned', reviewed_at = NOW()
           WHERE report_id = $1 AND status = 'open'`,
          [id]
        );
      }

      const after = await getPool().query(
        `SELECT status, moderation_state, event_group_id, moderation_priority, related_official_update_id
         FROM reports WHERE id = $1`,
        [id]
      );
      await writeAudit(
        admin,
        {
          action: `moderation.${action}`,
          entityType: 'report',
          entityId: id,
          previousState: prev,
          newState: { ...after.rows[0], reasonCode: reasonCode || null },
          reason: composed,
        },
        req
      );
      return { contentType: 'report', id, status: after.rows[0]?.status, action };
    }

    if (rawType === 'question') {
      const prevRes = await getPool().query(`SELECT status, moderation_state FROM questions WHERE id = $1`, [id]);
      if (!prevRes.rows[0]) throw new AppError('Question not found.', 404, 'NOT_FOUND');
      const prev = prevRes.rows[0];
      let status = prev.status;
      let moderationState = def.moderationState || prev.moderation_state;
      if (['approve', 'restore', 'dismiss_flag'].includes(action)) {
        status = 'open';
        moderationState = 'cleared';
      } else if (['remove', 'mark_inaccurate', 'mark_duplicate'].includes(action)) {
        status = 'removed';
        moderationState = 'actioned';
      } else if (action === 'under_review') {
        status = 'under_review';
        moderationState = 'in_review';
      } else if (action === 'escalate') {
        status = 'under_review';
        moderationState = 'escalated';
      } else if (action === 'confirm') {
        status = 'answered';
        moderationState = 'cleared';
      }
      await getPool().query(
        `UPDATE questions SET status = $2::community_question_status,
           moderation_state = $3::community_moderation_state, updated_at = NOW()
         WHERE id = $1`,
        [id, status, moderationState]
      );
      await writeAudit(
        admin,
        {
          action: `moderation.${action}`,
          entityType: 'question',
          entityId: id,
          previousState: prev,
          newState: { status, moderationState, reasonCode: reasonCode || null },
          reason: composed,
        },
        req
      );
      return { contentType: 'question', id, status, action };
    }

    if (rawType === 'answer') {
      const prevRes = await getPool().query(`SELECT status, moderation_state FROM answers WHERE id = $1`, [id]);
      if (!prevRes.rows[0]) throw new AppError('Answer not found.', 404, 'NOT_FOUND');
      const prev = prevRes.rows[0];
      let status = prev.status;
      let moderationState = def.moderationState || prev.moderation_state;
      if (['approve', 'restore', 'dismiss_flag', 'confirm'].includes(action)) {
        status = 'active';
        moderationState = 'cleared';
      } else if (['remove', 'mark_inaccurate', 'mark_duplicate'].includes(action)) {
        status = 'removed';
        moderationState = 'actioned';
      } else if (action === 'under_review') {
        status = 'under_review';
        moderationState = 'in_review';
      } else if (action === 'escalate') {
        status = 'under_review';
        moderationState = 'escalated';
      }
      await getPool().query(
        `UPDATE answers SET status = $2::community_answer_status,
           moderation_state = $3::community_moderation_state, updated_at = NOW()
         WHERE id = $1`,
        [id, status, moderationState]
      );
      await writeAudit(
        admin,
        {
          action: `moderation.${action}`,
          entityType: 'answer',
          entityId: id,
          previousState: prev,
          newState: { status, moderationState, reasonCode: reasonCode || null },
          reason: composed,
        },
        req
      );
      return { contentType: 'answer', id, status, action };
    }

    throw new AppError('Unsupported moderation target.', 400, 'VALIDATION_ERROR');
  },

  /**
   * Correct report location metadata. Preserves original submission text.
   * Records previous location in audit trail.
   */
  async correctReportLocation(admin, reportId, { locationId, reason }, req) {
    if (!locationId) throw new AppError('locationId is required.', 400, 'VALIDATION_ERROR');
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required for location corrections.', 400, 'VALIDATION_ERROR');
    }
    const pool = getPool();
    const loc = await pool.query(
      `SELECT id, name, status FROM locations WHERE id = $1`,
      [locationId]
    );
    if (!loc.rows[0] || (loc.rows[0].status && loc.rows[0].status !== 'active')) {
      throw new AppError('Location not found or inactive.', 404, 'LOCATION_NOT_FOUND');
    }
    const prev = await pool.query(
      `SELECT id, location_id, title, source_type FROM reports WHERE id = $1`,
      [reportId]
    );
    if (!prev.rows[0]) throw new AppError('Report not found.', 404, 'NOT_FOUND');
    if (prev.rows[0].source_type === 'official') {
      throw new AppError('Cannot reassign location on official-source content here.', 400, 'OFFICIAL_CONTENT_PROTECTED');
    }
    await pool.query(`UPDATE reports SET location_id = $2, updated_at = NOW() WHERE id = $1`, [
      reportId,
      locationId,
    ]);
    await writeAudit(
      admin,
      {
        action: 'moderation.correct_location',
        entityType: 'report',
        entityId: reportId,
        previousState: { locationId: prev.rows[0].location_id },
        newState: { locationId, locationName: loc.rows[0].name },
        reason: String(reason).trim(),
      },
      req
    );
    return { id: reportId, locationId, locationName: loc.rows[0].name };
  },
};
