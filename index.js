const express = require('express');
const cors = require('cors');
const { LocalStorage } = require('node-localstorage');
const http = require('http');
const { WebSocketServer } = require('ws');
const { faker } = require('@faker-js/faker');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const localStorage = new LocalStorage('./data');

app.use(cors());
app.use(express.json());

const initialCandidates = [
    { id: 1, name: 'John Doe', party: 'Independent', description: 'A candidate with a vision for the future.', image: 'https://media.b1tv.ro/unsafe/1260x709/smart/filters:contrast(5):format(jpeg):quality(80)/http://www.b1tv.ro/wp-content/uploads/2025/05/nicusor-dan-3-2-1920x1028.jpg' },
    { id: 2, name: 'Jane Smith', party: 'Green Party', description: 'Focused on environmental policies and sustainability.', image: 'https://media.b1tv.ro/unsafe/1260x709/smart/filters:contrast(5):format(jpeg):quality(80)/http://www.b1tv.ro/wp-content/uploads/2025/05/nicusor-dan-3-2-1920x1028.jpg' },
    { id: 3, name: 'Sam Wilson', party: 'Libertarian', description: 'Advocates for minimal government and individual freedoms.', image: 'https://media.b1tv.ro/unsafe/1260x709/smart/filters:contrast(5):format(jpeg):quality(80)/http://www.b1tv.ro/wp-content/uploads/2025/05/nicusor-dan-3-2-1920x1028.jpg' }
];
// localStorage.removeItem('candidates')

if (!localStorage.getItem('candidates')) {
    localStorage.setItem('candidates', JSON.stringify(initialCandidates));
}

// GET all candidates
app.get('/api/candidates', (req, res) => {
    console.log("Getting candidates")
    const candidates = JSON.parse(localStorage.getItem('candidates'));
    res.json(candidates);
});

// POST a new candidate
app.post('/api/candidates', (req, res) => {
    const candidates = JSON.parse(localStorage.getItem('candidates'));
    const newCandidate = { ...req.body, id: Date.now() };
    candidates.push(newCandidate);
    localStorage.setItem('candidates', JSON.stringify(candidates));
    res.status(201).json(newCandidate);
});

// PUT (update) a candidate
app.put('/api/candidates/:id', (req, res) => {
    let candidates = JSON.parse(localStorage.getItem('candidates'));
    const candidateId = parseInt(req.params.id, 10);
    const updatedCandidate = req.body;

    candidates = candidates.map(candidate =>
        candidate.id === candidateId ? { ...candidate, ...updatedCandidate } : candidate
    );

    localStorage.setItem('candidates', JSON.stringify(candidates));
    res.json(candidates.find(c => c.id === candidateId));
});

// DELETE a candidate
app.delete('/api/candidates/:id', (req, res) => {
    let candidates = JSON.parse(localStorage.getItem('candidates'));
    const candidateId = parseInt(req.params.id, 10);
    candidates = candidates.filter(candidate => candidate.id !== candidateId);
    localStorage.setItem('candidates', JSON.stringify(candidates));
    res.status(204).send();
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
