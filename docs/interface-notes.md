# Phase 0: Interface Audit & Technical Specification Notes

**Project:** Flyte — JIT-Sourced RFQ Perp DEX on 1inch Aqua & SwapVM  
**Status:** Phase 0 Complete — Audited against official `1inch/aqua` & `1inch/swap-vm` repositories  
**Target Deployment:** Arbitrum One (deterministic addresses verified on-chain)

---

## 1. Verified Aqua Architecture (`1inch/aqua`)

### 1.1 Core Role of Aqua
Aqua is a singleton balance/allowance ledger (`IAqua`). It does not custody funds, manage pools, or track positions. It maintains virtual balances backed by ERC20 approvals and maker wallet balances.

### 1.2 Core Signatures (`IAqua.sol`)
```solidity
interface IAqua {
    function ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external returns (bytes32 strategyHash);

    function pull(
        address maker,
        bytes32 strategyHash,
        address token,
        uint256 amount,
        address to
    ) external;

    function push(
        address maker,
        address app,
        bytes32 strategyHash,
        address token,
        uint256 amount
    ) external;

    function dock(
        address app,
        bytes32 strategyHash,
        address[] calldata tokens
    ) external;

    function rawBalances(
        address maker,
        address app,
        bytes32 strategyHash,
        address token
    ) external view returns (uint248 balance, uint8 tokensCount);

    function safeBalances(
        address maker,
        address app,
        bytes32 strategyHash,
        address token0,
        address token1
    ) external view returns (uint256 balance0, uint256 balance1);
}
```

### 1.3 Key Architectural Confirmations
1. **Strategy Calldata & Hashing**:
   - `strategyHash = keccak256(strategy)`.
   - `ship()` accepts `bytes calldata strategy` (full ABI-encoded data) and emits `event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)`.
   - **Resolution of Section 14.3 / Phase 9 Open Question**: The full strategy payload **is on-chain in calldata and event logs**. It is decodable by The Graph subgraph for any application with a published strategy schema.
2. **Caller Constraints in `pull()`**:
   ```solidity
   Balance storage balance = _balances[maker][msg.sender][strategyHash][token];
   ```
   `msg.sender` **must** match the `app` address specified during `ship()`. Therefore, `PerpAquaApp` itself must call `AQUA.pull(...)`.
3. **Revert vs. Return-False Behavior**:
   - `pull()` returns `void`. It **never returns false**; it reverts on any failure.
   - If `amount > prevBalance`, `pull()` reverts with arithmetic underflow panic (`0x11`).
   - If the maker's wallet has insufficient ERC20 balance or allowance, the underlying `IERC20(token).safeTransferFrom(maker, to, amount)` reverts.
4. **Ship Validation Hooks**:
   - Aqua does **not** call back into `AquaApp` on `ship()`.
   - Applications validate strategy parameters when a trader interacts (e.g., at `openPosition` time).
5. **`AquaApp.sol` Base Contract**:
   - Provides immutable `AQUA` contract reference.
   - Provides `nonReentrantStrategy(maker, strategyHash)` modifier using transient storage (`TransientLock` / EIP-1153 `tstore`/`tload`).
   - Does not enforce any virtual functions that must be overridden.

---

## 2. Verified SwapVM Architecture (`1inch/swap-vm`)

### 2.1 Execution Model
SwapVM executes instructions sequentially through an instruction loop (`ctx.runLoop()`) over a register context:
```solidity
struct SwapRegisters {
    uint256 balanceIn;
    uint256 balanceOut;
    uint256 amountIn;
    uint256 amountOut;
}

struct SwapQuery {
    bytes32 orderHash;
    address maker;
    address taker;
    address tokenIn;
    address tokenOut;
    bool isExactIn;
}

struct VM {
    bool isStaticContext;
    uint256 nextPC;
    CalldataPtr programPtr;
    CalldataPtr takerArgsPtr;
    function(Context memory, uint256, bytes calldata) internal dispatch;
}

struct Context {
    VM vm;
    SwapQuery query;
    SwapRegisters swap;
    ProtocolFee fee;
}
```

### 2.2 Custom Opcode Extension Mechanism
1. **Opcode Space**:
   SwapVM defines opcodes in `enum Opcode`. Custom instructions allocate from unassigned slots:
   - `0x74` -> `OP_MARGIN_CALC`
   - `0x75` -> `OP_FUNDING_CALC`
2. **Instruction Structure**:
   Each instruction is a library adhering to standard conventions:
   - `sizeOf(...) internal pure returns (uint256)`
   - `build(...) internal pure returns (bytes memory)`
   - `parse(bytes calldata args) internal pure returns (...)`
   - `exec(Context memory ctx, bytes calldata args) internal pure`
3. **Dispatcher & Router**:
   - `PerpOpcodes is AquaOpcodes`: Dispatches `0x74` and `0x75` to instruction libraries; falls back to `super._runOpcode`.
   - `PerpSwapVMRouter is Simulator, SwapVM, PerpOpcodes`: Overrides `_dispatch` to invoke `_runOpcode`.
4. **Redeployment Requirement**:
   - Adding custom opcodes requires deploying a custom SwapVM router (`PerpSwapVMRouter`).
   - This is explicitly permitted and encouraged by the hackathon brief: *"Official Aqua/SwapVM contracts must be used (redeployments of a modified SwapVM contract is allowed). Projects that utilize SwapVM will be scored higher during the final judging."*

---

## 3. Math & Lifecycle Specifications

### 3.1 `OP_MARGIN_CALC` (Opcode `0x74`)
- **Inputs**: `notional` (uint64), `leverage` (uint16), `spreadBps` (uint16).
- **Outputs**:
  - `swap.amountIn`: Trader deposit requirement = `notional / leverage + spreadFee`.
  - `swap.amountOut`: Counter-margin required from LP (pulled via Aqua) = `notional / leverage`.
- **Fill Price**: Computed off oracle index price +/- spread.

### 3.2 `OP_FUNDING_CALC` (Opcode `0x75`) — Open-Interest Skew Model
- In accordance with PRD Section 3, funding is driven by **aggregate Open-Interest (OI) imbalance**, matching Synthetix Perps' oracle-fill model:
  - `imbalance = totalLongOI - totalShortOI`
  - `totalOI = totalLongOI + totalShortOI`
  - `skewRatio = |imbalance| / totalOI`
  - `fundingRate = skewRatio * maxFundingRateBps` (time-weighted by `elapsedSeconds / FUNDING_INTERVAL`).
- **Direction**:
  - If `totalLongOI > totalShortOI`: Longs pay Shorts. For a Long position, trader owes funding (deducted from held margin). For a Short position, LP owes funding (pulled via Aqua).
  - If `totalShortOI > totalLongOI`: Shorts pay Longs. For a Long position, LP owes funding (pulled via Aqua). For a Short position, trader owes funding (deducted from held margin).
- **Funding Default Handling**:
  - When LP owes funding, `AQUA.pull(lp, strategyHash, aUsdc, fundingAmount, address(this))` is called via a low-level call.
  - If the pull reverts (e.g. LP removed token balance or allowance), the transaction catches the revert, flags `fundingDefaulted = true` on the position, and emits `FundingSettled(..., defaulted=true)`. The position becomes immediately liquidatable without reverting the keeper call.

---

## 4. Verified Arbitrum One Production Addresses

All addresses below have been independently verified on-chain via `cast code`:

| Contract | Address | Verification Status |
|---|---|---|
| **Aqua Registry** | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` | Verified on Arbitrum One |
| **SwapVM Router** | `0x111111338c5091E8440B67B168bAe16a668Ac0DE` | Verified on Arbitrum One |
| **Aave v3 Pool** | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | Verified on Arbitrum One |
| **USDC** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Verified on Arbitrum One |
| **aUSDC** | `0x724dc807b04555b71ed48a6896b6F41593b8C637` | Verified on Arbitrum One |
| **WETH** | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | Verified on Arbitrum One |