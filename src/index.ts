import { config } from 'dotenv';
config();

// import { addSwapRemove } from './raydium';
import { getClmmPositions } from './raydium/helpers/getClmmPosition';

async function executeBot() {
  // await addSwapRemove();
  await getClmmPositions('C6Fk5DceKtzNPk9LbE5wS6nodwogp5TvqRaiUUGLDaHB');
}

executeBot();
