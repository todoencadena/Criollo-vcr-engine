/**
 * Criollo VCR API
 * Endpoint para registrar consultas veterinarias y generar VCRs
 * Deploy: Railway — start command: node vcr-api.js
 */

const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3002;

// ─── Base de datos (Railway inyecta DATABASE_URL automáticamente) ─────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(cors());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Criollo VCR API', version: '1.0.0' });
});

// ─── POST /api/vcr-registro ───────────────────────────────────────────────────
// Recibe los datos del formulario TMA y guarda el registro en Postgres
app.post('/api/vcr-registro', async (req, res) => {
  const {
    animal_nombre,
    animal_especie,
    animal_raza,
    tipo_atencion,
    observaciones,
    vet_nombre,
    vet_clinica,
    telegram_user,
  } = req.body;

  if (!animal_nombre || !vet_nombre || !vet_clinica) {
    return res.status(400).json({
      error: 'Faltan campos: animal_nombre, vet_nombre, vet_clinica',
    });
  }

  try {
    // Creamos el VCR ID: prefijo + timestamp en base36 + random
    const vcr_id = 'VCR-' +
      Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).substr(2, 4).toUpperCase();

    const result = await pool.query(
      `INSERT INTO vcr_registros
        (vcr_id, animal_nombre, animal_especie, animal_raza,
         tipo_atencion, observaciones, vet_nombre, vet_clinica, telegram_user)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING vcr_id, created_at`,
      [
        vcr_id,
        animal_nombre,
        animal_especie  || null,
        animal_raza     || null,
        tipo_atencion   || 'consulta',
        observaciones   || null,
        vet_nombre,
        vet_clinica,
        telegram_user   || null,
      ]
    );

    const row = result.rows[0];
    const vcr_url = `https://todoencadena.github.io/Criollo-vcr-engine/pasaporte.html?id=${row.vcr_id}`;

    res.status(201).json({
      success:    true,
      vcr_id:     row.vcr_id,
      vcr_url,
      created_at: row.created_at,
    });

  } catch (err) {
    console.error('Error guardando VCR:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── GET /api/pasaporte/:vcr_id ───────────────────────────────────────────────
// El pasaporte.html llama este endpoint para cargar los datos reales del VCR
app.get('/api/pasaporte/:vcr_id', async (req, res) => {
  const { vcr_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT vcr_id, animal_nombre, animal_especie, animal_raza,
              tipo_atencion, observaciones, vet_nombre, vet_clinica, created_at
       FROM vcr_registros
       WHERE vcr_id = $1`,
      [vcr_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'VCR no encontrado' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Error obteniendo pasaporte:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── GET /api/vcr-registros ───────────────────────────────────────────────────
// Lista los registros (para panel interno, limitado a los últimos 100)
app.get('/api/vcr-registros', async (req, res) => {
  const { clinica } = req.query;

  try {
    let query = `SELECT vcr_id, animal_nombre, animal_especie, tipo_atencion,
                        vet_nombre, vet_clinica, created_at
                 FROM vcr_registros`;
    const params = [];

    if (clinica) {
      params.push(clinica);
      query += ` WHERE LOWER(vet_clinica) LIKE LOWER($1)`;
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json({ registros: result.rows, total: result.rows.length });

  } catch (err) {
    console.error('Error listando registros:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── Arrancar ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Criollo VCR API corriendo en puerto ${PORT}`);
});
