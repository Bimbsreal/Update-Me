import {
  createLocalKnowledgeSchema,
  directionsIdParamSchema,
  listLocalKnowledgeQuerySchema,
  localKnowledgeConfirmSchema,
  localKnowledgeCorrectSchema,
  localKnowledgeIdParamSchema,
  searchDirectionsQuerySchema,
} from '../validators/directions.js';
import { directionsService } from '../services/directionsService.js';

export async function getDirectionsTaxonomy(_req, res, next) {
  try {
    return res.json({ success: true, ...directionsService.taxonomy() });
  } catch (error) {
    return next(error);
  }
}

export async function searchDirections(req, res, next) {
  try {
    const query = searchDirectionsQuerySchema.parse(req.query);
    const data = await directionsService.search(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function getDirectionsDetail(req, res, next) {
  try {
    const { id } = directionsIdParamSchema.parse(req.params);
    const data = await directionsService.getById(id);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function listLocalKnowledge(req, res, next) {
  try {
    const query = listLocalKnowledgeQuerySchema.parse(req.query);
    const data = await directionsService.listLocalKnowledge(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function createLocalKnowledge(req, res, next) {
  try {
    const body = createLocalKnowledgeSchema.parse(req.body);
    const knowledge = await directionsService.createLocalKnowledge(req.auth.userId, body);
    return res.status(201).json({ success: true, knowledge });
  } catch (error) {
    return next(error);
  }
}

export async function confirmLocalKnowledge(req, res, next) {
  try {
    const { id } = localKnowledgeIdParamSchema.parse(req.params);
    const body = localKnowledgeConfirmSchema.parse(req.body || {});
    const knowledge = await directionsService.confirmKnowledge(req.auth.userId, id, body);
    return res.json({ success: true, knowledge });
  } catch (error) {
    return next(error);
  }
}

export async function correctLocalKnowledge(req, res, next) {
  try {
    const { id } = localKnowledgeIdParamSchema.parse(req.params);
    const body = localKnowledgeCorrectSchema.parse(req.body);
    const knowledge = await directionsService.correctKnowledge(req.auth.userId, id, body);
    return res.json({ success: true, knowledge });
  } catch (error) {
    return next(error);
  }
}
