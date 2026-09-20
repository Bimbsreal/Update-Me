import {
  exploreQuerySchema,
  exploreSearchQuerySchema,
} from '../validators/explore.js';
import { exploreService } from '../services/exploreService.js';

export async function getExplore(req, res, next) {
  try {
    const query = exploreQuerySchema.parse(req.query);
    const data = await exploreService.explore(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function searchExplore(req, res, next) {
  try {
    const query = exploreSearchQuerySchema.parse(req.query);
    const data = await exploreService.search(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function exploreTaxonomy(_req, res, next) {
  try {
    return res.json({ success: true, taxonomy: exploreService.getTaxonomy() });
  } catch (error) {
    return next(error);
  }
}
