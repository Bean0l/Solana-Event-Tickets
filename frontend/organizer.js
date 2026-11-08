// organizer.js
// Script for organizer.html. Sends the form to the server to create an
// event, then shows the new event's ID, token address, and links.

const form = document.getElementById('event-form');
const button = document.getElementById('create-event');
const message = document.getElementById('message');
const created = document.getElementById('created');

// Shows text in the message box. Pass true for an error, which turns it red.
function showMessage(text, isError) {
    message.textContent = text;
    message.classList.toggle('error', isError === true);
}

form.addEventListener('submit', async function (event) {
    // Stop the browser from reloading the page when the form is submitted.
    event.preventDefault();

    // Disable the button so a second click cannot create a second event.
    // The server takes a few seconds because it creates a token on Solana.
    button.disabled = true;
    button.textContent = 'Creating event...';
    showMessage('Creating the event on Solana. This takes a few seconds.');

    try {
        const response = await fetch('/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('name').value.trim(),
                date: document.getElementById('date').value.trim(),
                // The server needs capacity as a number, not text.
                capacity: Number(document.getElementById('capacity').value)
            })
        });
        const data = await response.json();

        // response.ok is only true for status 200 to 299.
        if (!response.ok) {
            throw new Error(data.error);
        }

        showCreatedEvent(data);
        showMessage('');
        form.reset();
    } catch (error) {
        // A network failure has no server message, so use a plain one.
        const text = error instanceof TypeError
            ? 'Could not reach the server. Check that it is running.'
            : error.message;
        showMessage(text, true);
    } finally {
        // Runs after success or failure, so the form can be used again.
        button.disabled = false;
        button.textContent = 'Create event';
    }
});

// Fills in the "Event created" panel from the server's response.
// textContent is used instead of innerHTML so the event name is shown as
// plain text and can never run as code.
function showCreatedEvent(data) {
    document.getElementById('created-id').textContent = data.id;
    document.getElementById('created-name').textContent = data.name;
    document.getElementById('created-mint').textContent = data.mint;

    // The other pages read the event ID from the address.
    document.getElementById('attendee-link').href = 'attendee.html?event=' + data.id;
    document.getElementById('scanner-link').href = 'scanner.html?event=' + data.id;

    document.getElementById('explorer-link').href =
        'https://explorer.solana.com/tx/' + data.signature + '?cluster=devnet';

    created.hidden = false;
}
