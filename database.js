const { Pool } = require('pg');

// IMPORTANT: Replace with your actual PostgreSQL connection details
const pool = new Pool({
  user: 'root',
  host: 'dpg-d1b7l8uuk2gs739eqgkg-a.frankfurt-postgres.render.com',
  database: 'electiondb_9jy7',
  password: 'SJXm083txGmGhUK4QAKO7kzlvq0ZwVi0',
  port: 5432,
  ssl: {
    rejectUnauthorized: false, // Use `true` if you have a valid certificate
},
});

const initialCandidates = [
    { name: 'Nicusor Dan', party: 'Independent', description: 'A candidate with a vision for the future.', image: 'https://media.b1tv.ro/unsafe/1260x709/smart/filters:contrast(5):format(jpeg):quality(80)/http://www.b1tv.ro/wp-content/uploads/2025/05/nicusor-dan-3-2-1920x1028.jpg' },
    { name: 'Gabriela Firea', party: 'Social Democratic Party', description: 'Focused on social policies and city development.', image: 'https://cdn.knd.ro/media/image/2021/04/15/2e5e1b643a18a59815041a798547379f5a7d6569.jpg?width=1200&height=&trim=0,0,0,0' },
    { name: 'Cristian Popescu Piedone', party: 'Humanist Social Liberal Party', description: 'Advocates for the people of the city.', image: 'https://static.hyperflash.ro/media/2021/05/cristian-popescu-piedone-1-scaled-1-1024x576.jpg' },
    { name: 'Sebastian Burduja', party: 'National Liberal Party', description: 'A focus on technology and innovation.', image: 'https://static.hyperflash.ro/media/2021/05/sebastian-burduja-pnl-1024x576.jpg' },
    { name: 'Mihai Enache', party: 'Alliance for the Union of Romanians', description: 'Strong national identity and values.', image: 'https://static.hyperflash.ro/media/2021/05/mihai-enache-aur-1024x576.jpg' },
    { name: 'Diana Șoșoacă', party: 'S.O.S. Romania', description: 'A vocal and energetic candidate.', image: 'https://static.hyperflash.ro/media/2021/05/diana-sosoaca-sos-romania-1024x576.jpg' },
    { name: 'Vlad Voiculescu', party: 'USR', description: 'Reforming the system from within.', image: 'https://static.hyperflash.ro/media/2021/05/vlad-voiculescu-usr-1024x576.jpg' },
    { name: 'Traian Băsescu', party: 'PMP', description: 'A former president running for mayor.', image: 'https://static.hyperflash.ro/media/2021/05/traian-basescu-pmp-1024x576.jpg' },
    { name: 'Călin Popescu-Tăriceanu', party: 'ALDE', description: 'An experienced political figure.', image: 'https://static.hyperflash.ro/media/2021/05/calin-popescu-tariceanu-alde-1024x576.jpg' },
    { name: 'Dan Barna', party: 'USR', description: 'A vision for a modern Romania.', image: 'https://static.hyperflash.ro/media/2021/05/dan-barna-usr-1024x576.jpg' }
];

async function initializeDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS candidates (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                party VARCHAR(255) NOT NULL,
                description TEXT,
                image VARCHAR(255)
            )
        `);
        console.log('Table "candidates" created or already exists.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS voters (
                id SERIAL PRIMARY KEY,
                cnp VARCHAR(13) NOT NULL UNIQUE,
                has_voted BOOLEAN DEFAULT FALSE
            )
        `);
        console.log('Table "voters" created or already exists.');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS votes (
                id SERIAL PRIMARY KEY,
                voter_id INT NOT NULL,
                candidate_id INT NOT NULL,
                FOREIGN KEY (voter_id) REFERENCES voters(id),
                FOREIGN KEY (candidate_id) REFERENCES candidates(id)
            )
        `);
        console.log('Table "votes" created or already exists.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS election_results (
                id SERIAL PRIMARY KEY,
                round_number INT NOT NULL,
                candidate_id INT NOT NULL,
                candidate_name VARCHAR(255) NOT NULL,
                vote_count INT NOT NULL
            )
        `);
        console.log('Table "election_results" created or already exists.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS news (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table "news" created or already exists.');

        const res = await client.query('SELECT COUNT(*) as count FROM candidates');
        if (res.rows[0].count === '3') {
            console.log('Seeding candidates...');
            for (const candidate of initialCandidates) {
                await client.query('INSERT INTO candidates (name, party, description, image) VALUES ($1, $2, $3, $4)', 
                    [candidate.name, candidate.party, candidate.description, candidate.image]);
            }
            console.log('Candidates seeded.');
        }
        
        await client.query('COMMIT');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error initializing database:', error);
    } finally {
        client.release();
    }
}

module.exports = { 
    query: (text, params) => pool.query(text, params),
    initializeDatabase 
}; 