import BN from 'bn.js';
import Decimal from 'decimal.js';

import { Clmm, ClmmConfigInfo, Token, TOKEN_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

import { connection, makeTxVersion, PROGRAMIDS, wallet } from '../config';
import { formatClmmConfigs } from '../helpers/formatClmmConfigs';
import { buildAndSendTx } from '../utils';

type TestTxInputInfo = {
  baseToken: Token;
  quoteToken: Token;
  clmmConfigId: string;
  wallet: Keypair;
  startPoolPrice: Decimal;
  startTime: BN;
};

async function clmmCreatePool(input: TestTxInputInfo) {
  // -------- pre-action: fetch basic ammConfig info --------
  const _ammConfig = (await formatClmmConfigs(PROGRAMIDS.CLMM.toString()))[input.clmmConfigId];
  const ammConfig: ClmmConfigInfo = { ..._ammConfig, id: new PublicKey(_ammConfig.id) };

  // -------- step 1: make create pool instructions --------
  const makeCreatePoolInstruction = await Clmm.makeCreatePoolInstructionSimple({
    connection,
    programId: PROGRAMIDS.CLMM,
    owner: input.wallet.publicKey,
    mint1: input.baseToken,
    mint2: input.quoteToken,
    ammConfig,
    initialPrice: input.startPoolPrice,
    startTime: input.startTime,
    makeTxVersion,
    payer: wallet.publicKey,
  });

  return await buildAndSendTx(makeCreatePoolInstruction.innerTransactions);
}

export async function createPool() {
  const baseToken = new Token(
    TOKEN_PROGRAM_ID,
    new PublicKey('MESHAaVKRyidejVgKyXa3v347Vb7q7gshHhEATJQQ3o'),
    9
  );

  const quoteToken = new Token(
    TOKEN_PROGRAM_ID,
    new PublicKey('So11111111111111111111111111111111111111112'), //WSOL
    9
  );

  console.log(
    new BN(baseToken.mint.toBuffer()).gt(new BN(quoteToken.mint.toBuffer()))
      ? 'quote base'
      : 'base quote'
  );

  const clmmConfigId = 'GjLEiquek1Nc2YjcBhufUGFRkaqW1JhaGjsdFd8mys38'; //1%
  const startPoolPrice = new Decimal(0.0006652010497466228503);
  const startTime = new BN(0);

  const txids = await clmmCreatePool({
    baseToken,
    quoteToken,
    clmmConfigId,
    wallet: wallet,
    startPoolPrice,
    startTime,
  });

  console.log('txids', txids);
}
