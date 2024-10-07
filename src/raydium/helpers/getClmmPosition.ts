import BN from 'bn.js';
import Decimal from 'decimal.js';

import {
  Clmm,
  LiquidityMath,
  PoolInfoLayout,
  PositionInfoLayout,
  PositionUtils,
  SPL_ACCOUNT_LAYOUT,
  SqrtPriceMath,
  Tick,
  TickArrayLayout,
  TickUtils,
} from '@raydium-io/raydium-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

import { connection, PROGRAMIDS } from '../config';

export type PositionData = {
  address: PublicKey;
  owner: PublicKey | null;
  liquidity: BN;
  status: ReturnType<typeof checkPositionStatus>;
  tickLower: number;
  tickUpper: number;
  amountA: Decimal;
  amountB: Decimal;
  pendingFeeA: Decimal;
  pendingFeeB: Decimal;
};

export async function getClmmPositions(_poolId: string) {
  const poolId = new PublicKey(_poolId);

  const poolInfoAccount = await connection.getAccountInfo(poolId);
  if (poolInfoAccount === null) throw Error(' pool id error ');

  const poolInfo = PoolInfoLayout.decode(poolInfoAccount.data);

  const gPA = await connection.getProgramAccounts(PROGRAMIDS.CLMM, {
    commitment: 'confirmed',
    filters: [
      { dataSize: PositionInfoLayout.span },
      { memcmp: { bytes: poolId.toBase58(), offset: PositionInfoLayout.offsetOf('poolId') } },
    ],
  });

  let positions: PositionData[] = [];
  let checkSumLiquidity = new BN(0);

  for (const account of gPA) {
    const position = PositionInfoLayout.decode(account.account.data);

    const owner = await findNftOwner(position.nftMint);

    const status = checkPositionStatus(poolInfo, position);
    if (status === 'InRange') checkSumLiquidity = checkSumLiquidity.add(position.liquidity);

    const amounts = LiquidityMath.getAmountsFromLiquidity(
      poolInfo.sqrtPriceX64,
      SqrtPriceMath.getSqrtPriceX64FromTick(position.tickLower),
      SqrtPriceMath.getSqrtPriceX64FromTick(position.tickUpper),
      position.liquidity,
      false
    );

    const amountA = new Decimal(amounts.amountA.toString()).div(10 ** poolInfo.mintDecimalsA);
    const amountB = new Decimal(amounts.amountB.toString()).div(10 ** poolInfo.mintDecimalsB);

    const tickArrayLowerAddress = TickUtils.getTickArrayAddressByTick(
      poolInfoAccount.owner,
      poolId,
      position.tickLower,
      poolInfo.tickSpacing
    );
    const tickArrayUpperAddress = TickUtils.getTickArrayAddressByTick(
      poolInfoAccount.owner,
      poolId,
      position.tickUpper,
      poolInfo.tickSpacing
    );

    const tickLowerState = (await getAndCacheTick(connection, tickArrayLowerAddress)).ticks[
      TickUtils.getTickOffsetInArray(position.tickLower, poolInfo.tickSpacing)
    ];

    const tickUpperState = (await getAndCacheTick(connection, tickArrayUpperAddress)).ticks[
      TickUtils.getTickOffsetInArray(position.tickUpper, poolInfo.tickSpacing)
    ];

    // @ts-ignore
    const { tokenFeeAmountA: _pendingFeeA, tokenFeeAmountB: _pendingFeeB } =
      PositionUtils.GetPositionFees(
        {
          tickCurrent: poolInfo.tickCurrent,
          feeGrowthGlobalX64A: new BN(poolInfo.feeGrowthGlobalX64A),
          feeGrowthGlobalX64B: new BN(poolInfo.feeGrowthGlobalX64B),
        } as any,
        {
          feeGrowthInsideLastX64A: new BN(position.feeGrowthInsideLastX64A),
          feeGrowthInsideLastX64B: new BN(position.feeGrowthInsideLastX64B),
          tokenFeesOwedA: new BN(position.tokenFeesOwedA),
          tokenFeesOwedB: new BN(position.tokenFeesOwedB),
          liquidity: new BN(position.liquidity),
        } as any,
        tickLowerState,
        tickUpperState
      );

    const pendingFeeA = new Decimal(_pendingFeeA.toString()).div(10 ** poolInfo.mintDecimalsA);
    const pendingFeeB = new Decimal(_pendingFeeB.toString()).div(10 ** poolInfo.mintDecimalsB);

    positions.push({
      address: account.pubkey,
      owner,
      liquidity: position.liquidity,
      status,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      amountA,
      amountB,
      pendingFeeA,
      pendingFeeB,
    });

    console.log(
      '\n\tmint:',
      position.nftMint.toBase58(),
      '\n\taddress:',
      account.pubkey.toBase58(),
      '\n\towner:',
      owner?.toBase58() ?? 'NOTFOUND',
      '\n\tliquidity:',
      position.liquidity.toString(),
      '\n\tstatus:',
      status,
      '\n\tamountA:',
      amountA.toString(),
      '\n\tamountB:',
      amountB.toString(),
      '\n\tpendingFeeA:',
      pendingFeeA.toString(),
      '\n\tpendingFeeB:',
      pendingFeeB.toString(),
      '\n\ttickLower:',
      position.tickLower.toString(),
      '\n\ttickUpper:',
      position.tickUpper.toString()
    );
  }
  return { poolInfo, positions, checkSumLiquidity };
}

function checkPositionStatus(
  poolInfo: { tickCurrent: number },
  position: { tickLower: number; tickUpper: number }
) {
  if (position.tickUpper <= poolInfo.tickCurrent) return 'OutOfRange(PriceIsAboveRange)';
  if (position.tickLower > poolInfo.tickCurrent) return 'OutOfRange(PriceIsBelowRange)';
  return 'InRange';
}

async function findNftOwner(mint: PublicKey): Promise<PublicKey | null> {
  const res = await connection.getTokenLargestAccounts(mint);
  if (!res.value) return null;
  if (res.value.length === 0) return null;
  if (res.value[0].uiAmount !== 1) return null;

  const account = await connection.getAccountInfo(res.value[0].address);
  const info = SPL_ACCOUNT_LAYOUT.decode(account?.data!);

  return info.owner;
}

const _tempCache: { [address: string]: { ticks: { [key: number]: Tick } } } = {};
async function getAndCacheTick(connection: Connection, address: PublicKey) {
  if (_tempCache[address.toString()] !== undefined) return _tempCache[address.toString()];
  const account = await connection.getAccountInfo(address);

  if (account === null) throw Error(' get tick error ');

  const _d = TickArrayLayout.decode(account.data);

  _tempCache[address.toString()] = _d;

  return _d;
}
