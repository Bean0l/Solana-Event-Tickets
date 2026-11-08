// SQLite setup and queries. SQLite stores one file on disk (backend/tickets.db).
// It holds what the blockchain cannot: event names, dates, capacity, and the
// link from an event ID to its mint address.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'tickets.db');
const db = new Database(DB_PATH);

// Create the tables the first time the server runs. Does nothing if they exist.
db.exec(`
    CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        date       TEXT    NOT NULL,
        capacity   INTEGER NOT NULL,
        mint       TEXT    NOT NULL,
        created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id  INTEGER NOT NULL REFERENCES events(id),
        wallet    TEXT    NOT NULL,
        signature TEXT    NOT NULL,
        issued_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (event_id, wallet)
    );
`);

// Prepared statements are SQL written once and reused. The ? marks are filled in
// separately, which also keeps user input from being treated as SQL.
const insertEvent = db.prepare(
    'INSERT INTO events (name, date, capacity, mint) VALUES (?, ?, ?, ?)'
);
const selectEvent = db.prepare(`
    SELECT e.id, e.name, e.date, e.capacity, e.mint,
           (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id) AS ticketsIssued
    FROM events e
    WHERE e.id = ?
`);
const selectAllEvents = db.prepare(`
    SELECT e.id, e.name, e.date, e.capacity, e.mint,
           (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id) AS ticketsIssued
    FROM events e
    ORDER BY e.id DESC
`);
const insertTicket = db.prepare(
    'INSERT INTO tickets (event_id, wallet, signature) VALUES (?, ?, ?)'
);
const selectTicket = db.prepare(
    'SELECT id FROM tickets WHERE event_id = ? AND wallet = ?'
);

// Saves a new event and returns it (including its new ID).
function createEvent({ name, date, capacity, mint }) {
    const result = insertEvent.run(name, date, capacity, mint);
    return getEvent(result.lastInsertRowid);
}

// Returns the event with the number of tickets issued, or undefined if not found.
function getEvent(id) {
    return selectEvent.get(id);
}

// Returns every event with its tickets issued, newest first. Empty if none.
function listEvents() {
    return selectAllEvents.all();
}

// True if this wallet already has a ticket recorded for this event.
function hasTicket(eventId, wallet) {
    return selectTicket.get(eventId, wallet) !== undefined;
}

// Records an issued ticket. Throws if the same wallet is saved twice for one event.
function addTicket(eventId, wallet, signature) {
    insertTicket.run(eventId, wallet, signature);
}

module.exports = { createEvent, getEvent, listEvents, hasTicket, addTicket };
