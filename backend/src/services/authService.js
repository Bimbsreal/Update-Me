import bcrypt from 'bcryptjs';
import { AppError } from '../middleware/errorHandler.js';
import { detectContactType, normalizeContact } from '../validators/auth.js';
import { geoRepository, userRepository } from '../repositories/userRepository.js';
import { locationRepository } from '../repositories/locationRepository.js';
import {
  isWithinNigeriaBounds,
  isLowAccuracy,
  MAX_RESOLVE_DISTANCE_KM,
} from '../utils/geoBounds.js';

const SALT_ROUNDS = 12;

function normalizePhone(value) {
  return normalizeContact(value).replace(/[\s()-]/g, '');
}

export const authService = {
  async register({ fullName, contact, password }) {
    const type = detectContactType(contact);
    const email = type === 'email' ? normalizeContact(contact).toLowerCase() : null;
    const phone = type === 'phone' ? normalizePhone(contact) : null;

    if (email) {
      const existing = await userRepository.findByEmail(email);
      if (existing) {
        throw new AppError(
          'Unable to create this account. Try signing in or use a different contact.',
          409,
          'DUPLICATE_ACCOUNT'
        );
      }
    }
    if (phone) {
      const existing = await userRepository.findByPhone(phone);
      if (existing) {
        throw new AppError(
          'Unable to create this account. Try signing in or use a different contact.',
          409,
          'DUPLICATE_ACCOUNT'
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userRepository.create({
      displayName: fullName.trim(),
      email,
      phone,
      passwordHash,
    });

    return userRepository.toPublic(user);
  },

  async login({ contact, password }) {
    const type = detectContactType(contact);
    if (!type) {
      throw new AppError('Enter a valid email address or phone number.', 400, 'VALIDATION_ERROR');
    }

    const user =
      type === 'email'
        ? await userRepository.findByEmail(normalizeContact(contact).toLowerCase())
        : await userRepository.findByPhone(normalizePhone(contact));

    if (!user?.password_hash) {
      throw new AppError('Incorrect email/phone or password.', 401, 'INVALID_CREDENTIALS');
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      throw new AppError('Incorrect email/phone or password.', 401, 'INVALID_CREDENTIALS');
    }

    if (user.is_active === false || user.suspended_at) {
      throw new AppError(
        'This account is suspended. Contact support if you need help.',
        403,
        'ACCOUNT_SUSPENDED'
      );
    }

    return userRepository.toPublic(user);
  },

  async me(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found.', 404, 'NOT_FOUND');
    }
    return userRepository.toPublic(user);
  },

  async setLocation(userId, areaId) {
    const area = await geoRepository.findAreaById(areaId);
    if (!area) {
      throw new AppError('Selected area was not found.', 404, 'AREA_NOT_FOUND');
    }
    const user = await userRepository.setCurrentArea(userId, area);
    return userRepository.toPublic(user);
  },

  async resolveLocation(lat, lng, { accuracy } = {}) {
    if (!isWithinNigeriaBounds(lat, lng)) {
      throw new AppError(
        'Coordinates are outside the supported Nigeria coverage area.',
        400,
        'LOCATION_OUT_OF_BOUNDS'
      );
    }

    const area = await geoRepository.findNearestArea(lat, lng, {
      maxDistanceKm: MAX_RESOLVE_DISTANCE_KM,
    });
    if (!area) {
      throw new AppError(
        'We could not match that location to a known area. Please choose manually.',
        404,
        'LOCATION_LOOKUP_FAILED'
      );
    }

    let locationId = null;
    try {
      const nearby = await locationRepository.nearby({
        lat,
        lng,
        radiusKm: MAX_RESOLVE_DISTANCE_KM,
        type: 'area',
        limit: 1,
      });
      locationId = nearby[0]?.id || null;
      if (!locationId) {
        const areaLoc = await locationRepository.findAreaLocationByAreaId(area.id);
        locationId = areaLoc?.id || null;
      }
    } catch {
      locationId = null;
    }

    const lowAccuracy = isLowAccuracy(accuracy);

    return {
      id: area.id,
      locationId,
      name: area.name,
      lga: area.lga_name,
      state: area.state_name,
      stateCode: area.state_code,
      distanceKm: Number(area.distance_km?.toFixed?.(1) ?? area.distance_km),
      ...(lowAccuracy != null ? { lowAccuracy } : {}),
    };
  },
};

export const geoService = {
  listStates: () => geoRepository.listStates(),
  listLgas: (stateId) => geoRepository.listLgas(stateId),
  listAreas: (lgaId) => geoRepository.listAreas(lgaId),
};
