/**
 * @file closeAutomation.mjs
 * @description One-time script to close a "stuck" or "broken" Automation PDA.
 * This fixes the `InvalidAccountData` error on the Deploy instruction.
 */

import { Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { ORE_PROGRAM_ID, SYSTEM_PROGRAM_ID } from './constants.mjs';
import { getAutomationPda } from './solana.mjs';
import { loadSigner } from './wallet.mjs';
import { initConnection } from './solana.mjs';

async function closeAutomation() {
  try {
    // 1. Init Connection and Load Signer
    const connection = initConnection();
    const signer = loadSigner();

    if (!signer) {
      console.error('ERROR: Signer not loaded. Check wallet.mjs and ~/.config/solana/id.json');
      return;
    }
    const authority = signer.publicKey;
    console.log(`Loaded signer (Authority): ${authority.toBase58()}`);

    // 2. Build Accounts
    const automationPda = getAutomationPda(authority);
    console.log(`Found Automation PDA: ${automationPda.toBase58()}`);

    const accounts = [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: true },
      { pubkey: automationPda, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 3. Build Data Buffer
    // Instruction 8: CloseAutomation
    const dataBuffer = Buffer.alloc(1);
    dataBuffer.writeUInt8(8, 0); // Instruction index

    // 4. Build Instruction & Transaction
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: ORE_PROGRAM_ID,
      data: dataBuffer,
    });

    const transaction = new Transaction().add(instruction);

    // 5. Send Transaction
    console.log('Sending transaction to close automation account...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer]
    );

    console.log(`\nSUCCESS! Account closed.`);
    console.log(`Signature: ${signature}`);

  } catch (e) {
    console.error('\nSCRIPT FAILED:');
    if (e.message.includes('0xbc4') || e.message.includes('Account not initialized')) {
        console.log('Error: Account not initialized or already closed. This is fine.');
    } else {
        console.error(e.message);
        if (e.logs) {
            console.error('\n--- TRANSACTION LOGS ---');
            e.logs.forEach(log => console.error(`  ${log}`));
        }
    }
  }
}

closeAutomation();