import { getPool } from '../db/pool.js';
import {
  COMMUNITY_CONFIRMED_USEFUL_THRESHOLD,
  communityCategoryLabel,
} from '../config/community.js';

function computeQuestionFreshness(row, now = new Date()) {
  if (row.status === 'expired' || (row.expires_at && new Date(row.expires_at) <= now)) {
    return 'expired';
  }
  if (row.status === 'flagged' || row.status === 'under_review') return 'under_review';
  if (row.status === 'removed') return 'removed';
  return 'current';
}

function answerTrustLabels(row) {
  const labels = [];
  if (Number(row.useful_count || 0) >= COMMUNITY_CONFIRMED_USEFUL_THRESHOLD) {
    labels.push('Community Confirmed');
  } else {
    labels.push('Useful response');
  }
  if (Number(row.inaccurate_count || 0) > 0 || Number(row.needs_correction_count || 0) > 0) {
    labels.push('Needs review');
  }
  if (row.status === 'flagged' || row.moderation_state === 'flagged') {
    labels.push('Under Review');
  }
  return [...new Set(labels)];
}

function mapLocation(row) {
  if (!row.location_id) return null;
  return {
    id: row.location_id,
    name: row.location_name,
    type: row.location_type,
    slug: row.location_slug,
    subtitle: row.location_subtitle,
    state: row.state_name
      ? { id: row.state_id, name: row.state_name, code: row.state_code }
      : null,
    lga: row.lga_name ? { id: row.lga_id, name: row.lga_name } : null,
    area: row.area_name ? { id: row.area_id, name: row.area_name } : null,
  };
}

function mapQuestion(row) {
  if (!row) return null;
  const freshness = computeQuestionFreshness(row);
  return {
    id: row.id,
    title: row.title,
    description: row.description || null,
    category: row.category,
    categoryLabel: communityCategoryLabel(row.category),
    status: row.status,
    moderationState: row.moderation_state,
    freshness,
    expired: freshness === 'expired',
    expiresAt: row.expires_at,
    answerCount: Number(row.answer_count || 0),
    usefulResponseCount: Number(row.useful_response_count || 0),
    flagCount: Number(row.flag_count || 0),
    relatedGroupId: row.related_group_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Privacy: id only — no display names on public community cards
    author: row.user_id ? { id: row.user_id } : null,
    location: mapLocation(row),
  };
}

function mapAnswer(row) {
  if (!row) return null;
  return {
    id: row.id,
    questionId: row.question_id,
    content: row.content,
    status: row.status,
    moderationState: row.moderation_state,
    usefulCount: Number(row.useful_count || 0),
    inaccurateCount: Number(row.inaccurate_count || 0),
    needsCorrectionCount: Number(row.needs_correction_count || 0),
    trustLabels: answerTrustLabels(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: row.user_id ? { id: row.user_id } : null,
    location: row.answer_location_id
      ? {
          id: row.answer_location_id,
          name: row.answer_location_name,
          type: row.answer_location_type,
        }
      : null,
  };
}

const questionSelect = `
  q.id,
  q.user_id,
  q.location_id,
  q.category,
  q.title,
  q.description,
  q.status,
  q.moderation_state,
  q.expires_at,
  q.answer_count,
  q.useful_response_count,
  q.flag_count,
  q.related_group_id,
  q.created_at,
  q.updated_at,
  loc.name AS location_name,
  loc.type AS location_type,
  loc.slug AS location_slug,
  loc.state_id,
  loc.lga_id,
  loc.area_id,
  st.name AS state_name,
  st.code AS state_code,
  lg.name AS lga_name,
  ar.name AS area_name,
  CASE
    WHEN loc.type = 'area' THEN
      CONCAT_WS(' · ',
        CASE WHEN lg.name IS NOT NULL THEN lg.name || ' LGA' END,
        CASE
          WHEN st.code = 'FC' THEN st.name
          WHEN st.name IS NOT NULL THEN st.name || ' State'
        END
      )
    WHEN loc.type = 'lga' THEN
      CASE
        WHEN st.code = 'FC' THEN st.name
        WHEN st.name IS NOT NULL THEN st.name || ' State'
      END
    ELSE st.name
  END AS location_subtitle
`;

const questionFrom = `
  FROM questions q
  JOIN locations loc ON loc.id = q.location_id
  LEFT JOIN states st ON st.id = loc.state_id
  LEFT JOIN lgas lg ON lg.id = loc.lga_id
  LEFT JOIN areas ar ON ar.id = loc.area_id
`;
export const communityRepository = {
  mapQuestion,
  mapAnswer,

  async applyExpiryTransitions() {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE questions
       SET status = 'expired', updated_at = NOW()
       WHERE status IN ('open', 'answered')
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
       RETURNING id`
    );
    for (const row of result.rows) {
      await pool.query(
        `INSERT INTO question_history (question_id, event_type, reason, new_state)
         VALUES ($1, 'expired', 'Question relevance period ended', $2::jsonb)`,
        [row.id, JSON.stringify({ status: 'expired' })]
      );
    }
    return result.rowCount;
  },

  async createQuestion(input) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO questions (
         user_id, location_id, category, title, description, status, expires_at
       ) VALUES ($1,$2,$3,$4,$5,'open',$6)
       RETURNING id`,
      [
        input.userId,
        input.locationId,
        input.category,
        input.title,
        input.description || null,
        input.expiresAt || null,
      ]
    );
    return this.findQuestionRawById(result.rows[0].id);
  },

  async findQuestionRawById(id) {
    const result = await getPool().query(`SELECT * FROM questions WHERE id = $1`, [id]);
    return result.rows[0] || null;
  },

  async findQuestionById(id) {
    const result = await getPool().query(
      `SELECT ${questionSelect} ${questionFrom} WHERE q.id = $1`,
      [id]
    );
    return mapQuestion(result.rows[0]);
  },

  async listQuestions(query) {
    const pool = getPool();
    const conditions = [`q.status <> 'removed'`];
    const params = [];
    let i = 1;

    if (query.locationId) {
      conditions.push(`q.location_id = $${i++}`);
      params.push(query.locationId);
    }
    if (query.category) {
      conditions.push(`q.category = $${i++}`);
      params.push(query.category);
    }
    if (query.status && query.status !== 'any') {
      conditions.push(`q.status = $${i++}`);
      params.push(query.status);
    } else if (!query.includeExpired) {
      conditions.push(`q.status IN ('open', 'answered')`);
      conditions.push(`(q.expires_at IS NULL OR q.expires_at > NOW())`);
    }
    if (query.q) {
      conditions.push(
        `(q.title ILIKE $${i} OR COALESCE(q.description, '') ILIKE $${i} OR loc.name ILIKE $${i})`
      );
      params.push(`%${query.q}%`);
      i += 1;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    let orderBy = `q.created_at DESC`;
    if (query.sort === 'unanswered') {
      orderBy = `CASE WHEN q.answer_count = 0 THEN 0 ELSE 1 END, q.created_at DESC`;
    } else if (query.sort === 'answered') {
      orderBy = `CASE WHEN q.answer_count > 0 THEN 0 ELSE 1 END, q.created_at DESC`;
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total ${questionFrom} ${where}`,
      params
    );
    const listResult = await pool.query(
      `SELECT ${questionSelect} ${questionFrom} ${where}
       ORDER BY ${orderBy}
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    return {
      items: listResult.rows.map(mapQuestion),
      page,
      limit,
      total: countResult.rows[0].total,
    };
  },

  async findRecentDuplicate({ userId, locationId, title }) {
    const result = await getPool().query(
      `SELECT id FROM questions
       WHERE user_id = $1
         AND location_id = $2
         AND lower(trim(title)) = lower(trim($3))
         AND created_at > NOW() - INTERVAL '24 hours'
         AND status <> 'removed'
       LIMIT 1`,
      [userId, locationId, title]
    );
    return result.rows[0] || null;
  },

  async updateQuestion(id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    const map = {
      status: 'status',
      moderationState: 'moderation_state',
      flagCount: 'flag_count',
      answerCount: 'answer_count',
      usefulResponseCount: 'useful_response_count',
      relatedGroupId: 'related_group_id',
      title: 'title',
      description: 'description',
      expiresAt: 'expires_at',
    };
    for (const [key, column] of Object.entries(map)) {
      if (fields[key] !== undefined) {
        sets.push(`${column} = $${i++}`);
        params.push(fields[key]);
      }
    }
    if (!sets.length) return this.findQuestionById(id);
    sets.push(`updated_at = NOW()`);
    params.push(id);
    await getPool().query(
      `UPDATE questions SET ${sets.join(', ')} WHERE id = $${i}`,
      params
    );
    return this.findQuestionById(id);
  },

  async addHistory({ questionId, answerId = null, actorUserId = null, eventType, previousState, newState, reason }) {
    await getPool().query(
      `INSERT INTO question_history
         (question_id, answer_id, actor_user_id, event_type, previous_state, new_state, reason)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
      [
        questionId,
        answerId,
        actorUserId,
        eventType,
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        reason || null,
      ]
    );
  },

  async createAnswer(input) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO answers (question_id, user_id, content, location_id, status)
         VALUES ($1,$2,$3,$4,'active')
         RETURNING id`,
        [input.questionId, input.userId, input.content, input.locationId || null]
      );
      await client.query(
        `UPDATE questions
         SET answer_count = answer_count + 1,
             status = CASE WHEN status = 'open' THEN 'answered'::community_question_status ELSE status END,
             updated_at = NOW()
         WHERE id = $1`,
        [input.questionId]
      );
      await client.query('COMMIT');
      return this.findAnswerById(inserted.rows[0].id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async findAnswerRawById(id) {
    const result = await getPool().query(`SELECT * FROM answers WHERE id = $1`, [id]);
    return result.rows[0] || null;
  },

  async findAnswerById(id) {
    const result = await getPool().query(
      `SELECT a.*,
              al.name AS answer_location_name,
              al.type AS answer_location_type,
              a.location_id AS answer_location_id
       FROM answers a
       LEFT JOIN locations al ON al.id = a.location_id
       WHERE a.id = $1`,
      [id]
    );
    return mapAnswer(result.rows[0]);
  },

  async listAnswersForQuestion(questionId) {
    const result = await getPool().query(
      `SELECT a.*,
              al.name AS answer_location_name,
              al.type AS answer_location_type,
              a.location_id AS answer_location_id
       FROM answers a
       LEFT JOIN locations al ON al.id = a.location_id
       WHERE a.question_id = $1 AND a.status <> 'removed'
       ORDER BY a.useful_count DESC, a.created_at ASC`,
      [questionId]
    );
    return result.rows.map(mapAnswer);
  },

  async updateAnswer(id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    const map = {
      content: 'content',
      status: 'status',
      moderationState: 'moderation_state',
      usefulCount: 'useful_count',
      inaccurateCount: 'inaccurate_count',
      needsCorrectionCount: 'needs_correction_count',
      locationId: 'location_id',
    };
    for (const [key, column] of Object.entries(map)) {
      if (fields[key] !== undefined) {
        sets.push(`${column} = $${i++}`);
        params.push(fields[key]);
      }
    }
    if (!sets.length) return this.findAnswerById(id);
    sets.push(`updated_at = NOW()`);
    params.push(id);
    await getPool().query(`UPDATE answers SET ${sets.join(', ')} WHERE id = $${i}`, params);
    return this.findAnswerById(id);
  },

  async findFeedback(answerId, userId) {
    const result = await getPool().query(
      `SELECT * FROM answer_feedback WHERE answer_id = $1 AND user_id = $2`,
      [answerId, userId]
    );
    return result.rows[0] || null;
  },

  async createFeedback({ answerId, userId, feedbackType, note }) {
    await getPool().query(
      `INSERT INTO answer_feedback (answer_id, user_id, feedback_type, note)
       VALUES ($1,$2,$3,$4)`,
      [answerId, userId, feedbackType, note || null]
    );
  },

  async recountAnswerFeedback(answerId) {
    const result = await getPool().query(
      `SELECT
         COUNT(*) FILTER (WHERE feedback_type = 'useful')::int AS useful,
         COUNT(*) FILTER (WHERE feedback_type = 'no_longer_accurate')::int AS inaccurate,
         COUNT(*) FILTER (WHERE feedback_type = 'needs_correction')::int AS needs_correction
       FROM answer_feedback WHERE answer_id = $1`,
      [answerId]
    );
    return result.rows[0];
  },

  async recountUsefulResponses(questionId) {
    const result = await getPool().query(
      `SELECT COUNT(*)::int AS count
       FROM answers
       WHERE question_id = $1
         AND status = 'active'
         AND useful_count > 0`,
      [questionId]
    );
    return result.rows[0].count;
  },

  async findFlag(questionId, userId) {
    const result = await getPool().query(
      `SELECT * FROM question_flags WHERE question_id = $1 AND user_id = $2`,
      [questionId, userId]
    );
    return result.rows[0] || null;
  },

  async createFlag({ questionId, userId, reason, details }) {
    await getPool().query(
      `INSERT INTO question_flags (question_id, user_id, reason, details)
       VALUES ($1,$2,$3,$4)`,
      [questionId, userId, reason, details || null]
    );
  },

  async ensureRelatedGroup({ category, locationId, title }) {
    const pool = getPool();
    const existing = await pool.query(
      `SELECT id FROM community_question_groups
       WHERE category = $1
         AND location_id = $2
         AND lower(trim(COALESCE(title, ''))) = lower(trim($3))
       LIMIT 1`,
      [category, locationId, title]
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const created = await pool.query(
      `INSERT INTO community_question_groups (category, location_id, title, notes)
       VALUES ($1,$2,$3,$4)
       RETURNING id`,
      [category, locationId, title, 'Prepared for related-question linking (no auto-merge).']
    );
    return created.rows[0].id;
  },

  async linkRelatedQuestions(groupId, locationId, category) {
    // Soft-link recent similar open questions — never delete
    await getPool().query(
      `UPDATE questions
       SET related_group_id = $1, updated_at = NOW()
       WHERE location_id = $2
         AND category = $3
         AND status IN ('open', 'answered')
         AND related_group_id IS NULL
         AND created_at > NOW() - INTERVAL '7 days'`,
      [groupId, locationId, category]
    );
  },
};
