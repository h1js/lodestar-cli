/**
 * @file detection.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Contains the logic for analyzing the game board state.
 * This module's `analyzeBoardState` function parses the raw round data
 * to compute the EV and SOL/player ratio for all 25 squares, then
 * sorts them to identify the most profitable targets for the
 * automation logic.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import { SOL_PER_LAMPORT } from './constants.mjs';
import { computeEVStarForBlock, getOreValueInSOL } from './ev.mjs';

// --- Constants ---
const NUM_SQUARES = 25;

// --- Public Functions ---

/**
 * Analyzes the current round data to identify optimal squares based on EV and ratio.
 * @param {object} roundData - The parsed round data from the Solana account.
 * @returns {object} An analysis object containing lists of squares sorted by EV and ratio.
 */
export function analyzeBoardState(roundData) {
  // Guard clause for missing data
  if (!roundData) {
    return {
      bestEV: null,
      bestRatio: null,
      byEV: [],
      byRatio: [],
      fullAnalysis: [],
    };
  }

  // 1. Initialization
  const T = Number(roundData.total_deployed.toString()) * SOL_PER_LAMPORT;
  const oreValueInSOL = getOreValueInSOL(roundData);

  const evs = [];
  const ratios = [];
  const fullAnalysis = [];

  // 2. Loop through all squares and calculate metrics
  for (let i = 0; i < NUM_SQUARES; i++) {
    const squareIndex = i;
    const countVal = Number(roundData.count[i].toString());
    const deployedVal = Number(roundData.deployed[i].toString());
    const sol = (deployedVal * SOL_PER_LAMPORT);

    // Calculate Ratio (SOL / Players)
    const ratio = (countVal > 0) ? (sol / countVal) : Infinity;
    ratios.push({
      id: squareIndex + 1,
      sol,
      count: countVal,
      ratio,
    });

    // Calculate Expected Value (EV)
    const O = sol; // SOL deployed by others (in this context, the total in the square)
    const { EV } = computeEVStarForBlock(O, T, oreValueInSOL);
    const evValue = isFinite(EV) ? EV : -Infinity;
    evs.push({
      id: squareIndex + 1,
      sol,
      ev: evValue,
    });

    // Store combined data
    fullAnalysis.push({
      id: squareIndex + 1,
      sol,
      count: countVal,
      ratio,
      ev: evValue,
    });
  }

  // 3. Sort Results
  // Sort by best EV (highest first), filtering out non-positive EV
  const sortedByEV = evs
    .filter(e => e.ev > 0)
    .sort((a, b) => b.ev - a.ev);

  // Sort by best ratio (lowest first), filtering out empty squares
  const sortedByRatio = ratios
    .filter(r => r.ratio < Infinity && r.ratio > 0)
    .sort((a, b) => a.ratio - b.ratio);

  // 4. Return Analysis Object
  return {
    bestEV: sortedByEV[0] || null,        // The single best EV square (if > 0)
    bestRatio: sortedByRatio[0] || null,  // The single best ratio square
    byEV: sortedByEV,                     // All squares with positive EV, sorted
    byRatio: sortedByRatio,               // All squares with players, sorted by ratio
    fullAnalysis: fullAnalysis,           // Raw analysis data for all 25 squares
  };
}
