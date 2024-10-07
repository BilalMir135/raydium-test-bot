import { MAINNET_PROGRAM_ID, DEVNET_PROGRAM_ID, TxVersion } from '@raydium-io/raydium-sdk';
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import base58 from 'bs58';

export const isDev = false;

const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

export const wallet = Keypair.fromSecretKey(
  base58.decode(process.env.WALLET_PRIVATE_KEY as string)
);

export const connection = new Connection(isDev ? clusterApiUrl('devnet') : rpcUrl);

export const PROGRAMIDS = isDev ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;

export const makeTxVersion = TxVersion.V0; // LEGACY

export const addLookupTableInfo = undefined; // only mainnet. other = undefined
