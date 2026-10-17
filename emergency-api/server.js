const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(cors());
app.use(express.json());

const TIPOS_REGISTRO_MEDICO = [
  'vaccination', 'surgery', 'treatment', 'checkup',
  'diagnosis', 'medication', 'lab_test', 'emergency',
];
const WALLET_REGEX = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const TX_HASH_REGEX = /^(0x[a-fA-F0-9]{64}|[1-9A-HJ-NP-Za-km-z]{64,90})$/;

async function ensureSchema() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Criollo Emergency API' });
});

app.post('/api/emergency-report', async (req, res) => {
  const {
    type, species, animal_name, description, city, neighborhood,
    lost_or_found_date, animal_status, has_collar, has_photo,
    reporter_name, whatsapp, instagram, extra,
  } = req.body;

  if (!type || !description || !city || !reporter_name || !whatsapp) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: type, description, city, reporter_name, whatsapp' });
  }

  if (!['lost', 'found'].includes(type)) {
    return res.status(400).json({ error: 'type debe ser "lost" o "found"' });
  }

  try {
    const insertResult = await pool.query(
      `INSERT INTO emergency_reports
        (type, species, animal_name, description, city, neighborhood,
         lost_or_found_date, animal_status, has_collar, has_photo,
         reporter_name, whatsapp, instagram, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, created_at`,
      [type, species || null, animal_name || null, description, city, neighborhood || null,
       lost_or_found_date || null, animal_status || null, has_collar || false, has_photo || false,
       reporter_name, whatsapp, instagram || null, extra || null]
    );

    const newReport = insertResult.rows[0];
    const oppositeType = type === 'lost' ? 'found' : 'lost';

    const matchResult = await pool.query(
      `SELECT id, type, species, description, city, neighborhood,
              reporter_name, whatsapp, instagram, created_at
       FROM emergency_reports
       WHERE type = $1 AND status = 'active'
         AND LOWER(city) = LOWER($2)
         AND ($3::text IS NULL OR LOWER(species) = LOWER($3))
       ORDER BY created_at DESC LIMIT 5`,
      [oppositeType, city, species || null]
    );

    const matches = matchResult.rows;

    if (matches.length > 0) {
      await pool.query(`UPDATE emergency_reports SET matched_with = $1 WHERE id = $2`, [matches[0].id, newReport.id]);
    }

    res.status(201).json({
      success: true,
      report_id: newReport.id,
      created_at: newReport.created_at,
      matches_found: matches.length,
      matches: matches.map(m => ({
        id: m.id, type: m.type, species: m.species, description: m.description,
        city: m.city, neighborhood: m.neighborhood, reporter_name: m.reporter_name,
        whatsapp: m.whatsapp, instagram: m.instagram, reported_at: m.created_at,
      })),
    });

  } catch (err) {
    console.error('Error guardando reporte:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/emergency-reports', async (req, res) => {
  const { city, species, type } = req.query;
  try {
    let query = `SELECT er.id, er.type, er.species, er.animal_name, er.description, er.city, er.neighborhood,
                        er.lost_or_found_date, er.animal_status, er.has_collar, er.has_photo,
                        er.reporter_name, er.whatsapp, er.instagram, er.status, er.created_at, er.matched_with,
                        (SELECT COUNT(*)::int FROM registros_medicos rm WHERE rm.animal_id = er.id) AS vcr_count
                 FROM emergency_reports er WHERE er.status = 'active'`;
    const params = [];

    if (city) { params.push(city); query += ` AND LOWER(er.city) = LOWER($${params.length})`; }
    if (species) { params.push(species); query += ` AND LOWER(er.species) = LOWER($${params.length})`; }
    if (type) { params.push(type); query += ` AND er.type = $${params.length}`; }

    query += ' ORDER BY er.created_at DESC LIMIT 100';
    const result = await pool.query(query, params);
    res.json({ reports: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Error obteniendo reportes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.patch('/api/emergency-reports/:id/reunited', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`UPDATE emergency_reports SET status = 'reunited' WHERE id = $1`, [id]);
    res.json({ success: true, message: `Reporte ${id} marcado como reunido` });
  } catch (err) {
    console.error('Error actualizando reporte:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/veterinarias', async (req, res) => {
  const { nombre, ciudad, wallet_address } = req.body;

  if (!nombre || !ciudad) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: nombre, ciudad' });
  }
  if (wallet_address && !WALLET_REGEX.test(wallet_address)) {
    return res.status(400).json({ error: 'wallet_address no es una dirección válida (Solana o EVM)' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO veterinarias (nombre, ciudad, wallet_address)
       VALUES ($1, $2, $3)
       RETURNING id, nombre, ciudad, wallet_address, verificada, created_at`,
      [nombre, ciudad, wallet_address || null]
    );
    res.status(201).json({ success: true, veterinaria: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una veterinaria con esa wallet_address' });
    }
    console.error('Error registrando veterinaria:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/registros-medicos', async (req, res) => {
  const { animal_id, veterinaria_id, tipo, descripcion, fecha_atencion, vcr_tx_hash } = req.body;

  if (!animal_id || !veterinaria_id || !tipo) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: animal_id, veterinaria_id, tipo' });
  }
  if (!TIPOS_REGISTRO_MEDICO.includes(tipo)) {
    return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS_REGISTRO_MEDICO.join(', ')}` });
  }
  if (fecha_atencion && Number.isNaN(Date.parse(fecha_atencion))) {
    return res.status(400).json({ error: 'fecha_atencion no es una fecha válida (ISO 8601)' });
  }
  if (vcr_tx_hash && !TX_HASH_REGEX.test(vcr_tx_hash)) {
    return res.status(400).json({ error: 'vcr_tx_hash no es un hash de transacción válido' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO registros_medicos
        (animal_id, veterinaria_id, tipo, descripcion, fecha_atencion, vcr_tx_hash)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6)
       RETURNING id, animal_id, veterinaria_id, tipo, descripcion, fecha_atencion, vcr_tx_hash, created_at`,
      [animal_id, veterinaria_id, tipo, descripcion || null, fecha_atencion || null, vcr_tx_hash || null]
    );
    res.status(201).json({ success: true, registro: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      const field = err.constraint && err.constraint.includes('veterinaria') ? 'veterinaria_id' : 'animal_id';
      return res.status(404).json({ error: `No existe el ${field} indicado` });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un registro con ese vcr_tx_hash' });
    }
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'animal_id o veterinaria_id con formato inválido' });
    }
    console.error('Error creando registro médico:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/animales/:id/pasaporte', async (req, res) => {
  const { id } = req.params;
  try {
    const animalResult = await pool.query(
      `SELECT id, type, species, animal_name, description, city, neighborhood,
              lost_or_found_date, animal_status, has_collar, status, created_at
       FROM emergency_reports WHERE id = $1`,
      [id]
    );
    if (animalResult.rows.length === 0) {
      return res.status(404).json({ error: `No existe el animal ${id}` });
    }

    const registrosResult = await pool.query(
      `SELECT rm.id, rm.tipo, rm.descripcion, rm.fecha_atencion, rm.vcr_tx_hash, rm.created_at,
              json_build_object(
                'id', v.id, 'nombre', v.nombre, 'ciudad', v.ciudad,
                'wallet_address', v.wallet_address, 'verificada', v.verificada
              ) AS veterinaria
       FROM registros_medicos rm
       JOIN veterinarias v ON v.id = rm.veterinaria_id
       WHERE rm.animal_id = $1
       ORDER BY rm.fecha_atencion DESC, rm.id DESC`,
      [id]
    );

    res.json({
      animal: animalResult.rows[0],
      registros_medicos: registrosResult.rows,
      vcr_count: registrosResult.rows.length,
    });
  } catch (err) {
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'id de animal con formato inválido' });
    }
    console.error('Error obteniendo pasaporte:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Criollo Emergency API corriendo en puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error aplicando migraciones:', err);
    process.exit(1);
  });
