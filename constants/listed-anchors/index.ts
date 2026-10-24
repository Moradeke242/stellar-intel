/**
 * Listed operators: issuer-only and crypto-only operators that are tracked and
 * shown in the anchor directory. They are NEVER read by the rate engine, router,
 * intent or MCP code.
 *
 * There is one `<id>.json` per operator in this directory, and the id equals the
 * file name. Import them below in alphabetical order.
 */
import type { ListedAnchor } from '@/types';
import { parseListedAnchors } from '@/lib/stellar/listed-anchor-schema';

import afreum from './afreum.json';
import apsTokens from './aps-tokens.json';
import aquarius from './aquarius.json';
import audd from './audd.json';
import bitbond from './bitbond.json';
import blackRidgeTrust from './black-ridge-trust.json';
import circleUsdc from './circle-usdc.json';
import cru from './cru.json';
import digitra from './digitra.json';
import etherfuse from './etherfuse.json';
import fchain from './fchain.json';
import fxdao from './fxdao.json';
import gloDollar from './glo-dollar.json';
import gmoTrust from './gmo-trust.json';
import gratz from './gratz.json';
import ixinium from './ixinium.json';
import luxPayband from './lux-payband.json';
import mauAccounts from './mau-accounts.json';
import meshMzar from './mesh-mzar.json';
import mirrasets from './mirrasets.json';
import mobius from './mobius.json';
import moneygramMgusd from './moneygram-mgusd.json';
import nafuloo from './nafuloo.json';
import naobtc from './naobtc.json';
import phoenix from './phoenix.json';
import rawJuiceGuru from './raw-juice-guru.json';
import reyts from './reyts.json';
import sl8 from './sl8.json';
import stronghold from './stronghold.json';
import transparentNetwork from './transparent-network.json';
import ultraCapital from './ultra-capital.json';
import valtorum from './valtorum.json';
import vnx from './vnx.json';
import wisdomtree from './wisdomtree.json';
import ximcoin from './ximcoin.json';

const RAW: unknown[] = [
  afreum,
  apsTokens,
  aquarius,
  audd,
  bitbond,
  blackRidgeTrust,
  circleUsdc,
  cru,
  digitra,
  etherfuse,
  fchain,
  fxdao,
  gloDollar,
  gmoTrust,
  gratz,
  ixinium,
  luxPayband,
  mauAccounts,
  meshMzar,
  mirrasets,
  mobius,
  moneygramMgusd,
  nafuloo,
  naobtc,
  phoenix,
  rawJuiceGuru,
  reyts,
  sl8,
  stronghold,
  transparentNetwork,
  ultraCapital,
  valtorum,
  vnx,
  wisdomtree,
  ximcoin,
];

export const LISTED_ANCHORS: readonly ListedAnchor[] = parseListedAnchors(RAW);
