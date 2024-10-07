import Decimal from 'decimal.js';
import BN from 'bn.js';
import { Clmm, fetchMultipleMintInfos } from '@raydium-io/raydium-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

import { connection, makeTxVersion, wallet } from '../config';
import { formatClmmKeysById } from '../helpers/formatClmmKeysById';
import {
  buildAndSendTx,
  getWalletTokenAccount,
  formatUnits,
  getConfirmedTransaction,
} from '../utils';

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>;
type TestTxInputInfo = {
  targetPool: string;
  inputTokenAmount: Decimal;
  inputTokenMint: 'mintA' | 'mintB';
  walletTokenAccounts: WalletTokenAccounts;
  wallet: Keypair;
  tickLower: number;
  tickUpper: number;
  slippage: number;
};

async function clmmOpenPosition({
  targetPool,
  inputTokenAmount,
  inputTokenMint,
  walletTokenAccounts,
  wallet,
  tickLower,
  tickUpper,
  slippage,
}: TestTxInputInfo) {
  // -------- pre-action: fetch basic info --------
  const clmmPool = await formatClmmKeysById(targetPool);

  // -------- step 1: Clmm info and Clmm position --------
  const {
    [clmmPool.id]: { state: poolInfo },
  } = await Clmm.fetchMultiplePoolInfos({
    connection,
    poolKeys: [clmmPool],
    chainTime: new Date().getTime() / 1000,
    ownerInfo: {
      wallet: wallet.publicKey,
      tokenAccounts: walletTokenAccounts,
    },
  });

  // -------- step 2: get liquidity --------
  const { liquidity, amountSlippageA, amountSlippageB } = Clmm.getLiquidityAmountOutFromAmountIn({
    poolInfo,
    slippage,
    inputA: inputTokenMint === 'mintA',
    tickUpper,
    tickLower,
    amount: new BN(inputTokenAmount.mul(10 ** poolInfo[inputTokenMint].decimals).toFixed(0)),
    add: true,

    amountHasFee: false,

    token2022Infos: await fetchMultipleMintInfos({
      connection,
      mints: [poolInfo.mintA.mint, poolInfo.mintB.mint],
    }),
    epochInfo: await connection.getEpochInfo(),
  });

  console.log(
    `will add liquidity -> ${liquidity.toString()} - amount A -> ${formatUnits(
      amountSlippageA.amount,
      poolInfo.mintA.decimals
    )} - amount B -> ${formatUnits(amountSlippageB.amount, poolInfo.mintB.decimals)}`
  );

  // -------- step 3: make open position instruction --------
  const makeOpenPositionInstruction = await Clmm.makeOpenPositionFromLiquidityInstructionSimple({
    connection,
    poolInfo,
    ownerInfo: {
      feePayer: wallet.publicKey,
      wallet: wallet.publicKey,
      tokenAccounts: walletTokenAccounts,
      useSOLBalance: true,
    },
    tickUpper,
    tickLower,
    liquidity,
    makeTxVersion,
    amountMaxA: amountSlippageA.amount,
    amountMaxB: amountSlippageB.amount,
  });

  return {
    ix: makeOpenPositionInstruction,
    data: { liquidity, amountA: amountSlippageA.amount, amountB: amountSlippageB.amount },
  };
}

export async function openPositionIx(
  poolId: string,
  meshAmount: Decimal,
  tickLower: number,
  tickUpper: number
) {
  const inputTokenMint: 'mintA' | 'mintB' = 'mintA';
  const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey);
  const slippage = 0.01;

  return await clmmOpenPosition({
    targetPool: poolId,
    inputTokenAmount: meshAmount,
    inputTokenMint,
    walletTokenAccounts,
    wallet,
    tickLower,
    tickUpper,
    slippage,
  });
}

export async function openPositionExe(
  poolId: string,
  meshAmount: Decimal,
  tickLower: number,
  tickUpper: number
) {
  const instruction = await openPositionIx(poolId, meshAmount, tickLower, tickUpper);

  const txids = await buildAndSendTx(instruction.ix.innerTransactions);

  const txId = await getConfirmedTransaction(txids[0]);

  console.log('txId', txId);

  return instruction.ix.address.nftMint.toString();
}
