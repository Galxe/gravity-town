// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title Router — single entry point that holds all contract addresses
/// @notice Deploy once, configure everywhere with just one address
contract Router is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public registry;
    address public agentLedger;
    address public locationLedger;
    address public inboxLedger;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _registry,
        address _agentLedger,
        address _locationLedger,
        address _inboxLedger
    ) public initializer {
        __Ownable_init(msg.sender);
        registry = _registry;
        agentLedger = _agentLedger;
        locationLedger = _locationLedger;
        inboxLedger = _inboxLedger;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setRegistry(address _registry) external onlyOwner { registry = _registry; }
    function setAgentLedger(address _agentLedger) external onlyOwner { agentLedger = _agentLedger; }
    function setLocationLedger(address _locationLedger) external onlyOwner { locationLedger = _locationLedger; }
    function setInboxLedger(address _inboxLedger) external onlyOwner { inboxLedger = _inboxLedger; }

    /// @notice Get all addresses in one call
    function getAddresses() external view returns (
        address _registry,
        address _agentLedger,
        address _locationLedger,
        address _inboxLedger
    ) {
        return (registry, agentLedger, locationLedger, inboxLedger);
    }
}
