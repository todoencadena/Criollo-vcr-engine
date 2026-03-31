/**
 * Database Configuration
 * PostgreSQL connection settings for IER
 */

const { Pool } = require('pg');

/**
 * Database connection pool configuration
 */
const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'criollo_vcr_dev',
    user: process.env.DB_USER || process.env.USER,
    password: process.env.DB_PASSWORD || '',

    // Pool settings
    max: 20, // Maximum number of clients in pool
    idleTimeoutMillis: 30000, // How long a client can be idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection
};

/**
 * Create connection pool
 */
const pool = new Pool(poolConfig);

/**
 * Test database connection
 */
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

/**
 * Query helper function
 * @param {string} text - SQL query
 * @param {array} params - Query parameters
 * @returns {Promise} Query result
 */
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Query error', { text, error: error.message });
        throw error;
    }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise} Client
 */
const getClient = async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    const release = client.release.bind(client);

    // Set a timeout of 5 seconds, after which we will log this client's queries
    const timeout = setTimeout(() => {
        console.error('A client has been checked out for more than 5 seconds!');
    }, 5000);

    // Monkey patch the release method to clear our timeout
    client.release = () => {
        clearTimeout(timeout);
        release();
    };

    return client;
};

/**
 * Close all connections
 */
const close = async () => {
    await pool.end();
    console.log('Database pool closed');
};

module.exports = {
    query,
    getClient,
    close,
    pool
};
