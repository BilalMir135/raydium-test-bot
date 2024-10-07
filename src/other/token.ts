import {
  SystemProgram,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import { connection, wallet } from '../raydium/config';

function createMintIx(payer: PublicKey, mint: PublicKey, decimals: number, lamports: number) {
  const createMintAccontInstruction = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mint,
    space: MINT_SIZE,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  });

  const initializeMintAccontInstruction = createInitializeMint2Instruction(
    mint,
    decimals,
    payer,
    null
  );

  return [createMintAccontInstruction, initializeMintAccontInstruction];
}

function mintToIx(payer: PublicKey, mint: PublicKey, destination: PublicKey, amount: bigint) {
  const destinationATA = getAssociatedTokenAddressSync(mint, destination, true);

  const createATAInstruction = createAssociatedTokenAccountInstruction(
    payer,
    destinationATA,
    destination,
    mint
  );

  const mintToInstruction = createMintToInstruction(mint, destinationATA, payer, amount);

  return [createATAInstruction, mintToInstruction];
}

export async function createTestToken(mintKey?: Keypair) {
  const mint = mintKey ?? Keypair.generate();
  const lamports = await getMinimumBalanceForRentExemptMint(connection);
  const instructions = [
    ...createMintIx(wallet.publicKey, mint.publicKey, 9, lamports),
    ...mintToIx(wallet.publicKey, mint.publicKey, wallet.publicKey, BigInt(10000000 * 1e9)),
  ];

  const txn = new Transaction();
  instructions.forEach(ix => txn.add(ix));

  const txId = await sendAndConfirmTransaction(connection, txn, [wallet, mint]);

  console.log('--- Token created ---');
  console.log('mint => ', mint.publicKey.toBase58());
  console.log('txId => ', txId);
}
