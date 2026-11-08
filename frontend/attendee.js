// attendee.js
// Script for attendee.html. Lists the available events, issues a ticket
// for the one the attendee chooses, and draws the QR code.

const eventName = document.getElementById('event-name');
const eventDetails = document.getElementById('event-details');
const eventList = document.getElementById('event-list');
const form = document.getElementById('ticket-form');
const walletInput = document.getElementById('wallet');
const generateButton = document.getElementById('generate-wallet');
const ticketButton = document.getElementById('get-ticket');
const message = document.getElementById('message');
const ticket = document.getElementById('ticket');
const qr = document.getElementById('qr');

// Every event from the server, newest first.
let events = [];

// The ID of the event the attendee chose, or null if none yet.
// The organizer page links here with an ID, for example attendee.html?event=1,
// which chooses that event from the start.
const linkedId = Number(new URLSearchParams(window.location.search).get('event'));
let selectedId = linkedId > 0 ? linkedId : null;

// The chosen event's full details. It stays null until an event is chosen.
let currentEvent = null;

// Shows text in the message box. Pass true for an error, which turns it red.
function showMessage(text, isError) {
    message.textContent = text;
    message.classList.toggle('error', isError === true);
}

// Asks the server for all events, then redraws the list and the chosen event.
async function loadEvents() {
    try {
        const response = await fetch('/events');
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error);
        }
        events = data;
    } catch (error) {
        eventName.textContent = 'Could not load events';
        // A network failure has no server message, so use a plain one.
        showMessage(error instanceof TypeError ? 'Could not reach the server.' : error.message, true);
        return;
    }

    renderEventList();
    showSelectedEvent();
}

// Rebuilds the list. Each event is a button showing its name, date, and
// spots left. textContent shows the text as plain characters, so an event
// name can never run as code.
function renderEventList() {
    eventList.innerHTML = '';

    if (events.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'helper';
        empty.textContent = 'No events yet. Ask the organizer to create one.';
        eventList.append(empty);
        return;
    }

    for (const item of events) {
        const spotsLeft = item.capacity - item.ticketsIssued;

        const name = document.createElement('span');
        name.className = 'event-item-name';
        name.textContent = item.name;

        const details = document.createElement('span');
        details.className = 'event-item-details';
        details.textContent = item.date + ' | ' + (spotsLeft > 0 ? spotsLeft + ' spots left' : 'Full');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'event-item';
        // aria-pressed tells screen readers which event is chosen. The CSS
        // also uses it to draw the accent border.
        button.setAttribute('aria-pressed', item.id === selectedId ? 'true' : 'false');
        button.append(name, details);
        button.addEventListener('click', function () {
            chooseEvent(item.id);
        });

        const row = document.createElement('li');
        row.append(button);
        eventList.append(row);
    }
}

// Shows the chosen event's name, date, and spots left, and turns the Get
// ticket button on only if the event still has spots.
function showSelectedEvent() {
    currentEvent = events.find(function (item) {
        return item.id === selectedId;
    }) || null;
    ticketButton.disabled = true;

    if (!currentEvent) {
        eventName.textContent = 'Choose an event';
        eventDetails.textContent = '';
        return;
    }

    eventName.textContent = currentEvent.name;
    document.title = currentEvent.name;

    const spotsLeft = currentEvent.capacity - currentEvent.ticketsIssued;
    if (spotsLeft > 0) {
        eventDetails.textContent = currentEvent.date + ' | ' + spotsLeft + ' of ' + currentEvent.capacity + ' spots left';
        ticketButton.disabled = false;
    } else {
        eventDetails.textContent = currentEvent.date + ' | Event is full';
    }
}

// Runs when the attendee clicks an event. Switching events hides the old
// ticket and message first, so a ticket for one event is never shown under
// another event's name.
function chooseEvent(id) {
    selectedId = id;
    ticket.hidden = true;
    showMessage('');
    renderEventList();
    showSelectedEvent();
}

// Draws the QR code. The scanner reads the event ID and wallet from it.
function showTicket(wallet) {
    // Clear the old code first, or a second ticket would be drawn under it.
    qr.innerHTML = '';
    new QRCode(qr, {
        text: JSON.stringify({ event: currentEvent.id, wallet: wallet }),
        width: 200,
        height: 200
    });

    document.getElementById('ticket-event').textContent = currentEvent.name;
    document.getElementById('ticket-wallet').textContent = wallet;
    ticket.hidden = false;
}

// Makes a throwaway wallet in the browser and fills in its public address.
// The address has to belong to a real keypair, because the server cannot
// create a token account for an address that does not.
// The secret key is never saved or sent anywhere.
generateButton.addEventListener('click', function () {
    if (typeof solanaWeb3 === 'undefined') {
        showMessage('The wallet library did not load. Check your internet connection.', true);
        return;
    }
    walletInput.value = solanaWeb3.Keypair.generate().publicKey.toBase58();
    showMessage('');
});

form.addEventListener('submit', async function (event) {
    // Stop the browser from reloading the page when the form is submitted.
    event.preventDefault();

    const wallet = walletInput.value.trim();

    // Disable the button so a second click cannot ask for a second ticket.
    // The server takes a few seconds because it sends a transaction to Solana.
    ticketButton.disabled = true;
    ticketButton.textContent = 'Getting ticket...';
    ticket.hidden = true;
    showMessage('Getting your ticket from Solana. This takes a few seconds.');

    try {
        const response = await fetch('/events/' + currentEvent.id + '/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: wallet })
        });
        const data = await response.json();

        if (response.ok) {
            showMessage('Your ticket is ready.');
            showTicket(data.wallet);
        } else if (data.error === 'Wallet already holds a ticket') {
            // Not a failure. Show the QR code again so they can still get in.
            showMessage('This wallet already has a ticket. Here is your QR code.');
            showTicket(wallet);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        showMessage(error instanceof TypeError ? 'Could not reach the server.' : error.message, true);
    } finally {
        // Reload the events so the spots left is up to date. This also turns
        // the button back on, unless the event is now full.
        ticketButton.textContent = 'Get ticket';
        await loadEvents();
    }
});

loadEvents();
