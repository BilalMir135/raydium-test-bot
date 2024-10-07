import assert from 'assert';

import { Clmm, ClmmPoolPersonalPosition, ZERO } from '@raydium-io/raydium-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

import { connection, makeTxVersion, wallet } from '../config';
import { formatClmmKeysById } from '../helpers/formatClmmKeysById';
import { buildAndSendTx, getWalletTokenAccount, getConfirmedTransaction } from '../utils';

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>;
type TestTxInputInfo = {
  targetPool: string;
  positionMint: string;
  walletTokenAccounts: WalletTokenAccounts;
  wallet: Keypair;
  ownerPosition?: ClmmPoolPersonalPosition;
};

async function clmmRemovePosition(input: TestTxInputInfo) {
  // -------- pre-action: fetch basic info --------
  const clmmPool = await formatClmmKeysById(input.targetPool);

  // -------- step 1: ammV3 info and ammV3 position --------
  const { [clmmPool.id]: sdkParsedAmmV3Info } = await Clmm.fetchMultiplePoolInfos({
    connection,
    poolKeys: [clmmPool],
    chainTime: new Date().getTime() / 1000,
    ownerInfo: {
      wallet: wallet.publicKey,
      tokenAccounts: input.walletTokenAccounts,
    },
  });
  const { state: clmmPoolInfo, positionAccount } = sdkParsedAmmV3Info;

  const ammV3Position =
    input.ownerPosition ??
    positionAccount?.find(({ nftMint }) => nftMint.equals(new PublicKey(input.positionMint)));

  assert(ammV3Position, "position is not exist/is empty, so can't continue to add position");

  // -------- step 2: make ammV3 remove position instructions --------
  const makeDecreaseLiquidityInstruction = await Clmm.makeDecreaseLiquidityInstructionSimple({
    connection,
    poolInfo: clmmPoolInfo,
    ownerPosition: ammV3Position,
    ownerInfo: {
      feePayer: wallet.publicKey,
      wallet: wallet.publicKey,
      tokenAccounts: input.walletTokenAccounts,
      closePosition: true, // for close
      useSOLBalance: true,
    },
    liquidity: ammV3Position.liquidity,
    // slippage: 1, // if encouter slippage check error, try uncomment this line and set a number manually
    makeTxVersion,
    amountMinA: ZERO,
    amountMinB: ZERO,
  });

  return makeDecreaseLiquidityInstruction;
}

export async function removePositionIx(
  poolId: string,
  positionMint: string,
  ownerPosition?: ClmmPoolPersonalPosition
) {
  const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey);

  return await clmmRemovePosition({
    targetPool: poolId,
    positionMint,
    walletTokenAccounts,
    wallet: wallet,
    ownerPosition,
  });
}

export async function removePositionExe(poolId: string, positionMint: string) {
  const instruction = await removePositionIx(poolId, positionMint);

  const txids = await buildAndSendTx(instruction.innerTransactions);

  const txId = await getConfirmedTransaction(txids[0]);

  console.log('txId', txId);
}
