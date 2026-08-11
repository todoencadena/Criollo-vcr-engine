const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(cors());
app.use(express.json());

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
    let query = `SELECT id, type, species, animal_name, description, city, neighborhood,
                        lost_or_found_date, animal_status, has_collar, has_photo,
                        reporter_name, whatsapp, instagram, status, created_at, matched_with
                 FROM emergency_reports WHERE status = 'active'`;
    const params = [];

    if (city) { params.push(city); query += ` AND LOWER(city) = LOWER($${params.length})`; }
    if (species) { params.push(species); query += ` AND LOWER(species) = LOWER($${params.length})`; }
    if (type) { params.push(type); query += ` AND type = $${params.length}`; }

    query += ' ORDER BY created_at DESC LIMIT 100';
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

app.listen(PORT, () => {
  console.log(`Criollo Emergency API corriendo en puerto ${PORT}`);
});
