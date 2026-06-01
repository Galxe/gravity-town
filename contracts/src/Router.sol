// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title Router — single entry point that holds all contract addresses
contract Router is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public registry;
    address public agentLedger;
    address public locationLedger;
    address public inboxLedger;
    address public gameEngine;
    address public evaluationLedger;
    /// @dev Added in v2 — Arena side-system. Storage-appended so existing proxies
    ///      keep their previous slots intact across upgrade.
    address public arenaEngine;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _registry,
        address _agentLedger,
        address _locationLedger,
        address _inboxLedger,
        address _gameEngine,
        address _evaluationLedger
    ) public initializer {
        __Ownable_init(msg.sender);
        registry = _registry;
        agentLedger = _agentLedger;
        locationLedger = _locationLedger;
        inboxLedger = _inboxLedger;
        gameEngine = _gameEngine;
        evaluationLedger = _evaluationLedger;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setRegistry(address _v) external onlyOwner { registry = _v; }
    function setAgentLedger(address _v) external onlyOwner { agentLedger = _v; }
    function setLocationLedger(address _v) external onlyOwner { locationLedger = _v; }
    function setInboxLedger(address _v) external onlyOwner { inboxLedger = _v; }
    function setGameEngine(address _v) external onlyOwner { gameEngine = _v; }
    function setEvaluationLedger(address _v) external onlyOwner { evaluationLedger = _v; }
    function setArenaEngine(address _v) external onlyOwner { arenaEngine = _v; }

    /// @notice Original 6-tuple getter. Kept intact for chain.ts and Upgrade.s.sol
    ///         compatibility — they decode the return ABI by length. Do NOT extend
    ///         this signature; new addresses go through `getAddressesV2`.
    function getAddresses() external view returns (
        address _registry,
        address _agentLedger,
        address _locationLedger,
        address _inboxLedger,
        address _gameEngine,
        address _evaluationLedger
    ) {
        return (registry, agentLedger, locationLedger, inboxLedger, gameEngine, evaluationLedger);
    }

    /// @notice Extended getter including ArenaEngine. Front-end and side-system
    ///         clients should prefer this once they've upgraded their decoder.
    /// TODO PR #2: migrate chain.ts to call router.arenaEngine() directly and
    ///             deprecate this v2 suffix once nothing else reads the tuple.
    function getAddressesV2() external view returns (
        address _registry,
        address _agentLedger,
        address _locationLedger,
        address _inboxLedger,
        address _gameEngine,
        address _evaluationLedger,
        address _arenaEngine
    ) {
        return (registry, agentLedger, locationLedger, inboxLedger, gameEngine, evaluationLedger, arenaEngine);
    }
}
