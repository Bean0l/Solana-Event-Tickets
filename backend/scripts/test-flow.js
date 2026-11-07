// Standalone test: runs the whole ticket flow on DevNet with a throwaway attendee.
// Run from the repo root: node backend/scripts/test-flow.js

const { Keypair } = require('@solana/web3.js');
const {
    createEventMint,
    issueTicket,
    verifyTicket,
    freezeTicket,
} = require('../server/solana');

const explorer = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

async function main() {
    // A throwaway attendee. Only the public address is given to the server.
    const attendee = Keypair.generate().publicKey.toBase58();
    console.log('Test attendee address:', attendee);

    const { mint, signature: mintSig } = await createEventMint();
    console.log('1. Mint created:', mint, '\n  ', explorer(mintSig));

    console.log('2. Verify before issuing (expect none):', (await verifyTicket(mint, attendee)).status);

    const issued = await issueTicket(mint, attendee);
    console.log('3. Ticket issued:', explorer(issued.signature));

    console.log('4. Verify after issuing (expect valid):', (await verifyTicket(mint, attendee)).status);

    try {
        await issueTicket(mint, attendee);
        console.log('5. Second issue: FAILED, it should have been refused');
    } catch (err) {
        console.log('5. Second issue refused as expected:', err.message);
    }

    const frozen = await freezeTicket(mint, attendee);
    console.log('6. Checked in (frozen):', explorer(frozen.signature));

    console.log('7. Verify after check-in (expect used):', (await verifyTicket(mint, attendee)).status);

    try {
        await freezeTicket(mint, attendee);
        console.log('8. Second check-in: FAILED, it should have been refused');
    } catch (err) {
        console.log('8. Second check-in refused as expected:', err.message);
    }

    try {
        await verifyTicket(mint, 'not-a-wallet');
    } catch (err) {
        console.log('9. Bad wallet refused as expected:', err.message);
    }
}

main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
