/**
 * @file transactions.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Handles the construction and sending of all Solana transactions.
 * This module builds the `sendDeployTx` and `sendCheckpointTx` instructions,
 * complete with the necessary accounts and data buffers (like the bitmask
 * for deployments), signs them with the user's wallet, and sends them
 * to the network.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import { Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import BN from 'bn.js';

import { getState } from './state.mjs';
import { log, handleFatalError } from './utils.mjs';
import {
  ORE_PROGRAM_ID,
  SOL_PER_LAMPORT,
  SYSTEM_PROGRAM_ID,
} from './constants.mjs';
import {
  getBoardPda,
  getRoundPda,
  getMinerPda,
  getAutomationPda,
  getTreasuryPda,
} from './solana.mjs';

// --- Private Helper Functions ---

/**
 * Creates the 32-bit bitmask for the target squares.
 * ORE v3 uses a u32 bitmask (1 << 0...24) to represent the 25 squares.
 * @param {Array<object>} targets - Array of target objects { id: number, ... }
 * @returns {number} A u32 bitmask.
 */
function createSquaresMask(targets) {
  let mask = 0;
  for (const target of targets) {
    const squareIndex = target.id - 1; // Convert 1-based ID to 0-based index
    if (squareIndex >= 0 && squareIndex < 25) {
      mask |= (1 << squareIndex);
    }
  }
  return mask;
}

// --- Public Transaction Functions ---

/**
 * Sends a Checkpoint transaction for a specific round.
 * @param {BN} roundToCheckpoint - The BN.js ID of the round to checkpoint.
 * @param {object} connection - The Solana connection object.
 * @param {Keypair} signer - The user's keypair.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export async function sendCheckpointTx(roundToCheckpoint, connection, signer) {
  // 1. Guard Clause
  if (!signer) {
    log('checkpoint FAILED: signer keypair not loaded');
    return false;
  }

  try {
    // 2. Build Accounts
    const authority = signer.publicKey;
    const accounts = [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: getBoardPda(), isSigner: false, isWritable: true },
      { pubkey: getMinerPda(authority), isSigner: false, isWritable: true },
      { pubkey: getRoundPda(roundToCheckpoint), isSigner: false, isWritable: true },
      { pubkey: getTreasuryPda(), isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 3. Build Data Buffer
    // Instruction 2: Checkpoint
    const dataBuffer = Buffer.alloc(1);
    dataBuffer.writeUInt8(2, 0);

    // 4. Build Instruction & Transaction
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: ORE_PROGRAM_ID,
      data: dataBuffer,
    });

    const transaction = new Transaction().add(instruction);

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer]
    );

    log(`checkpoint successful: ${signature.slice(0, 16)}...`);
    return true;

  } catch (e) {
    // 6. Handle Errors
    const errorLogs = e.logs ? e.logs.join('\n') : e.message;
    // 0x1: "Round not yet expired" or "Checkpoint already processed"
    if (errorLogs.includes("custom program error: 0x1")) {
      log(`checkpoint for round ${roundToCheckpoint.toString()} already done or not needed`);
      return true; // Not a fatal error
    }

    // All other errors are fatal
    handleFatalError(e);
    return false;
  }
}

/**
 * Builds, signs, and sends the Deploy transaction.
 * @param {Array<object>} targets - Array of target objects to deploy to.
 * @param {object} connection - The Solana connection object.
 * @param {Keypair} signer - The user's keypair.
 */
export async function sendDeployTx(targets, connection, signer) {
  // 1. Guard Clauses
  if (!signer) {
    log('deploy failed: signer keypair not loaded');
    return;
  }

  if (targets.length === 0) {
    log('deploy skipped: no targets provided');
    return;
  }

  try {
    // 2. Get State
    const { currentRoundId, customDeployAmount } = getState();

    // 3. Build Accounts
    const authority = signer.publicKey;
    const accounts = [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: true },
      { pubkey: getAutomationPda(authority), isSigner: false, isWritable: true },
      { pubkey: getBoardPda(), isSigner: false, isWritable: true },
      { pubkey: getMinerPda(authority), isSigner: false, isWritable: true },
      { pubkey: getRoundPda(currentRoundId), isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 4. Build Data Buffer
    const amountLamports = BigInt(Math.floor(customDeployAmount / SOL_PER_LAMPORT));
    const squaresMask = createSquaresMask(targets);

    // Instruction 6: Deploy
    // [u8(6), u64(amount), u32(squares)]
    const dataBuffer = Buffer.alloc(1 + 8 + 4);
    dataBuffer.writeUInt8(6, 0); // Instruction index
    dataBuffer.writeBigUInt64LE(amountLamports, 1); // Amount per square
    dataBuffer.writeUInt32LE(squaresMask, 9); // Bitmask of squares

    // 5. Build Instruction & Transaction
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: ORE_PROGRAM_ID,
      data: dataBuffer,
    });

    const transaction = new Transaction().add(instruction);

    // 6. Send Transaction
    log(`sending deploy tx for ${targets.length} target(s)...`);

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer]
      // { commitment: 'confirmed' } // Optionally add for higher confirmation
    );

    log(`deploy successful! signature: ${signature}`);

  } catch (e) {
    // 7. Handle Errors
    handleFatalError(e);
  }
}
