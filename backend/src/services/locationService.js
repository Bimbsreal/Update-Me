import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { geoRepository, userRepository } from '../repositories/userRepository.js';

export const locationService = {
  search: (query) => locationRepository.search(query),
  nearby: (query) => locationRepository.nearby(query),
  listStates: (country) => locationRepository.listStates(country),
  listLgas: (stateId) => locationRepository.listLgas(stateId),
  listAreas: (lgaId) => locationRepository.listAreas(lgaId),
  capabilities: () => locationRepository.getCapabilities(),

  async getById(id) {
    const location = await locationRepository.findById(id);
    if (!location) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
    return location;
  },

  async getBySlugOrId(value) {
    const location = await locationRepository.findBySlugOrId(value);
    if (!location) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
    return location;
  },

  async setUserLocation(userId, { locationId, areaId, privateLat, privateLng }) {
    let area = null;
    let location = null;

    if (locationId) {
      location = await locationRepository.findById(locationId);
      if (!location) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');

      if (location.type === 'area' && location.area?.id) {
        area = await geoRepository.findAreaById(location.area.id);
      } else {
        throw new AppError(
          'Please select an area (neighbourhood) as your primary location.',
          400,
          'AREA_REQUIRED'
        );
      }
    } else if (areaId) {
      area = await geoRepository.findAreaById(areaId);
      if (!area) throw new AppError('Selected area was not found.', 404, 'AREA_NOT_FOUND');
      location = await locationRepository.findAreaLocationByAreaId(area.id);
    }

    if (!area) throw new AppError('Selected area was not found.', 404, 'AREA_NOT_FOUND');

    await getPool().query(
      `UPDATE users
       SET current_area_id = $2,
           current_lga_id = $3,
           current_state_id = $4,
           current_location_id = $5,
           private_lat = COALESCE($6, private_lat),
           private_lng = COALESCE($7, private_lng),
           onboarding_completed = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [
        userId,
        area.id,
        area.lga_id,
        area.state_id,
        location?.id || null,
        privateLat ?? null,
        privateLng ?? null,
      ]
    );

    return userRepository.toPublic(await userRepository.findById(userId));
  },
};
