// All Solana logic lives in this file. Routes call these functions and never
// talk to the blockchain directly.

require('dotenv').config();
const fs = require('fs');

const {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
} = require('@solana/web3.js');

const {
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    getMinimumBalanceForRentExemptMint,
    createInitializeMint2Instruction,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountIdempotentInstruction,
    createMintToInstruction,
    createFreezeAccountInstruction,
    getAccount,
    TokenAccountNotFoundError,
} = require('@solana/spl-token');

const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH;

// Safety checks: this project only runs on DevNet and needs a keypair file.
if (!RPC_URL.includes('devnet')) {
    throw new Error('RPC_URL must be a DevNet URL. This project never uses mainnet.');
}

if (!KEYPAIR_PATH) {
    throw new Error('KEYPAIR_PATH is missing. Copy .env.example to .env first.');
}

// Load the server keypair from the file. The secret key is never printed or logged.
const server = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8')))
);

// A Connection is how our code sends requests to the Solana network.
const connection = new Connection(RPC_URL, 'confirmed');

// Makes an error that carries an HTTP status code, so the routes can reply with
// the right code (400 bad input, 404 not found, 409 conflict).
function httpError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// Turns a text address into a PublicKey. Throws a clear error if it is not valid.
function parseAddress(text, label) {
    try {
        return new PublicKey(text);
    } catch (err) {
        throw httpError(`Invalid ${label} address`, 400);
    }
}

// Finds the attendee's associated token account (the standard token account for this wallet and this mint). 
// The address is computed, so no lookup is needed.
// Computing the address does not create the account.
function ticketAddress(mint, wallet) {
    return getAssociatedTokenAddressSync(mint, wallet);
}

// Reads the token account. Returns null if it does not exist yet.
async function readTicketAccount(address) {
    try {
        return await getAccount(connection, address);
    } catch (err) {
        if (err instanceof TokenAccountNotFoundError) return null;
        throw err;
    }
}

function statusOf(account) {
    if (!account || account.amount === 0n) return 'none';
    return account.isFrozen ? 'used' : 'valid';
}

// 1. Create a new mint (the token type for one event).
// The server is the payer, the mint authority, and the freeze authority.
// Decimals is 0, so one ticket is one whole token.
async function createEventMint() {

    // a new address for the new mint
    const mintKeypair = Keypair.generate();

    const rent = await getMinimumBalanceForRentExemptMint(connection);
    const tx = new Transaction().add(

        // Create the account that will store the mint data.
        SystemProgram.createAccount({
            fromPubkey: server.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: MINT_SIZE,
            lamports: rent,
            programId: TOKEN_PROGRAM_ID,
        }),

        // Turn it into a mint: decimals 0, mint authority and freeze authority are the server.
        createInitializeMint2Instruction(
            mintKeypair.publicKey,
            0,
            server.publicKey,
            server.publicKey
        )
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [server, mintKeypair]);
    return { mint: mintKeypair.publicKey.toBase58(), signature };
}

// 2. Issue one ticket: create the attendee's token account and mint 1 token into it.
// Both steps are in one transaction, so either both happen or neither does.
// The server pays. The attendee signs nothing and needs no SOL.
async function issueTicket(mintAddress, walletAddress) {
    const mint = parseAddress(mintAddress, 'mint');
    const wallet = parseAddress(walletAddress, 'wallet');
    const address = ticketAddress(mint, wallet);

    const existing = await readTicketAccount(address);
    if (existing && existing.amount > 0n) {
        throw httpError('Wallet already holds a ticket', 409);
    }

    const tx = new Transaction().add(

        // Idempotent means it does nothing if the account already exists.
        createAssociatedTokenAccountIdempotentInstruction(
            server.publicKey, // payer
            address,
            wallet, // owner
            mint
        ),
        createMintToInstruction(mint, address, server.publicKey, 1)
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [server]);
    return { signature };
}

// 3. Verify a ticket: returns 'valid', 'used', or 'none'.
async function verifyTicket(mintAddress, walletAddress) {
    const mint = parseAddress(mintAddress, 'mint');
    const wallet = parseAddress(walletAddress, 'wallet');
    const account = await readTicketAccount(ticketAddress(mint, wallet));
    return { status: statusOf(account) };
}

// 4. Check in: freeze the attendee's token account, only if the ticket is valid.
async function freezeTicket(mintAddress, walletAddress) {
    const mint = parseAddress(mintAddress, 'mint');
    const wallet = parseAddress(walletAddress, 'wallet');
    const address = ticketAddress(mint, wallet);

    const status = statusOf(await readTicketAccount(address));
    if (status !== 'valid') {
        throw status === 'used'
            ? httpError('Ticket already used', 409)
            : httpError('No ticket found', 404);
    }

    const tx = new Transaction().add(
        createFreezeAccountInstruction(address, mint, server.publicKey)
    );
    const signature = await sendAndConfirmTransaction(connection, tx, [server]);
    return { signature };
}

module.exports = { createEventMint, issueTicket, verifyTicket, freezeTicket };