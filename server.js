const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Base de datos ───────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── Notificación Telegram ───────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function notificarMatch(reportante, match) {
  if (!TELEGRAM_TOKEN) return; // Si no hay token configurado, no hace nada

  const REGISTRO_URL = 'https://todoencadena.github.io/Criollo-vcr-engine/registro.html';

  const speciesLabel = { dog: 'perro 🐕', cat: 'gato 🐱', other: 'animal' };
  const especie = speciesLabel[reportante.species] || 'mascota';

  // Mensaje para quien acaba de reportar
  const msgReportante = `🎯 *¡Posible match encontrado!*\n\nAlguien reportó un ${especie} ${match.type === 'found' ? 'encontrado' : 'perdido'} en *${match.city}* que podría ser el tuyo.\n\n📋 Descripción: ${match.description}\n\n📱 Contacto: ${match.whatsapp}${match.instagram ? '\n📷 Instagram: ' + match.instagram : ''}\n\nVer todos los reportes: ${REGISTRO_URL}`;

  // Mensaje para quien hizo el match
  const msgMatch = `🎯 *¡Posible match encontrado!*\n\nAlguien está buscando un ${especie} en *${reportante.city}* que podría ser el que encontraste.\n\n📋 Descripción: ${reportante.description}\n\n📱 Contacto: ${reportante.whatsapp}${reportante.instagram ? '\n📷 Instagram: ' + reportante.instagram : ''}\n\nVer todos los reportes: ${REGISTRO_URL}`;

  const sendMsg = async (chatId, text) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  };

  // Extraer chat_id del número de WhatsApp no es posible directamente,
  // pero si el usuario interactuó con el bot, podemos intentar con su número
  // Por ahora guardamos el intento en consola
  console.log(`MATCH DETECTADO: ${reportante.reporter_name} (${reportante.whatsapp}) ↔ ${match.reporter_name} (${match.whatsapp})`);
  console.log('Mensaje reportante:', msgReportante);
  console.log('Mensaje match:', msgMatch);
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Criollo Emergency API' });
});

// ─── POST /api/emergency-report ──────────────────────────────────────────────
// Recibe un reporte de mascota perdida o encontrada, lo guarda, y busca matches
app.post('/api/emergency-report', async (req, res) => {
  const {
    type,           // 'lost' | 'found'
    species,        // 'dog' | 'cat' | 'other'
    animal_name,
    description,
    city,
    neighborhood,
    lost_or_found_date,
    animal_status,  // solo para 'found': 'with_me' | 'street' | 'shelter'
    has_collar,
    has_photo,
    reporter_name,
    whatsapp,
    instagram,
    extra,
  } = req.body;

  // Validación mínima
  if (!type || !description || !city || !reporter_name || !whatsapp) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios: type, description, city, reporter_name, whatsapp',
    });
  }

  if (!['lost', 'found'].includes(type)) {
    return res.status(400).json({ error: 'type debe ser "lost" o "found"' });
  }

  try {
    // Guardar el reporte
    const insertResult = await pool.query(
      `INSERT INTO emergency_reports
        (type, species, animal_name, description, city, neighborhood,
         lost_or_found_date, animal_status, has_collar, has_photo,
         reporter_name, whatsapp, instagram, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, created_at`,
      [
        type, species || null, animal_name || null, description,
        city, neighborhood || null, lost_or_found_date || null,
        animal_status || null, has_collar || false, has_photo || false,
        reporter_name, whatsapp, instagram || null, extra || null,
      ]
    );

    const newReport = insertResult.rows[0];

    // Buscar posibles matches: mismo tipo contrario + misma especie + misma ciudad
    const oppositeType = type === 'lost' ? 'found' : 'lost';
    const matchResult = await pool.query(
      `SELECT id, type, species, description, city, neighborhood,
              reporter_name, whatsapp, instagram, created_at
       FROM emergency_reports
       WHERE type = $1
         AND status = 'active'
         AND LOWER(city) = LOWER($2)
         AND ($3::text IS NULL OR LOWER(species) = LOWER($3))
       ORDER BY created_at DESC
       LIMIT 5`,
      [oppositeType, city, species || null]
    );

    const matches = matchResult.rows;

    // Si hay matches, marcar en la DB el primero como candidato
    if (matches.length > 0) {
      await pool.query(
        `UPDATE emergency_reports SET matched_with = $1 WHERE id = $2`,
        [matches[0].id, newReport.id]
      );
    }

    res.status(201).json({
      success: true,
      report_id: newReport.id,
      created_at: newReport.created_at,
      matches_found: matches.length,
      // Solo devolver contacto si hay match confirmado
      matches: matches.length > 0 ? matches.map(m => ({
        id: m.id,
        type: m.type,
        species: m.species,
        description: m.description,
        city: m.city,
        neighborhood: m.neighborhood,
        reporter_name: m.reporter_name,
        whatsapp: m.whatsapp,
        instagram: m.instagram,
        reported_at: m.created_at,
      })) : [],
    });

  } catch (err) {
    console.error('Error guardando reporte:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── GET /api/emergency-reports ──────────────────────────────────────────────
// Lista todos los reportes activos (para panel de administración)
app.get('/api/emergency-reports', async (req, res) => {
  const { city, species, type } = req.query;

  try {
    let query = `
      SELECT id, type, species, animal_name, description, city, neighborhood,
             lost_or_found_date, animal_status, has_collar, has_photo,
             reporter_name, whatsapp, instagram, status, created_at, matched_with
      FROM emergency_reports
      WHERE status = 'active'
    `;
    const params = [];

    if (city) {
      params.push(city);
      query += ` AND LOWER(city) = LOWER($${params.length})`;
    }
    if (species) {
      params.push(species);
      query += ` AND LOWER(species) = LOWER($${params.length})`;
    }
    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json({ reports: result.rows, total: result.rows.length });

  } catch (err) {
    console.error('Error obteniendo reportes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── PATCH /api/emergency-reports/:id/reunited ───────────────────────────────
// Marcar una mascota como reunida con su dueño
app.patch('/api/emergency-reports/:id/reunited', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE emergency_reports SET status = 'reunited' WHERE id = $1`,
      [id]
    );
    res.json({ success: true, message: `Reporte ${id} marcado como reunido` });
  } catch (err) {
    console.error('Error actualizando reporte:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── POST /api/vcr-registro ──────────────────────────────────────────────────
// Recibe el registro de una consulta veterinaria y genera un VCR
app.post('/api/vcr-registro', async (req, res) => {
  const {
    animal_nombre,
    animal_especie,
    animal_raza,
    peso,
    estado_corporal,
    heridas_marcas,
    discapacidad,
    tipo_atencion,
    observaciones,
    vet_nombre,
    vet_clinica,
    telegram_user,
  } = req.body;

  if (!animal_nombre || !vet_nombre || !vet_clinica) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios: animal_nombre, vet_nombre, vet_clinica',
    });
  }

  try {
    // Generamos el VCR ID: prefijo + timestamp + random
    const vcr_id = 'VCR-' + Date.now().toString(36).toUpperCase() +
                   Math.random().toString(36).substr(2, 4).toUpperCase();

    const result = await pool.query(
      `INSERT INTO vcr_registros
        (vcr_id, animal_nombre, animal_especie, animal_raza,
         peso, estado_corporal, heridas_marcas, discapacidad,
         tipo_atencion, observaciones, vet_nombre, vet_clinica, telegram_user)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING vcr_id, created_at`,
      [
        vcr_id,
        animal_nombre,
        animal_especie   || null,
        animal_raza      || null,
        peso             || null,
        estado_corporal  || null,
        heridas_marcas   || null,
        discapacidad     || null,
        tipo_atencion    || 'consulta',
        observaciones    || null,
        vet_nombre,
        vet_clinica,
        telegram_user    || null,
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
    console.error('Error guardando VCR:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── GET /api/pasaporte/:vcr_id ──────────────────────────────────────────────
// Devuelve los datos de un VCR para mostrarlo en la página del pasaporte
app.get('/api/pasaporte/:vcr_id', async (req, res) => {
  const { vcr_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT vcr_id, animal_nombre, animal_especie, animal_raza,
              peso, estado_corporal, heridas_marcas, discapacidad,
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
    console.error('Error obteniendo pasaporte:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── Arrancar servidor ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Criollo Emergency API corriendo en puerto ${PORT}`);
});

