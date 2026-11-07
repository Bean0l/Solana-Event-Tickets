// Standalone test script: creates one mint on DevNet.
// Run from the repo root: node backend/scripts/create-mint.js

require('dotenv').config();
const fs = require('fs');
const { Connection, Keypair } = require('@solana/web3.js');
const { createMint } = require('@solana/spl-token');

const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH;

async function main() {
    // Safety check: this project only runs on DevNet.
    if (!RPC_URL.includes('devnet')) {
		throw new Error('RPC_URL must be a DevNet URL. This project never uses mainnet.');
    }
    if (!KEYPAIR_PATH) {
        throw new Error('KEYPAIR_PATH is missing. Copy .env.example to .env first.');
    }

    // The keypair file is a JSON list of numbers (the secret key bytes).
    // We load it into a Keypair object and never print it.
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8')));
    const server = Keypair.fromSecretKey(secretKey);
    console.log('Server address:', server.publicKey.toBase58());

    // A Connection is how our code sends requests to the Solana network.
    const connection = new Connection(RPC_URL, 'confirmed');
    const balance = await connection.getBalance(server.publicKey);
    console.log('Server balance (SOL):', balance / 1e9);




    // createMint arguments, in order:
    // 1. connection
    // 2. payer: the account that pays the fee and rent (the server)
    // 3. mint authority: the only account allowed to create new tokens (the server)
    // 4. freeze authority: the only account allowed to freeze token accounts (the server)
    // 5. decimals: 0, so one ticket is one whole token
    const mint = await createMint(
        connection,
        server,
        server.publicKey,
        server.publicKey,
        0
    );

    console.log('Mint created:', mint.toBase58());
    console.log(
        'View on Explorer:',
        `https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`
    );
}

main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
