const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

async function main() {
  console.log('🚀 Running Flyte Local Post-Deploy Initializer...');
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

  // 1. Read broadcast JSON to find deployed addresses
  const broadcastDir = path.join(__dirname, '../../contracts/broadcast/DeployLocal.s.sol');
  let runFile;
  if (fs.existsSync(path.join(broadcastDir, '31337/run-latest.json'))) {
    runFile = path.join(broadcastDir, '31337/run-latest.json');
  } else if (fs.existsSync(path.join(broadcastDir, '42161/run-latest.json'))) {
    runFile = path.join(broadcastDir, '42161/run-latest.json');
  }

  if (!runFile) {
    throw new Error('Could not find broadcast run-latest.json in ' + broadcastDir);
  }

  const broadcastData = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  let oracleAddress, appAddress, routerAddress;

  for (const tx of broadcastData.transactions) {
    if (tx.transactionType === 'CREATE') {
      if (tx.contractName === 'MockPriceOracle') oracleAddress = tx.contractAddress;
      if (tx.contractName === 'PerpAquaApp') appAddress = tx.contractAddress;
      if (tx.contractName === 'PerpSwapVMRouter') routerAddress = tx.contractAddress;
    }
  }

  console.log('Detected deployed contracts:');
  console.log('  MockPriceOracle: ', oracleAddress);
  console.log('  PerpAquaApp:     ', appAddress);
  console.log('  PerpSwapVMRouter:', routerAddress);

  if (!appAddress || !oracleAddress) {
    throw new Error('Failed to detect deployed contract addresses from broadcast log');
  }

  // 2. Update frontend/src/config/contracts.ts
  const contractsConfigFile = path.join(__dirname, '../src/config/contracts.ts');
  let configContent = fs.readFileSync(contractsConfigFile, 'utf8');

  configContent = configContent.replace(
    /export const DEFAULT_PERP_APP_ADDRESS = process\.env\.NEXT_PUBLIC_PERP_APP_ADDRESS \|\| '0x[a-fA-F0-9]+';/,
    `export const DEFAULT_PERP_APP_ADDRESS = process.env.NEXT_PUBLIC_PERP_APP_ADDRESS || '${appAddress}';`
  );
  configContent = configContent.replace(
    /export const DEFAULT_ORACLE_ADDRESS = process\.env\.NEXT_PUBLIC_ORACLE_ADDRESS \|\| '0x[a-fA-F0-9]+';/,
    `export const DEFAULT_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_ORACLE_ADDRESS || '${oracleAddress}';`
  );
  if (routerAddress) {
    configContent = configContent.replace(
      /export const DEFAULT_ROUTER_ADDRESS = process\.env\.NEXT_PUBLIC_ROUTER_ADDRESS \|\| '0x[a-fA-F0-9]+';/,
      `export const DEFAULT_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_ROUTER_ADDRESS || '${routerAddress}';`
    );
  }
  fs.writeFileSync(contractsConfigFile, configContent);
  console.log('✅ Updated frontend/src/config/contracts.ts with new contract addresses');

  // 3. Addresses & Constants
  const AQUA_REGISTRY = '0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a';
  const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
  const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
  const A_USDC_ADDRESS = '0x724dc807b04555b71ed48a6896b6F41593b8C637';
  const USDC_WHALE = ethers.getAddress('0xC6962004f452bE9203591991D15f6b388e09E8D0');

  const GRIMACE_LP = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  const GRIMACE_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
  const TRADER_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const KEEPER_ADDR = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

  // 4. Impersonate GMX Vault to supply USDC to Aave for LP, Trader, Keeper
  await provider.send('anvil_impersonateAccount', [USDC_WHALE]);
  await provider.send('anvil_setBalance', [USDC_WHALE, '0x21e19e0c9bab2400000']); // 10,000 ETH for gas
  const whaleSigner = await provider.getSigner(USDC_WHALE);

  const usdc = new ethers.Contract(
    USDC_ADDRESS,
    ['function approve(address,uint256) returns (bool)', 'function balanceOf(address) returns (uint256)'],
    whaleSigner
  );
  const aavePool = new ethers.Contract(
    AAVE_POOL,
    ['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)'],
    whaleSigner
  );

  // Supply 100k USDC for Grimace
  const amtLp = ethers.parseUnits('100000', 6);
  await (await usdc.approve(AAVE_POOL, amtLp)).wait();
  await (await aavePool.supply(USDC_ADDRESS, amtLp, GRIMACE_LP, 0)).wait();

  // Supply 50k USDC for Trader Hamburglar
  const amtTrader = ethers.parseUnits('50000', 6);
  await (await usdc.approve(AAVE_POOL, amtTrader)).wait();
  await (await aavePool.supply(USDC_ADDRESS, amtTrader, TRADER_ADDR, 0)).wait();

  // Supply 10k USDC for Keeper
  const amtKeeper = ethers.parseUnits('10000', 6);
  await (await usdc.approve(AAVE_POOL, amtKeeper)).wait();
  await (await aavePool.supply(USDC_ADDRESS, amtKeeper, KEEPER_ADDR, 0)).wait();

  await provider.send('anvil_stopImpersonatingAccount', [USDC_WHALE]);
  console.log('✅ Seeded demo accounts (Grimace: 100k, Hamburglar: 50k, Keeper: 10k) with aUSDC');

  // 5. Grimace approves 1inch Aqua Registry and ships resting quote
  const grimaceSigner = new ethers.Wallet(GRIMACE_KEY, provider);
  let gNonce = await provider.getTransactionCount(GRIMACE_LP, 'pending');

  const aUsdcGrimace = new ethers.Contract(
    A_USDC_ADDRESS,
    ['function approve(address,uint256) returns (bool)'],
    grimaceSigner
  );
  const approveTx = await aUsdcGrimace.approve(AQUA_REGISTRY, ethers.MaxUint256, { nonce: gNonce });
  await approveTx.wait();
  gNonce++;

  const strategy = {
    lp: GRIMACE_LP,
    collateralToken: A_USDC_ADDRESS,
    maxNotional: ethers.parseUnits('50000', 6),
    maxLeverage: 10,
    spreadBps: 10,
    sideMask: 3,
    quoteExpiry: 0,
  };

  const strategyAbi = [
    'tuple(address lp, address collateralToken, uint256 maxNotional, uint256 maxLeverage, uint256 spreadBps, uint8 sideMask, uint256 quoteExpiry)',
  ];
  const strategyBytes = ethers.AbiCoder.defaultAbiCoder().encode(strategyAbi, [strategy]);

  const aqua = new ethers.Contract(
    AQUA_REGISTRY,
    ['function ship(address app, bytes strategy, address[] tokens, uint256[] amounts) returns (bytes32)'],
    grimaceSigner
  );

  try {
    const shipTx = await aqua.ship(
      appAddress,
      strategyBytes,
      [A_USDC_ADDRESS],
      [ethers.parseUnits('50000', 6)],
      { nonce: gNonce }
    );
    await shipTx.wait();
    console.log('✅ Shipped $50,000 resting quote to 1inch Aqua for LP Grimace');
  } catch (shipErr) {
    const data = shipErr.data || (shipErr.info && shipErr.info.error && shipErr.info.error.data) || '';
    if (data.startsWith('0x879f237b')) {
      console.log('ℹ️ LP quote already shipped on 1inch Aqua for this app');
    } else {
      console.warn('Aqua ship notice:', shipErr.message || shipErr);
    }
  }

  // 6. Pre-cache Aave Pool storage slots on Anvil dynamically for appAddress
  const appHex = appAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  for (let s of [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60]) {
    const slotHex = s.toString(16).padStart(64, '0');
    const storageKey = ethers.keccak256('0x' + appHex + slotHex);
    await provider.send('anvil_setStorageAt', [
      AAVE_POOL,
      storageKey,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ]);
  }
  console.log('✅ Pre-cached Aave Pool validation storage slots dynamically on Anvil for ' + appAddress);

  console.log('🎉 Local environment initialization complete! Ready to trade.');
}

main().catch((err) => {
  console.error('Initialization error:', err);
  process.exit(1);
});
