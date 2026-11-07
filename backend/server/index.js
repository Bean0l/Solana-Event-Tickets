// Express app and routes. Each route checks its input, calls db.js (SQLite) and
// solana.js (blockchain), and replies with JSON.

require('dotenv').config();
const path = require('path');
const express = require('express');
const { PublicKey } = require('@solana/web3.js');
const db = require('./db');
const solana = require('./solana');

const PORT = process.env.PORT || 3000;

// Each ticket costs the server a small amount of rent, so capacity is limited
// to protect the server's SOL balance.
const MAX_CAPACITY = 1000;

const app = express();
app.use(express.json());

// Serve the web pages from the frontend folder (organizer.html, attendee.html, scanner.html).
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// Builds an error that carries an HTTP status code.
function httpError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// Event IDs in the URL arrive as text. Turn them into positive whole numbers.
function parseEventId(text) {
    const id = Number(text);
    if (!Number.isInteger(id) || id < 1) throw httpError('Invalid event ID', 400);
    return id;
}

// Checks a wallet address with new PublicKey(...) before it is used anywhere.
function parseWallet(text) {
    try {
        return new PublicKey(text).toBase58();
    } catch (err) {
        throw httpError('Invalid wallet address', 400);
    }
}

// Finds an event or replies 404.
function requireEvent(idText) {
    const event = db.getEvent(parseEventId(idText));
    if (!event) throw httpError('Event not found', 404);
    return event;
}

// Create event. Body: name, date, capacity.
app.post('/events', async (req, res) => {
    const { name, date, capacity } = req.body || {};
    if (typeof name !== 'string' || name.trim() === '') {
        throw httpError('Name is required', 400);
    }
    if (typeof date !== 'string' || date.trim() === '') {
        throw httpError('Date is required', 400);
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
        throw httpError(`Capacity must be a whole number from 1 to ${MAX_CAPACITY}`, 400);
    }

    const { mint, signature } = await solana.createEventMint();
    const event = db.createEvent({ name: name.trim(), date: date.trim(), capacity, mint });
    res.status(201).json({ ...event, signature });
});

// Event details and how many tickets have been issued.
app.get('/events/:id', (req, res) => {
    res.json(requireEvent(req.params.id));
});

// Issue one ticket. Body: wallet.
app.post('/events/:id/tickets', async (req, res) => {
    const event = requireEvent(req.params.id);
    const wallet = parseWallet((req.body || {}).wallet);

    if (event.ticketsIssued >= event.capacity) throw httpError('Event is full', 409);
    if (db.hasTicket(event.id, wallet)) throw httpError('Wallet already holds a ticket', 409);

    const { signature } = await solana.issueTicket(event.mint, wallet);
    db.addTicket(event.id, wallet, signature);
    res.status(201).json({ event: event.id, wallet, signature });
});

// Verify a ticket. Returns status 'valid', 'used', or 'none'.
app.get('/events/:id/verify/:wallet', async (req, res) => {
    const event = requireEvent(req.params.id);
    const wallet = parseWallet(req.params.wallet);
    const { status } = await solana.verifyTicket(event.mint, wallet);
    res.json({ event: event.id, wallet, status });
});

// Check in: freeze the ticket if it is valid.
app.post('/events/:id/checkin/:wallet', async (req, res) => {
    const event = requireEvent(req.params.id);
    const wallet = parseWallet(req.params.wallet);
    const { signature } = await solana.freezeTicket(event.mint, wallet);
    res.json({ event: event.id, wallet, status: 'used', signature });
});

// Error handler. Errors with a status below 500 are our own messages and are
// safe to show. Anything else is logged and replaced with a generic message.
app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) {
        console.error('Server error:', err.message);
        return res.status(500).json({ error: 'Server error' });
    }
    res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
