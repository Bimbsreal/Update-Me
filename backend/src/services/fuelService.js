import { AppError } from '../middleware/errorHandler.js';
import {
  availabilityLabel,
  defaultUnitForFuelType,
  fuelTypeLabel,
  queueLabel,
} from '../config/fuel.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { fuelRepository } from '../repositories/fuelRepository.js';
import { officialService } from './officialService.js';
import { reportService } from './reportService.js';
import { realtimePublisher } from '../realtime/publisher.js';

function formatPrice(amount, unit = 'litre') {
  if (amount == null) return null;
  const formatted = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(Number(amount));
  const unitLabel = unit === 'kg' ? 'kg' : unit === 'cylinder' ? 'cylinder' : 'L';
  return `${formatted}/${unitLabel}`;
}

function buildTitle(input, station) {
  if (input.title?.trim()) return input.title.trim();
  const type = fuelTypeLabel(input.fuelType);
  const avail = availabilityLabel(input.availability);
  const stationName = station.name;
  if (input.priceAmount != null) {
    return `${type} at ${stationName} — ${formatPrice(input.priceAmount, input.priceUnit || defaultUnitForFuelType(input.fuelType))}`;
  }
  return `${type} at ${stationName} — ${avail}`;
}

function buildDescription(input, station) {
  if (input.notes?.trim()) return input.notes.trim();
  const parts = [
    `Station: ${station.name}`,
    `Fuel: ${fuelTypeLabel(input.fuelType)}`,
    `Availability: ${availabilityLabel(input.availability)}`,
  ];
  if (input.priceAmount != null) {
    parts.push(
      `Price: ${formatPrice(input.priceAmount, input.priceUnit || defaultUnitForFuelType(input.fuelType))}`
    );
  }
  if (input.queueCondition && input.queueCondition !== 'unknown') {
    parts.push(`Queue: ${queueLabel(input.queueCondition)}`);
  }
  parts.push('Community fuel update. Confirm if you are nearby and this still matches what you see.');
  return parts.join('. ');
}

export const fuelService = {
  async createStation(userId, input) {
    const location = await locationRepository.findById(input.locationId);
    if (!location) {
      throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    }

    const existing = await fuelRepository.findStationRawByNameLocation(
      input.name,
      input.locationId
    );
    if (existing) {
      throw new AppError(
        'A fuel station with this name already exists in that location.',
        409,
        'STATION_DUPLICATE'
      );
    }

    const coords = location.coordinates || {};
    return fuelRepository.createStation({
      name: input.name,
      brand: input.brand,
      locationId: input.locationId,
      latitude: input.latitude ?? coords.lat ?? null,
      longitude: input.longitude ?? coords.lng ?? null,
      address: input.address,
      landmarkLabel: input.landmarkLabel,
      roadName: input.roadName,
      createdBy: userId,
    });
  },

  async listStations(query) {
    await reportRepository.applyFreshnessTransitions();
    return fuelRepository.listStations(query);
  },

  async nearbyStations(query) {
    await reportRepository.applyFreshnessTransitions();
    return fuelRepository.nearbyStations(query);
  },

  async getStation(id, { fuelType = 'pms' } = {}) {
    await reportRepository.applyFreshnessTransitions();
    const station = await fuelRepository.findStationById(id);
    if (!station || !station.isActive) {
      throw new AppError('Fuel station not found.', 404, 'STATION_NOT_FOUND');
    }

    const { fuelAdminService } = await import('./fuelAdminService.js');
    const [reports, official, history] = await Promise.all([
      fuelRepository.listFuelReports({
        stationId: id,
        freshness: 'any',
        page: 1,
        limit: 20,
      }),
      officialService
        .list({
          category: 'fuel_petroleum',
          page: 1,
          limit: 5,
        })
        .catch(() => ({ items: [] })),
      fuelAdminService.priceHistory(id, { fuelType, limit: 40 }).catch(() => ({ items: [] })),
    ]);

    const chartPoints = (history.items || [])
      .filter((h) => h.price?.amount != null)
      .map((h) => ({
        rate: Number(h.price.amount),
        at: h.observedAt,
        sourceType: h.sourceType,
        label: h.trustLabel,
      }));

    return {
      station,
      recentReports: reports.items,
      officialUpdates: (official.items || []).filter((item) => item.isOfficial),
      priceHistory: {
        fuelType,
        items: history.items || [],
        points: chartPoints,
        note: 'Historical observations only. Do not treat older points as the current pump price.',
      },
      asOf: new Date().toISOString(),
    };
  },

  async createReport(userId, input) {
    let station = null;
    if (input.stationId) {
      station = await fuelRepository.findStationById(input.stationId);
      if (!station) throw new AppError('Fuel station not found.', 404, 'STATION_NOT_FOUND');
    } else if (input.newStation) {
      station = await this.createStation(userId, {
        ...input.newStation,
        locationId: input.newStation.locationId || input.locationId,
        latitude: input.latitude,
        longitude: input.longitude,
      });
    } else {
      throw new AppError('Select a station or provide a new station name.', 400, 'STATION_REQUIRED');
    }

    const locationId = input.locationId || station.location.id;
    const location = await locationRepository.findById(locationId);
    if (!location) {
      throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    }

    const priceUnit = input.priceUnit || defaultUnitForFuelType(input.fuelType);
    const title = buildTitle({ ...input, priceUnit }, station);
    const description = buildDescription({ ...input, priceUnit }, station);

    const coords = station.coordinates || {};
    const report = await reportService.create(userId, {
      category: 'fuel',
      title,
      description,
      locationId,
      latitude: input.latitude ?? coords.lat ?? null,
      longitude: input.longitude ?? coords.lng ?? null,
      occurredAt: input.observedAt || undefined,
      metadata: {
        module: 'fuel',
        fuelType: input.fuelType,
        availability: input.availability,
        stationId: station.id,
      },
    });

    // Community reports only via this path — never official
    if (report.sourceType === 'official') {
      throw new AppError('Invalid report source.', 400, 'INVALID_SOURCE');
    }

    const fuel = await fuelRepository.createFuelReport({
      reportId: report.id,
      stationId: station.id,
      fuelType: input.fuelType,
      availability: input.availability,
      priceAmount: input.priceAmount ?? null,
      priceCurrency: 'NGN',
      priceUnit,
      queueCondition: input.queueCondition || 'unknown',
      pricingContext: input.pricingContext || 'retail_pump',
      observedAt: input.observedAt || null,
    });

    await reportRepository.addHistory({
      reportId: report.id,
      actorUserId: userId,
      eventType: 'system',
      previousState: null,
      newState: {
        fuelId: fuel.id,
        stationId: station.id,
        fuelType: input.fuelType,
        availability: input.availability,
        priceAmount: input.priceAmount ?? null,
      },
      reason: 'Fuel-specific details attached',
    });

    realtimePublisher.fuelUpdated(fuel);

    if (input.priceAmount != null) {
      const { notificationService, safeNotify } = await import('./notificationService.js');
      safeNotify(
        notificationService.notifyFuelObservation(
          {
            stationId: station.id,
            station: { id: station.id, name: station.name, locationId },
            locationId,
            locationName: location.name,
            fuelType: input.fuelType,
            price: input.priceAmount,
            note: description,
          },
          { actorUserId: userId }
        )
      );
    }

    return fuel;
  },

  async listReports(query) {
    await reportRepository.applyFreshnessTransitions();
    return fuelRepository.listFuelReports(query);
  },

  async getReport(id, viewerUserId = null) {
    await reportRepository.applyFreshnessTransitions();
    const fuel = await fuelRepository.findFuelReportById(id);
    if (!fuel) throw new AppError('Fuel report not found.', 404, 'FUEL_NOT_FOUND');
    if (fuel.report.status === 'removed' && fuel.report.author?.id !== viewerUserId) {
      throw new AppError('Fuel report not found.', 404, 'FUEL_NOT_FOUND');
    }
    return fuel;
  },

  async confirm(userId, id, body) {
    const raw = await fuelRepository.findRawFuelById(id);
    if (!raw) throw new AppError('Fuel report not found.', 404, 'FUEL_NOT_FOUND');
    await reportService.confirm(userId, raw.report_id, body);
    return this.getReport(id, userId);
  },

  async correct(userId, id, body) {
    const raw = await fuelRepository.findRawFuelById(id);
    if (!raw) throw new AppError('Fuel report not found.', 404, 'FUEL_NOT_FOUND');
    await reportService.correct(userId, raw.report_id, body);
    return this.getReport(id, userId);
  },

  async history(id) {
    const raw = await fuelRepository.findRawFuelById(id);
    if (!raw) throw new AppError('Fuel report not found.', 404, 'FUEL_NOT_FOUND');
    return reportService.history(raw.report_id);
  },

  async summary(query) {
    await reportRepository.applyFreshnessTransitions();
    return fuelRepository.summary(query);
  },
};
