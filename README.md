# Solana Event Tickets

A ticketing app on Solana DevNet where every ticket can only be used once. Built for the Solana Hackathon (Nov 6 to 8, 2026).

## The problem

Event tickets get copied, reused, or faked. Organizers need a way to prove a ticket was already used. Attendees should not need crypto knowledge or a wallet app to get in.

## The idea

- Each **event** is a token on Solana (called a mint).
- Each **ticket** is one token in the attendee's wallet.
- **Check-in freezes** the attendee's token account, so the ticket cannot be used a second time.
- The **server pays every fee**. Attendees never need SOL.

## How it works

1. **Create event:** The server creates a new mint (decimals 0). The server is both the mint authority and the freeze authority. Event details and the mint address are saved in SQLite.
2. **Get ticket:** The server creates the attendee's token account and mints 1 token into it. It first checks that the event exists, that tickets are below capacity, and that the wallet does not already hold one.
3. **QR code:** The ticket QR holds the event ID and the attendee's wallet address.
4. **Scan:** The scanner sends those two values to the server, which reads the token account on Solana:
   - Green: valid ticket (balance 1, not frozen)
   - Yellow: already used (balance 1, frozen)
   - Red: no ticket (account missing or balance 0)
5. **Check in:** The server freezes the token account.

SQLite stores event names, dates, capacity, and which mint belongs to which event ID. Solana stores who holds a ticket and whether it is frozen.

## Tech stack

| Area | Tools |
| --- | --- |
| Blockchain | Solana DevNet, SPL Token Program (no custom on-chain program), `@solana/web3.js` v1, `@solana/spl-token` |
| Backend | Node.js, Express 5, better-sqlite3, dotenv |
| Frontend | Plain HTML, CSS and JavaScript, html5-qrcode (scanner), qrcodejs (QR codes), web3.js in the browser (test wallets) |

## Pages

| Page | What it does |
| --- | --- |
| `organizer.html` | Create an event and see its mint address |
| `attendee.html` | Pick an event, get a ticket, show the QR code |
| `scanner.html` | Scan a ticket, see green, yellow or red, and check in |

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /events | Create an event (name, date, capacity) |
| GET | /events | List all events, newest first |
| GET | /events/:id | Event details and tickets issued |
| POST | /events/:id/tickets | Issue 1 ticket (body: wallet) |
| GET | /events/:id/verify/:wallet | Returns `valid`, `used` or `none` |
| POST | /events/:id/checkin/:wallet | Freezes the ticket if valid |

Responses are JSON and include the transaction signature when a transaction is sent, so it can be checked in Solana Explorer (DevNet).

## Run it locally

You need Node.js and the Solana CLI.

1. Install dependencies:
   ```
   npm install
   ```
2. Create a server keypair and fund it with DevNet SOL:
   ```
   solana-keygen new -o organizer.json
   solana airdrop 2 --keypair organizer.json --url devnet
   ```
3. Create a `.env` file in the project root (see `.env.example`):
   ```
   KEYPAIR_PATH=./organizer.json
   RPC_URL=https://api.devnet.solana.com
   ```
4. Start the server:
   ```
   npm start
   ```
5. Open http://localhost:3000/organizer.html, create an event, then open the attendee and scanner pages.

To test with a phone, put it on the same Wi-Fi and use the laptop's address instead of `localhost` (for example `http://192.168.1.175:3000/attendee.html`). The scanner uses the laptop camera, because browsers only allow camera access on `localhost` or HTTPS.

## Project structure

```
backend/
  server/
    index.js        Express app and routes
    solana.js       Mint, issue, verify and freeze functions
    db.js           SQLite setup and queries
  scripts/
    create-mint.js  Standalone script to test mint creation
frontend/
  organizer.html / organizer.js
  attendee.html / attendee.js
  scanner.html / scanner.js
  style.css
```

## Security notes

- DevNet only. No real money is involved.
- The server keypair (`organizer.json`) and `.env` are never committed.
- Wallet addresses are validated before use.

## Known limits and next steps

- QR codes hold only public data, so a photo of a ticket still scans.
- A ticket that has not been checked in can still be transferred.

Next steps:
1. Signed QR codes, to fix the photo problem
2. A Phantom wallet connect button
3. Paid tickets

## Team

- Steve Llanos: server, Solana code, organizer page
- Dylan Manjon: attendee page, scanner page, testing
