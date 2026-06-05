// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";

/// @title GTreasury — Arena G balance ledger with full-backing withdraw.
/// @notice Two operating modes, owner-toggled and mutually exclusive:
///         - FAUCET mode (testnet): `fundAgentG` mints free G; `withdraw` is OFF.
///           G is a pure in-game point — not backed, not withdrawable.
///         - WITHDRAW mode (mainnet): `fundAgentG` is OFF; agents can `withdraw`
///           their G back to native value. Every gBalance unit is backed 1:1 by
///           native G held in this contract. Invariant: balance ≥ totalOutstandingG.
///         The two modes can never be on together — an unbacked faucet mint would
///         let someone withdraw value that was never deposited.
contract GTreasury is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    AgentRegistry public registry;

    mapping(uint256 => uint256) public gBalance;

    // ── Full-backing accounting (appended for UUPS storage-layout safety) ──────
    /// @notice Σ of all gBalance — the total native G owed to agents. Native
    ///         balance above this is protocol surplus (buy/roll rake + stray sends).
    uint256 public totalOutstandingG;
    /// @notice Testnet free-mint faucet. Mutually exclusive with withdrawEnabled.
    bool public faucetEnabled;
    /// @notice Mainnet withdraw path. Mutually exclusive with faucetEnabled.
    bool public withdrawEnabled;
    /// @dev Minimal reentrancy mutex (appended last — layout-safe across upgrades).
    ///      0 (default) and 1 mean "not entered"; 2 means "entered". No init needed.
    uint256 private _reentrancyStatus;

    modifier nonReentrant() {
        require(_reentrancyStatus != 2, "reentrant");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    event GFunded(uint256 indexed agentId, uint256 amount, address by);
    event GSpent(uint256 indexed agentId, uint256 amount, bytes32 reason);
    event GCredited(uint256 indexed agentId, uint256 amount, bytes32 reason);
    event GWithdrawn(uint256 indexed agentId, uint256 amount, address to);
    event SurplusWithdrawn(address indexed to, uint256 amount);
    event FaucetEnabledSet(bool enabled);
    event WithdrawEnabledSet(bool enabled);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _registry) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
        // Fresh deploys start in faucet mode (testnet default). The mainnet deploy
        // script flips to withdraw mode via setWithdrawEnabled(true), which first
        // requires setFaucetEnabled(false).
        // NOTE: when UPGRADING an already-initialized proxy, initialize does NOT
        // re-run — the owner must call setFaucetEnabled(true) once post-upgrade to
        // restore the testnet faucet.
        faucetEnabled = true;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    modifier onlyOperator() {
        require(registry.isOperator(msg.sender), "not operator");
        _;
    }

    // ──────────────────── Mode switches (mutually exclusive) ────────────────────

    /// @notice Toggle the testnet faucet. Cannot enable while withdraw is on.
    function setFaucetEnabled(bool v) external onlyOwner {
        if (v) require(!withdrawEnabled, "withdraw on");
        faucetEnabled = v;
        emit FaucetEnabledSet(v);
    }

    /// @notice Toggle the mainnet withdraw path. Cannot enable while faucet is on
    ///         (an unbacked faucet mint would break the backing invariant).
    function setWithdrawEnabled(bool v) external onlyOwner {
        if (v) require(!faucetEnabled, "faucet on");
        withdrawEnabled = v;
        emit WithdrawEnabledSet(v);
    }

    // ──────────────────── Credit paths ────────────────────

    /// @notice Free mint — testnet only. Inflates totalOutstandingG without real
    ///         backing, hence gated behind faucetEnabled (off in withdraw mode).
    function fundAgentG(uint256 agentId, uint256 amount) external onlyOwner {
        require(faucetEnabled, "faucet disabled");
        gBalance[agentId] += amount;
        totalOutstandingG += amount;
        emit GFunded(agentId, amount, msg.sender);
    }

    /// @notice Deposit native G into an agent's balance. Always backed 1:1.
    function depositG(uint256 agentId) external payable {
        require(msg.sender == registry.agentOwner(agentId), "not agent owner");
        require(msg.value > 0, "zero deposit");
        gBalance[agentId] += msg.value;
        totalOutstandingG += msg.value;
        emit GCredited(agentId, msg.value, bytes32("deposit"));
    }

    /// @notice Spend G (buy/roll/market_buy). The native value stays in the contract
    ///         but is no longer owed → becomes protocol surplus.
    /// @dev On a FRESH deploy totalOutstandingG == Σ gBalance, so amount ≤ gBalance ≤
    ///      totalOutstandingG and the subtraction is exact. On an IN-PLACE UPGRADE of
    ///      a pre-existing proxy, totalOutstandingG reads its 0 default while agents
    ///      still hold gBalance — so we floor at 0 instead of underflow-reverting,
    ///      which would otherwise brick every spend post-upgrade. (Withdraw mode is a
    ///      fresh deploy, so this floor is never reached when funds can actually exit.)
    function spendG(uint256 agentId, uint256 amount, bytes32 reason) external onlyOperator {
        require(gBalance[agentId] >= amount, "insufficient G");
        gBalance[agentId] -= amount;
        totalOutstandingG = totalOutstandingG >= amount ? totalOutstandingG - amount : 0;
        emit GSpent(agentId, amount, reason);
    }

    /// @notice Credit G (market_sale). Conserved against an equal market_buy spend,
    ///         so totalOutstandingG nets out across a trade.
    function creditG(uint256 agentId, uint256 amount, bytes32 reason) external onlyOperator {
        gBalance[agentId] += amount;
        totalOutstandingG += amount;
        emit GCredited(agentId, amount, reason);
    }

    // ──────────────────── Withdraw paths ────────────────────

    /// @notice Withdraw your own backed G to your own wallet. Mainnet only.
    ///         Permission is symmetric with depositG: only the agent owner, only to self.
    function withdraw(uint256 agentId, uint256 amount) external nonReentrant {
        require(withdrawEnabled, "withdraw disabled");
        require(msg.sender == registry.agentOwner(agentId), "not agent owner");
        require(amount > 0, "zero");
        require(gBalance[agentId] >= amount, "insufficient G");
        gBalance[agentId] -= amount;     // effects
        totalOutstandingG -= amount;
        (bool ok, ) = msg.sender.call{value: amount}(""); // interaction
        require(ok, "transfer failed");
        emit GWithdrawn(agentId, amount, msg.sender);
    }

    /// @notice Owner pulls protocol surplus (buy/roll rake + stray sends). Doubles
    ///         as the emergency rescue. Can NEVER touch user backing — the surplus
    ///         floor makes a dip below totalOutstandingG impossible.
    function withdrawSurplus(address to, uint256 amount) external onlyOwner nonReentrant {
        // Withdraw-mode only: in faucet mode totalOutstandingG is unbacked/unreliable
        // (faucet mints + a stale upgrade slot), so its surplus math must not gate a
        // native payout. No native ever leaves the contract in faucet mode.
        require(withdrawEnabled, "withdraw disabled");
        require(to != address(0), "zero addr");
        uint256 bal = address(this).balance;
        uint256 surplus = bal > totalOutstandingG ? bal - totalOutstandingG : 0;
        require(amount <= surplus, "exceeds surplus");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit SurplusWithdrawn(to, amount);
    }

    /// @notice Current protocol surplus = native balance above what's owed to agents.
    function surplusG() external view returns (uint256) {
        uint256 bal = address(this).balance;
        return bal > totalOutstandingG ? bal - totalOutstandingG : 0;
    }
}
