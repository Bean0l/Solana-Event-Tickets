// scanner.js
// Script for scanner.html. Staff choose an event, then scan or paste a
// ticket. The page asks the server if the ticket is valid, used, or
// missing, and staff press Check in for a valid one.

const eventList = document.getElementById('event-list');
const startButton = document.getElementById('start-camera');
const stopButton = document.getElementById('stop-camera');
const verifyForm = document.getElementById('verify-form');
const qrText = document.getElementById('qr-text');
const verifyButton = document.getElementById('verify');
const message = document.getElementById('message');
const result = document.getElementById('result');
const resultTitle = document.getElementById('result-title');
const resultDetails = document.getElementById('result-details');
const checkinButton = document.getElementById('checkin');
const scanNextButton = document.getElementById('scan-next');

// Every event from the server, newest first.
let events = [];

// The ID of the event staff chose, or null if none yet.
// The organizer page links here with an ID, for example scanner.html?event=1,
// which chooses that event from the start.
const linkedId = Number(new URLSearchParams(window.location.search).get('event'));
let selectedId = linkedId > 0 ? linkedId : null;

// The chosen event's details. It stays null until an event is chosen.
let currentEvent = null;

// The QR scanner from the library, and whether its camera is running.
let scanner = null;
let cameraRunning = false;

// True while a ticket is being checked. The camera reads the same QR code
// many times a second, so this makes the page handle only the first read.
let busy = false;

// The ticket on screen, so the Check in button knows who to check in.
let shownTicket = null;

// Shows text in the message box. Pass true for an error, which turns it red.
function showMessage(text, isError) {
    message.textContent = text;
    message.classList.toggle('error', isError === true);
}

// Turns an error into text for the message box. A network failure has no
// server message, so it gets a plain one.
function errorText(error) {
    return error instanceof TypeError ? 'Could not reach the server.' : error.message;
}


// ===== Events =====

// Asks the server for all events, then redraws the list.
async function loadEvents() {
    try {
        const response = await fetch('/events');
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error);
        }
        events = data;
    } catch (error) {
        showMessage(errorText(error), true);
        return;
    }

    currentEvent = events.find(function (item) {
        return item.id === selectedId;
    }) || null;
    renderEventList();
}

// Rebuilds the list. Each event is a button showing its name, date, and
// how many tickets have been issued. textContent shows the text as plain
// characters, so an event name can never run as code.
function renderEventList() {
    eventList.innerHTML = '';

    if (events.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'helper';
        empty.textContent = 'No events yet. Create one on the organizer page.';
        eventList.append(empty);
        return;
    }

    for (const item of events) {
        const name = document.createElement('span');
        name.className = 'event-item-name';
        name.textContent = item.name;

        const details = document.createElement('span');
        details.className = 'event-item-details';
        details.textContent = item.date + ' | ' + item.ticketsIssued + ' of ' + item.capacity + ' tickets issued';

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

// Runs when staff click an event. Switching events clears the old result,
// so a result for one event is never shown under another.
function chooseEvent(id) {
    selectedId = id;
    currentEvent = events.find(function (item) {
        return item.id === id;
    });
    result.hidden = true;
    showMessage('');
    renderEventList();
}


// ===== Checking a ticket =====

// Works out which event and wallet a scan or paste is for.
// A scanned QR code holds JSON like {"event":1,"wallet":"..."}.
// A pasted wallet address has no event, so the chosen event is used.
function readTicket(text) {
    const trimmed = text.trim();
    try {
        const data = JSON.parse(trimmed);
        if (data && typeof data.wallet === 'string') {
            return { event: Number(data.event), wallet: data.wallet.trim() };
        }
    } catch (error) {
        // Not JSON, so treat the whole text as a wallet address.
    }
    return { event: currentEvent.id, wallet: trimmed };
}

// Shows the result box. The class (valid, used, or none) sets its color.
// The wallet address goes on its own line below the event name.
function showResult(kind, title, wallet, canCheckIn, fromCamera) {
    result.className = kind;
    resultTitle.textContent = title;
    resultDetails.textContent = currentEvent.name + '\n' + wallet;
    checkinButton.hidden = !canCheckIn;
    scanNextButton.hidden = !fromCamera;
    result.hidden = false;
    // Bring the result into view, since the camera and the list are above it.
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Asks the server about a ticket and shows green, yellow, or red.
// Only the first part of the work uses the chain, so this takes a moment.
async function verifyTicket(text, fromCamera) {
    if (!currentEvent) {
        showMessage('Choose an event first.', true);
        return;
    }

    const ticket = readTicket(text);
    shownTicket = null;
    result.hidden = true;

    // A ticket for another event must not get anyone into this one.
    if (ticket.event !== currentEvent.id) {
        showMessage('');
        const other = events.find(function (item) {
            return item.id === ticket.event;
        });
        showResult('none', 'Wrong event', ticket.wallet, false, fromCamera);
        resultDetails.textContent = 'This ticket is for ' + (other ? other.name : 'event ' + ticket.event) +
            ', not ' + currentEvent.name + '.';
        return;
    }

    showMessage('Checking the ticket...');
    try {
        const response = await fetch('/events/' + currentEvent.id + '/verify/' + encodeURIComponent(ticket.wallet));
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error);
        }

        showMessage('');
        shownTicket = ticket;
        if (data.status === 'valid') {
            showResult('valid', 'Valid ticket', ticket.wallet, true, fromCamera);
        } else if (data.status === 'used') {
            showResult('used', 'Already used', ticket.wallet, false, fromCamera);
        } else {
            showResult('none', 'No ticket', ticket.wallet, false, fromCamera);
        }
    } catch (error) {
        showMessage(errorText(error), true);
        // An error leaves no result, so give a camera user a way to scan again.
        if (fromCamera) {
            scanNextButton.hidden = false;
            result.className = '';
            resultTitle.textContent = 'Could not check the ticket';
            resultDetails.textContent = '';
            checkinButton.hidden = true;
            result.hidden = false;
        }
    }
}

// Freezes the ticket on screen. Staff press this after a green result.
// Freezing cannot be undone from the page, so it is never done automatically.
checkinButton.addEventListener('click', async function () {
    const ticket = shownTicket;
    checkinButton.disabled = true;
    checkinButton.textContent = 'Checking in...';
    showMessage('Checking in. This takes a few seconds.');

    try {
        const response = await fetch(
            '/events/' + ticket.event + '/checkin/' + encodeURIComponent(ticket.wallet),
            { method: 'POST' }
        );
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error);
        }

        showMessage('');
        const fromCamera = !scanNextButton.hidden;
        showResult('valid', 'Checked in', ticket.wallet, false, fromCamera);

        // A link to the transaction, so the check-in can be shown on Solana Explorer.
        const link = document.createElement('a');
        link.href = 'https://explorer.solana.com/tx/' + data.signature + '?cluster=devnet';
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'View on Solana Explorer';
        resultDetails.append('\n', link);
        loadEvents();
    } catch (error) {
        showMessage(errorText(error), true);
        // The ticket may have been used by someone else a moment ago.
        // Check it again so the result on screen is true.
        await verifyTicket(JSON.stringify({ event: ticket.event, wallet: ticket.wallet }), !scanNextButton.hidden);
    } finally {
        checkinButton.disabled = false;
        checkinButton.textContent = 'Check in';
    }
});

// Paste box. Verifies the pasted wallet address or QR text.
verifyForm.addEventListener('submit', async function (event) {
    // Stop the browser from reloading the page when the form is submitted.
    event.preventDefault();
    if (busy) {
        return;
    }
    busy = true;
    verifyButton.disabled = true;

    await stopCamera();
    await verifyTicket(qrText.value, false);

    verifyButton.disabled = false;
    busy = false;
});


// ===== Camera =====

// Runs each time the camera reads a QR code.
async function onScan(text) {
    // The camera reads the same code many times a second. Handle only the
    // first read, then stop the camera so the result stays on screen.
    if (busy) {
        return;
    }
    busy = true;

    await stopCamera();
    await verifyTicket(text, true);

    busy = false;
}

async function startCamera() {
    if (!currentEvent) {
        showMessage('Choose an event first.', true);
        return;
    }
    if (typeof Html5Qrcode === 'undefined') {
        showMessage('The scanner library did not load. Check your internet connection.', true);
        return;
    }

    result.hidden = true;
    showMessage('');

    try {
        scanner = scanner || new Html5Qrcode('reader');
        await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            onScan
        );
        cameraRunning = true;
        startButton.disabled = true;
        stopButton.disabled = false;
    } catch (error) {
        showMessage('Could not start the camera. Allow camera access, and open this page at localhost.', true);
    }
}

async function stopCamera() {
    if (!cameraRunning) {
        return;
    }
    try {
        await scanner.stop();
        // Empties the camera area so the video is removed from the page.
        await scanner.clear();
    } catch (error) {
        // The camera was already stopped.
    }
    cameraRunning = false;
    startButton.disabled = false;
    stopButton.disabled = true;
}

startButton.addEventListener('click', startCamera);
stopButton.addEventListener('click', stopCamera);
scanNextButton.addEventListener('click', startCamera);

loadEvents();
