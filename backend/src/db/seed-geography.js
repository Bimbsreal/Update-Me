import { getPool, closePool } from './pool.js';

/** Nationwide Nigeria seed — multiple states (not Lagos-only). */
const STATES = [
  ['AB', 'Abia', 'Umuahia'],
  ['AD', 'Adamawa', 'Yola'],
  ['AK', 'Akwa Ibom', 'Uyo'],
  ['AN', 'Anambra', 'Awka'],
  ['BA', 'Bauchi', 'Bauchi'],
  ['BY', 'Bayelsa', 'Yenagoa'],
  ['BE', 'Benue', 'Makurdi'],
  ['BO', 'Borno', 'Maiduguri'],
  ['CR', 'Cross River', 'Calabar'],
  ['DE', 'Delta', 'Asaba'],
  ['EB', 'Ebonyi', 'Abakaliki'],
  ['ED', 'Edo', 'Benin City'],
  ['EK', 'Ekiti', 'Ado-Ekiti'],
  ['EN', 'Enugu', 'Enugu'],
  ['FC', 'FCT', 'Abuja'],
  ['GO', 'Gombe', 'Gombe'],
  ['IM', 'Imo', 'Owerri'],
  ['JI', 'Jigawa', 'Dutse'],
  ['KD', 'Kaduna', 'Kaduna'],
  ['KN', 'Kano', 'Kano'],
  ['KT', 'Katsina', 'Katsina'],
  ['KE', 'Kebbi', 'Birnin Kebbi'],
  ['KO', 'Kogi', 'Lokoja'],
  ['KW', 'Kwara', 'Ilorin'],
  ['LA', 'Lagos', 'Ikeja'],
  ['NA', 'Nasarawa', 'Lafia'],
  ['NI', 'Niger', 'Minna'],
  ['OG', 'Ogun', 'Abeokuta'],
  ['ON', 'Ondo', 'Akure'],
  ['OS', 'Osun', 'Osogbo'],
  ['OY', 'Oyo', 'Ibadan'],
  ['PL', 'Plateau', 'Jos'],
  ['RI', 'Rivers', 'Port Harcourt'],
  ['SO', 'Sokoto', 'Sokoto'],
  ['TA', 'Taraba', 'Jalingo'],
  ['YO', 'Yobe', 'Damaturu'],
  ['ZA', 'Zamfara', 'Gusau'],
];

/** Sample LGAs and areas across several states for onboarding selection. */
const GEOGRAPHY = {
  LA: {
    lgas: {
      'Eti-Osa': [
        { name: 'Lekki Phase 1', lat: 6.4474, lng: 3.4723 },
        { name: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
        { name: 'Ikoyi', lat: 6.4541, lng: 3.4358 },
        { name: 'Ajah', lat: 6.4698, lng: 3.5852 },
      ],
      Ikeja: [
        { name: 'Ikeja GRA', lat: 6.6018, lng: 3.3515 },
        { name: 'Computer Village', lat: 6.6010, lng: 3.3426 },
        { name: 'Maryland', lat: 6.5692, lng: 3.3674 },
      ],
      'Lagos Island': [
        { name: 'CMS', lat: 6.4549, lng: 3.3890 },
        { name: 'Marina', lat: 6.4483, lng: 3.3903 },
      ],
      Surulere: [
        { name: 'Surulere', lat: 6.4969, lng: 3.3565 },
        { name: 'Aguda', lat: 6.5020, lng: 3.3480 },
      ],
      Alimosho: [
        { name: 'Egbeda', lat: 6.5910, lng: 3.2910 },
        { name: 'Ikotun', lat: 6.5570, lng: 3.2550 },
      ],
    },
  },
  FC: {
    lgas: {
      Abuja: [
        { name: 'Central Business District', lat: 9.0579, lng: 7.4951 },
        { name: 'Garki', lat: 9.0330, lng: 7.4850 },
        { name: 'Wuse', lat: 9.0640, lng: 7.4800 },
        { name: 'Maitama', lat: 9.0880, lng: 7.4900 },
      ],
      Bwari: [{ name: 'Bwari', lat: 9.2800, lng: 7.3800 }],
      Gwagwalada: [{ name: 'Gwagwalada', lat: 8.9400, lng: 7.0800 }],
    },
  },
  RI: {
    lgas: {
      'Port Harcourt': [
        { name: 'Port Harcourt City', lat: 4.8156, lng: 7.0498 },
        { name: 'GRA Phase 1', lat: 4.8300, lng: 7.0200 },
      ],
      'Obio/Akpor': [
        { name: 'Rumuola', lat: 4.8500, lng: 7.0100 },
        { name: 'Trans Amadi', lat: 4.8000, lng: 7.0300 },
      ],
    },
  },
  KN: {
    lgas: {
      'Kano Municipal': [
        { name: 'Kano City', lat: 12.0022, lng: 8.5920 },
        { name: 'Sabon Gari', lat: 12.0100, lng: 8.5300 },
      ],
      Nasarawa: [{ name: 'Nassarawa GRA', lat: 11.9800, lng: 8.5600 }],
    },
  },
  OY: {
    lgas: {
      Ibadan_North: [
        { name: 'Bodija', lat: 7.4350, lng: 3.9100 },
        { name: 'UI Area', lat: 7.4430, lng: 3.9000 },
      ],
      Ibadan_South_West: [{ name: 'Ring Road', lat: 7.3800, lng: 3.8800 }],
    },
  },
  KD: {
    lgas: {
      'Kaduna North': [
        { name: 'Kaduna City', lat: 10.5105, lng: 7.4165 },
        { name: 'Barnawa', lat: 10.4800, lng: 7.4300 },
      ],
      'Kaduna South': [{ name: 'Television', lat: 10.4700, lng: 7.4200 }],
    },
  },
  ED: {
    lgas: {
      'Oredo': [
        { name: 'Benin City Centre', lat: 6.3350, lng: 5.6037 },
        { name: 'Ring Road Benin', lat: 6.3200, lng: 5.6200 },
      ],
    },
  },
  AN: {
    lgas: {
      'Awka South': [{ name: 'Awka', lat: 6.2100, lng: 7.0700 }],
      Onitsha_North: [{ name: 'Onitsha', lat: 6.1450, lng: 6.7870 }],
    },
  },
  OG: {
    lgas: {
      Abeokuta_South: [{ name: 'Abeokuta', lat: 7.1557, lng: 3.3451 }],
      'Ado-Odo/Ota': [{ name: 'Sango Ota', lat: 6.6900, lng: 3.2300 }],
    },
  },
  PL: {
    lgas: {
      'Jos North': [{ name: 'Jos', lat: 9.8965, lng: 8.8583 }],
    },
  },
};

function displayLgaName(key) {
  return key.replace(/_/g, ' ');
}

async function seed() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const [code, name, capital] of STATES) {
      await client.query(
        `INSERT INTO states (code, name, capital)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, capital = EXCLUDED.capital, updated_at = NOW()`,
        [code, name, capital]
      );
    }

    for (const [stateCode, payload] of Object.entries(GEOGRAPHY)) {
      const stateRes = await client.query('SELECT id FROM states WHERE code = $1', [stateCode]);
      const stateId = stateRes.rows[0]?.id;
      if (!stateId) continue;

      for (const [lgaKey, areas] of Object.entries(payload.lgas)) {
        const lgaName = displayLgaName(lgaKey);
        const lgaRes = await client.query(
          `INSERT INTO lgas (state_id, name)
           VALUES ($1, $2)
           ON CONFLICT (state_id, name) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [stateId, lgaName]
        );
        const lgaId = lgaRes.rows[0].id;

        for (const area of areas) {
          await client.query(
            `INSERT INTO areas (lga_id, state_id, name, centroid_lat, centroid_lng)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (lga_id, name) DO UPDATE
             SET centroid_lat = EXCLUDED.centroid_lat,
                 centroid_lng = EXCLUDED.centroid_lng,
                 updated_at = NOW()`,
            [lgaId, stateId, area.name, area.lat, area.lng]
          );
        }
      }
    }

    await client.query('COMMIT');
    console.log('Geography seed complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
