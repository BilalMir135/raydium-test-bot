import { PublicKey } from '@solana/web3.js';
import {
  Token,
  TOKEN_PROGRAM_ID,
  TokenAmount,
  ClmmPoolPersonalPosition,
  ZERO,
} from '@raydium-io/raydium-sdk';
import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import Decimal from 'decimal.js';

import { connection, isDev, wallet } from './config';
import { buildAndSendTx } from './utils';
import { PositionData, getClmmPositions } from './helpers/getClmmPosition';
import { openPositionExe, openPositionIx } from './instructions/openPosition';
import { swapExe, swapIx } from './instructions/swap';
import { removePositionExe, removePositionIx } from './instructions/removePosition';

const depthConverage = 0.8;
const swapSOLAmount = 1;

const WSOL = new Token(
  TOKEN_PROGRAM_ID,
  new PublicKey('So11111111111111111111111111111111111111112'),
  9
);

const MESH = new Token(
  TOKEN_PROGRAM_ID,
  new PublicKey('MESHA6ZQ5YGcMUpMxUdqvQ3vbLHJUub2wTkPqySL8TX'),
  9
);

const mainnetPool = 'C6Fk5DceKtzNPk9LbE5wS6nodwogp5TvqRaiUUGLDaHB';
const devnetPool = '6cYdYRXcATn9KXbBLZpPZhmoaV3ePVU2don26Q72vVj4';
const devnetPool2 = 'fqM1sDC7anFJnAB3163JSofZw5Yj9juWvExbEuFeyPu';

const poolId = isDev ? devnetPool : mainnetPool;

export async function addSwapRemoveCombine() {
  const userPrevBalance = await assetBalance();

  const {
    poolInfo: { tickCurrent, tickSpacing },
    positions,
  } = await getClmmPositions(poolId);

  const newPositon = narrowPositionTicks(tickCurrent, tickSpacing);

  const existingMeshAmountPerTick = positions
    .filter(({ status }) => status === 'InRange')
    .reduce<Decimal>((accum, positon) => {
      const perTickMeshAmount = meshAmountPerTick(
        tickCurrent,
        tickSpacing,
        positon.tickUpper,
        positon.amountA
      );
      return accum.add(perTickMeshAmount);
    }, new Decimal(0));

  const inputMeshAmount = getShareAmount(existingMeshAmountPerTick, depthConverage);

  console.log('\n\n ---------- Executing Add,Swap,Remove ---------- \n');
  console.log('current tick => ', tickCurrent);
  console.log('tickLower => ', newPositon.tickLower);
  console.log('tickUpper => ', newPositon.tickUpper);
  console.log('existingMeshAmountPerTick => ', existingMeshAmountPerTick.toString());
  console.log('inputMeshAmount => ', inputMeshAmount.toString());

  const addLig = await openPositionIx(
    poolId,
    inputMeshAmount,
    newPositon.tickLower,
    newPositon.tickUpper
  );

  const swap = await swapIx(poolId, new TokenAmount(WSOL, swapSOLAmount * 1e9), MESH);

  const ZERO_D = new Decimal(0);

  const ownerPosition: ClmmPoolPersonalPosition = {
    poolId: new PublicKey(poolId),
    nftMint: addLig.ix.address.nftMint,
    tickLower: newPositon.tickLower,
    tickUpper: newPositon.tickUpper,
    liquidity: addLig.data.liquidity,

    //just for type, have no impact on remove liquidity
    amountA: ZERO,
    amountB: ZERO,
    feeGrowthInsideLastX64B: ZERO,
    feeGrowthInsideLastX64A: ZERO,
    leverage: 0,
    priceLower: ZERO_D,
    priceUpper: ZERO_D,
    rewardInfos: [],
    tokenFeeAmountA: ZERO,
    tokenFeeAmountB: ZERO,
    tokenFeesOwedA: ZERO,
    tokenFeesOwedB: ZERO,
  };

  const removeLiq = await removePositionIx(
    poolId,
    addLig.ix.address.nftMint.toBase58(),
    ownerPosition
  );

  const txIds = await buildAndSendTx([
    ...addLig.ix.innerTransactions,
    ...swap.innerTransactions,
    ...removeLiq.innerTransactions,
  ]);

  console.log('txId => ', txIds[0]);

  console.log('\n\n---------- Analytics ---------- \n');
  const positonsPrevState = positions.reduce<Record<string, PositionData>>((accum, position) => {
    accum[position.address.toBase58()] = position;
    return accum;
  }, {});

  const { positions: positionsNewState } = await getClmmPositions(poolId);

  positionsNewState.forEach((position, index) => {
    const prevPositon = positonsPrevState[position.address.toBase58()];

    const solDif = position.amountB.sub(prevPositon.amountB);
    console.log(`Position ${index} => `, position.address.toBase58());
    console.log('SOL Added =>', solDif.toString());
    console.log('MESH Removed => ', prevPositon.amountA.sub(position.amountA).toString());
    console.log('Swap Liq share => ', solDif.div(swapSOLAmount).mul(100).toString());
    console.log('\n');
  });

  const userNewBalance = await assetBalance();
  console.log('Change in SOL', (userNewBalance.sol - userPrevBalance.sol) / 1e9);
  console.log(
    'Change in MESH',
    (parseInt(userNewBalance.mesh.toString()) - parseInt(userPrevBalance.mesh.toString())) / 1e9
  );
}

export async function addSwapRemove() {
  const userPrevBalance = await assetBalance();

  const {
    poolInfo: { tickCurrent, tickSpacing },
    positions,
  } = await getClmmPositions(poolId);

  const newPositon = narrowPositionTicks(tickCurrent, tickSpacing);

  const existingMeshAmountPerTick = positions
    .filter(({ status }) => status === 'InRange')
    .reduce<Decimal>((accum, positon) => {
      const perTickMeshAmount = meshAmountPerTick(
        tickCurrent,
        tickSpacing,
        positon.tickUpper,
        positon.amountA
      );
      return accum.add(perTickMeshAmount);
    }, new Decimal(0));

  const inputMeshAmount = getShareAmount(existingMeshAmountPerTick, depthConverage);

  console.log('\n\n ---------- Adding Liquidity ---------- \n');
  console.log('current tick => ', tickCurrent);
  console.log('tickLower => ', newPositon.tickLower);
  console.log('tickUpper => ', newPositon.tickUpper);
  console.log('existingMeshAmountPerTick => ', existingMeshAmountPerTick.toString());
  console.log('inputMeshAmount => ', inputMeshAmount.toString());
  const nftMint = await openPositionExe(
    poolId,
    inputMeshAmount,
    newPositon.tickLower,
    newPositon.tickUpper
  );

  console.log('Mint NFT => ', nftMint);

  console.log('\n\n---------- Swapping ---------- \n');
  await swapExe(poolId, new TokenAmount(WSOL, swapSOLAmount * 1e9), MESH);

  console.log('\n\n---------- Removing Liquidity ---------- \n');
  await removePositionExe(poolId, nftMint);

  console.log('\n\n---------- Analytics ---------- \n');
  const positonsPrevState = positions.reduce<Record<string, PositionData>>((accum, position) => {
    accum[position.address.toBase58()] = position;
    return accum;
  }, {});

  const { positions: positionsNewState } = await getClmmPositions(poolId);

  positionsNewState.forEach((position, index) => {
    const prevPositon = positonsPrevState[position.address.toBase58()];

    const solDif = position.amountB.sub(prevPositon.amountB);
    console.log(`Position ${index} => `, position.address.toBase58());
    console.log('SOL Added =>', solDif.toString());
    console.log('MESH Removed => ', prevPositon.amountA.sub(position.amountA).toString());
    console.log('Swap Liq share => ', solDif.div(swapSOLAmount).mul(100).toString());
    console.log('\n');
  });

  const userNewBalance = await assetBalance();
  console.log('Change in SOL', (userNewBalance.sol - userPrevBalance.sol) / 1e9);
  console.log(
    'Change in MESH',
    (parseInt(userNewBalance.mesh.toString()) - parseInt(userPrevBalance.mesh.toString())) / 1e9
  );
}

function meshAmountPerTick(
  currentTick: number,
  tickSpacing: number,
  tickUpper: number,
  meshAmount: Decimal
) {
  const diff = tickUpper - currentTick;
  const ticks = Math.ceil(Math.abs(diff / tickSpacing));
  return meshAmount.div(ticks);
}

function narrowPositionTicks(currentTick: number, tickSpacing: number) {
  const getValidTick = (tick: number) =>
    tick % tickSpacing === 0 ? tick : tick - (tick % tickSpacing);

  const tickLower = getValidTick(currentTick - tickSpacing);
  const tickUpper = getValidTick(currentTick + tickSpacing);

  return { tickLower, tickUpper };
}

function getShareAmount(amount: Decimal, share: number) {
  return amount.mul(share).div(1 - share);
}

async function assetBalance() {
  const [solBalance, meshBalance] = await Promise.all([
    connection.getBalance(wallet.publicKey),
    getAccount(connection, getAssociatedTokenAddressSync(MESH.mint, wallet.publicKey, true)),
  ]);

  return { sol: solBalance, mesh: meshBalance.amount };
}
