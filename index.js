const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { faker } = require('@faker-js/faker');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

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
