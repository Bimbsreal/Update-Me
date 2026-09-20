export const DIRECTION_TRAVEL_MODES = [
  { code: 'driving', label: 'Driving' },
  { code: 'public_transport', label: 'Public Transport' },
  { code: 'walking', label: 'Walking' },
];

export function travelModeLabel(code) {
  return DIRECTION_TRAVEL_MODES.find((m) => m.code === code)?.label || code;
}

export function corridorId(originLocationId, destinationLocationId, mode = 'driving') {
  return `corridor_${originLocationId}_${destinationLocationId}_${mode || 'any'}`;
}

export function parseCorridorId(id) {
  if (!id || typeof id !== 'string' || !id.startsWith('corridor_')) return null;
  const parts = id.split('_');
  // corridor_{uuid}_{uuid}_{mode} — UUIDs contain hyphens, so split carefully
  const match = id.match(
    /^corridor_([0-9a-f-]{36})_([0-9a-f-]{36})_([a-z_]+)$/i
  );
  if (!match) return null;
  return {
    originLocationId: match[1],
    destinationLocationId: match[2],
    mode: match[3] === 'any' ? null : match[3],
  };
}

export function knowledgeResultId(knowledgeId) {
  return `knowledge_${knowledgeId}`;
}

export function parseKnowledgeResultId(id) {
  if (!id || typeof id !== 'string' || !id.startsWith('knowledge_')) return null;
  const uuid = id.slice('knowledge_'.length);
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  return uuid;
}

export function transportResultId(routeId) {
  return `transport_${routeId}`;
}

export function parseTransportResultId(id) {
  if (!id || typeof id !== 'string' || !id.startsWith('transport_')) return null;
  const uuid = id.slice('transport_'.length);
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  return uuid;
}
