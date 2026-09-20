import { Router } from 'express';

/**
 * Domain route stubs for future implementation.
 * Keep handlers lightweight — no business logic in the foundation phase.
 */
export function createStubRouter(domain) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(501).json({
      success: false,
      domain,
      message: `${domain} endpoints are not implemented yet`,
    });
  });

  return router;
}
