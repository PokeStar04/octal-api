require('dotenv').config(); // Charger les variables d'environnement
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

// Connexion à Supabase via API REST
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Les variables d'environnement SUPABASE_URL et SUPABASE_KEY sont requises.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Connexion directe à PostgreSQL
const pool = new Pool({
    host: process.env.SUPABASE_DB_HOST,
    database: process.env.SUPABASE_DB_NAME,
    port: process.env.SUPABASE_DB_PORT,
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
});

// Événements de connexion PostgreSQL
pool.on('connect', () => {
    console.log('Connexion à PostgreSQL réussie.');
});

pool.on('error', (err) => {
    console.error('Erreur de connexion à PostgreSQL :', err.message);
});

// Fonction pour tester la connexion PostgreSQL
const testPostgresConnection = async () => {
    try {
        const client = await pool.connect();
        console.log('Connexion réussie à PostgreSQL.');
        client.release();
    } catch (error) {
        console.error('Erreur lors de la connexion à PostgreSQL :', error.message);
    }
};

// Tester immédiatement la connexion PostgreSQL
testPostgresConnection();

// Export des clients
module.exports = { supabase, pool };
