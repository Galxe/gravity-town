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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _registry,
        address _agentLedger,
        address _locationLedger,
        address _inboxLedger,
        address _gameEngine
    ) public initializer {
        __Ownable_init(msg.sender);
        registry = _registry;
        agentLedger = _agentLedger;
        locationLedger = _locationLedger;
        inboxLedger = _inboxLedger;
        gameEngine = _gameEngine;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setRegistry(address _v) external onlyOwner { registry = _v; }
    function setAgentLedger(address _v) external onlyOwner { agentLedger = _v; }
    function setLocationLedger(address _v) external onlyOwner { locationLedger = _v; }
    function setInboxLedger(address _v) external onlyOwner { inboxLedger = _v; }
    function setGameEngine(address _v) external onlyOwner { gameEngine = _v; }

    function getAddresses() external view returns (
        address _registry,
        address _agentLedger,
        address _locationLedger,
        address _inboxLedger,
        address _gameEngine
    ) {
        return (registry, agentLedger, locationLedger, inboxLedger, gameEngine);
    }
}
