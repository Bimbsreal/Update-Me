import {
  globalSearchQuerySchema,
  searchSuggestQuerySchema,
} from '../validators/search.js';
import { searchService } from '../services/searchService.js';
import { AppError } from '../middleware/errorHandler.js';

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

export async function globalSearch(req, res, next) {
  try {
    const query = globalSearchQuerySchema.parse(req.query);
    const data = await searchService.search(query);

    if (req.auth?.userId && query.mode === 'full' && query.q.trim().length >= 2) {
      searchService.recordRecent(req.auth.userId, query.q).catch(() => {});
    }

    return ok(res, data);
  } catch (error) {
    return next(error);
  }
}

export async function suggestSearch(req, res, next) {
  try {
    const query = searchSuggestQuerySchema.parse(req.query);
    const data = await searchService.suggest(query);
    return ok(res, data);
  } catch (error) {
    return next(error);
  }
}

export async function listRecentSearches(req, res, next) {
  try {
    if (!req.auth?.userId) {
      throw new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED');
    }
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const data = await searchService.listRecent(req.auth.userId, { limit });
    return ok(res, data);
  } catch (error) {
    return next(error);
  }
}

export async function clearRecentSearches(req, res, next) {
  try {
    if (!req.auth?.userId) {
      throw new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED');
    }
    const data = await searchService.clearRecent(req.auth.userId);
    return ok(res, data);
  } catch (error) {
    return next(error);
  }
}
