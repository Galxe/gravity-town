// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";

/// @title GTreasury — Arena-only G balance ledger.
/// @notice Testnet faucet and operator-controlled spend/credit hooks for Arena.
contract GTreasury is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    AgentRegistry public registry;

    mapping(uint256 => uint256) public gBalance;

    event GFunded(uint256 indexed agentId, uint256 amount, address by);
    event GSpent(uint256 indexed agentId, uint256 amount, bytes32 reason);
    event GCredited(uint256 indexed agentId, uint256 amount, bytes32 reason);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _registry) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    modifier onlyOperator() {
        require(registry.isOperator(msg.sender), "not operator");
        _;
    }

    function fundAgentG(uint256 agentId, uint256 amount) external onlyOwner {
        gBalance[agentId] += amount;
        emit GFunded(agentId, amount, msg.sender);
    }

    function spendG(uint256 agentId, uint256 amount, bytes32 reason) external onlyOperator {
        require(gBalance[agentId] >= amount, "insufficient G");
        gBalance[agentId] -= amount;
        emit GSpent(agentId, amount, reason);
    }

    function creditG(uint256 agentId, uint256 amount, bytes32 reason) external onlyOperator {
        gBalance[agentId] += amount;
        emit GCredited(agentId, amount, reason);
    }
}
