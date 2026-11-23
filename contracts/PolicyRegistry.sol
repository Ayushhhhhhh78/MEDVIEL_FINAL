// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PolicyRegistry
 * @dev Manages insurer-registered insurance policies and their cryptographic commitments.
 * The policy commitment Poseidon(policyId, policyLimit, policyExpiryDate, coverageRoot)
 * binds policy terms without exposing them on-chain.
 */
contract PolicyRegistry is Ownable {
    struct Policy {
        uint256 policyId;
        address insurerAddress;
        uint256 policyCommitment;  // Cryptographic binding to policy terms
        uint256 coverageRoot;      // Merkle root of covered procedure codes
        bool isActive;
        uint256 registeredAt;
    }

    // Mapping from policyCommitment => Policy
    mapping(uint256 => Policy) public policiesByCommitment;

    // Mapping from policyId => policyCommitment
    mapping(uint256 => uint256) public policyIdToCommitment;

    // Mapping to check authorized insurers
    mapping(address => bool) public authorizedInsurers;

    // All registered policy commitments
    uint256[] public policyCommitments;

    // Events
    event InsurerAuthorized(address indexed insurer, bool status);
    event PolicyRegistered(
        uint256 indexed policyId,
        address indexed insurer,
        uint256 indexed policyCommitment,
        uint256 coverageRoot
    );
    event PolicyStatusUpdated(uint256 indexed policyCommitment, bool isActive);

    modifier onlyAuthorizedInsurer() {
        require(authorizedInsurers[msg.sender] || msg.sender == owner(), "Caller not authorized insurer");
        _;
    }

    constructor() Ownable(msg.sender) {
        // Owner is authorized by default
        authorizedInsurers[msg.sender] = true;
    }

    /**
     * @dev Grant or revoke insurer authorization
     */
    function setInsurerAuthorization(address _insurer, bool _status) external onlyOwner {
        require(_insurer != address(0), "Invalid insurer address");
        authorizedInsurers[_insurer] = _status;
        emit InsurerAuthorized(_insurer, _status);
    }

    /**
     * @dev Register a new policy with its cryptographic commitment
     */
    function registerPolicy(
        uint256 _policyId,
        uint256 _policyCommitment,
        uint256 _coverageRoot
    ) external onlyAuthorizedInsurer {
        require(_policyId > 0, "Invalid policy ID");
        require(_policyCommitment != 0, "Invalid policy commitment");
        require(_coverageRoot != 0, "Invalid coverage root");
        require(policiesByCommitment[_policyCommitment].policyCommitment == 0, "Policy commitment already registered");
        require(policyIdToCommitment[_policyId] == 0, "Policy ID already registered");

        policiesByCommitment[_policyCommitment] = Policy({
            policyId: _policyId,
            insurerAddress: msg.sender,
            policyCommitment: _policyCommitment,
            coverageRoot: _coverageRoot,
            isActive: true,
            registeredAt: block.timestamp
        });

        policyIdToCommitment[_policyId] = _policyCommitment;
        policyCommitments.push(_policyCommitment);

        emit PolicyRegistered(_policyId, msg.sender, _policyCommitment, _coverageRoot);
    }

    /**
     * @dev Activate or deactivate a policy
     */
    function setPolicyStatus(uint256 _policyCommitment, bool _isActive) external {
        Policy storage policy = policiesByCommitment[_policyCommitment];
        require(policy.policyCommitment != 0, "Policy does not exist");
        require(
            msg.sender == policy.insurerAddress || msg.sender == owner(),
            "Unauthorized to update policy status"
        );
        policy.isActive = _isActive;
        emit PolicyStatusUpdated(_policyCommitment, _isActive);
    }

    /**
     * @dev Check if a policy commitment is valid and active
     */
    function isPolicyActive(uint256 _policyCommitment) external view returns (bool) {
        return policiesByCommitment[_policyCommitment].isActive;
    }

    /**
     * @dev Get total count of registered policies
     */
    function getPolicyCount() external view returns (uint256) {
        return policyCommitments.length;
    }
}
