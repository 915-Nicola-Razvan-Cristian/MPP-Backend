const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { faker } = require('@faker-js/faker');
const db = require('./database');
const { LocalStorage } = require('node-localstorage');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const localStorage = new LocalStorage('./data');

app.use(cors());
app.use(express.json());

// Initialize news in localStorage if it doesn't exist
if (!localStorage.getItem('news')) {
    localStorage.setItem('news', JSON.stringify([]));
}

db.initializeDatabase();

// GET all candidates
app.get('/api/candidates', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM candidates');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch candidates' });
    }
});

// POST a new candidate
app.post('/api/candidates', async (req, res) => {
    try {
        const { name, party, description, image } = req.body;
        const { rows } = await db.query(
            'INSERT INTO candidates (name, party, description, image) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, party, description, image]
        );
        res.status(201).json({ id: rows[0].id, ...req.body });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create candidate' });
    }
});

// PUT (update) a candidate
app.put('/api/candidates/:id', async (req, res) => {
    try {
        const { name, party, description, image } = req.body;
        const { id } = req.params;
        await db.query(
            'UPDATE candidates SET name = $1, party = $2, description = $3, image = $4 WHERE id = $5',
            [name, party, description, image, id]
        );
        res.json({ id: parseInt(id), ...req.body });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update candidate' });
    }
});

// DELETE a candidate
app.delete('/api/candidates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM candidates WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete candidate' });
    }
});

// Voter Registration
app.post('/api/register', async (req, res) => {
    try {
        const { cnp } = req.body;
        if (!cnp || cnp.length !== 13) {
            return res.status(400).json({ error: 'Invalid CNP' });
        }
        
        const { rows: [voter] } = await db.query('SELECT * FROM voters WHERE cnp = $1', [cnp]);
        if (voter) {
            return res.json({ ...voter, exists: true });
        }
        
        const { rows } = await db.query('INSERT INTO voters (cnp) VALUES ($1) RETURNING id, cnp, has_voted', [cnp]);
        res.status(201).json({ ...rows[0], exists: false });

    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Vote
app.post('/api/vote', async (req, res) => {
    try {
        const { voter_id, candidate_id } = req.body;
        
        const { rows: [voter] } = await db.query('SELECT * FROM voters WHERE id = $1', [voter_id]);
        if (!voter) {
            return res.status(404).json({ error: 'Voter not found.' });
        }
        if (voter.has_voted) {
            return res.status(403).json({ error: 'This voter has already voted.' });
        }

        await db.query('INSERT INTO votes (voter_id, candidate_id) VALUES ($1, $2)', [voter_id, candidate_id]);
        await db.query('UPDATE voters SET has_voted = TRUE WHERE id = $1', [voter_id]);
        
        res.status(200).json({ message: 'Vote cast successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to cast vote' });
    }
});

// ELECTION SIMULATION
app.get('/api/election/results', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM election_results ORDER BY round_number, vote_count DESC');
        const results = {
            round1: rows.filter(r => r.round_number === 1),
            round2: rows.filter(r => r.round_number === 2),
        };
        res.json(results);
    } catch (error) {
        console.error('Failed to fetch election results:', error);
        res.status(500).json({ error: 'Failed to fetch election results' });
    }
});

app.post('/api/election/simulate', async (req, res) => {
    try {
        // ---- RESET ----
        console.log('Starting new election simulation...');
        await db.query('TRUNCATE TABLE votes, voters, election_results RESTART IDENTITY');
        
        // ---- ROUND 1 ----
        console.log('Simulating Round 1...');
        const { rows: candidatesR1 } = await db.query('SELECT * FROM candidates');
        
        // Generate 100 unique 13-digit CNPs
        const cnpSet = new Set();
        while (cnpSet.size < 100) {
            cnpSet.add(faker.string.numeric(13));
        }
        const voters = Array.from(cnpSet).map(cnp => ({ cnp }));
        
        const voterInserts = voters.map(v => db.query('INSERT INTO voters (cnp) VALUES ($1) RETURNING id', [v.cnp]));
        const insertedVoters = await Promise.all(voterInserts);
        const voterIds = insertedVoters.map(result => result.rows[0].id);

        const voteInsertsR1 = voterIds.map(voterId => {
            const randomCandidate = candidatesR1[Math.floor(Math.random() * candidatesR1.length)];
            return db.query('INSERT INTO votes (voter_id, candidate_id) VALUES ($1, $2)', [voterId, randomCandidate.id]);
        });
        await Promise.all(voteInsertsR1);

        const { rows: resultsR1 } = await db.query(`
            SELECT candidate_id, c.name as candidate_name, COUNT(v.id) as vote_count
            FROM votes v
            JOIN candidates c ON c.id = v.candidate_id
            GROUP BY candidate_id, c.name
            ORDER BY vote_count DESC
        `);

        const resultInsertsR1 = resultsR1.map(r => 
            db.query('INSERT INTO election_results (round_number, candidate_id, candidate_name, vote_count) VALUES ($1, $2, $3, $4)', 
            [1, r.candidate_id, r.candidate_name, r.vote_count])
        );
        await Promise.all(resultInsertsR1);
        console.log('Round 1 finished.');

        // // ---- ROUND 2 ----
        // console.log('Simulating Round 2...');
        // const topTwo = resultsR1.slice(0, 2);
        // if (topTwo.length < 2) {
        //     return res.status(200).json({ message: 'Simulation complete. Not enough candidates for a second round.' });
        // }

        // await db.query('TRUNCATE TABLE votes, voters RESTART IDENTITY');
        // const newVoterInserts = voters.map(v => db.query('INSERT INTO voters (cnp) VALUES ($1) RETURNING id', [v.cnp]));
        // const newInsertedVoters = await Promise.all(newVoterInserts);
        // const newVoterIds = newInsertedVoters.map(result => result.rows[0].id);

        // const voteInsertsR2 = newVoterIds.map(voterId => {
        //     const randomCandidate = topTwo[Math.floor(Math.random() * topTwo.length)];
        //     return db.query('INSERT INTO votes (voter_id, candidate_id) VALUES ($1, $2)', [voterId, randomCandidate.candidate_id]);
        // });
        // await Promise.all(voteInsertsR2);

        // const { rows: resultsR2 } = await db.query(`
        //     SELECT candidate_id, c.name as candidate_name, COUNT(v.id) as vote_count
        //     FROM votes v
        //     JOIN candidates c ON c.id = v.candidate_id
        //     GROUP BY candidate_id, c.name
        //     ORDER BY vote_count DESC
        // `);

        // const resultInsertsR2 = resultsR2.map(r => 
        //     db.query('INSERT INTO election_results (round_number, candidate_id, candidate_name, vote_count) VALUES ($1, $2, $3, $4)', 
        //     [2, r.candidate_id, r.candidate_name, r.vote_count])
        // );
        // await Promise.all(resultInsertsR2);
        // console.log('Round 2 finished.');

        res.status(200).json({ message: 'Election simulation completed successfully.' });

    } catch (error) {
        console.error('Election simulation failed:', error);
        res.status(500).json({ error: `Election simulation failed + ${error}` });
    }
});

app.post('/api/election/reset', async (req, res) => {
    try {
        await db.query('TRUNCATE TABLE votes, voters, election_results RESTART IDENTITY');
        res.status(200).json({ message: 'Election simulation has been reset.' });
    } catch (error) {
        console.error('Failed to reset election:', error);
        res.status(500).json({ error: 'Failed to reset election' });
    }
});


// GET all news
app.get('/api/news', (req, res) => {
    try {
        const news = JSON.parse(localStorage.getItem('news') || '[]');
        res.json(news);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

// POST a new news article
app.post('/api/news', (req, res) => {
    try {
        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }
        
        const news = JSON.parse(localStorage.getItem('news') || '[]');
        const newArticle = {
            id: Date.now(),
            title,
            content,
            created_at: new Date().toISOString()
        };
        
        news.push(newArticle);
        localStorage.setItem('news', JSON.stringify(news));
        res.status(201).json(newArticle);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create news article' });
    }
});

let dataInterval;

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === 'start') {
            clearInterval(dataInterval);
            dataInterval = setInterval(() => {
                const data = {
                    labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
                    datasets: [{
                        label: '# of Votes',
                        data: Array.from({ length: 6 }, () => faker.number.int({ min: 0, max: 100 })),
                    }],
                };
                ws.send(JSON.stringify({ type: 'data', payload: data }));
            }, 1000);
        } else if (parsedMessage.type === 'stop') {
            clearInterval(dataInterval);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(dataInterval);
    });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
