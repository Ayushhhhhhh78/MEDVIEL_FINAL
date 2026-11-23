// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HospitalRegistry
 * @dev Manages registered hospitals, their BabyJubJub EdDSA public keys,
 * EVM addresses, authorized settlement payout destinations, and the hospital Merkle root.
 */
contract HospitalRegistry is Ownable {
    struct Hospital {
        uint256 hospitalId;
        string name;
        string licenseNumber;
        uint256 pubKeyAx;       // BabyJubJub public key X coordinate
        uint256 pubKeyAy;       // BabyJubJub public key Y coordinate
        address evmAddress;     // Hospital operational EVM wallet
        address payoutAddress;  // Verified destination for claim settlement payouts
        bool isActive;
        uint256 registeredAt;
    }

    // Merkle root of approved hospitals (computed by Poseidon hash over leaves)
    uint256 public hospitalMerkleRoot;

    // hospitalId => Hospital
    mapping(uint256 => Hospital) public hospitals;

    // Key lookup: hash(Ax, Ay) => hospitalId
    mapping(bytes32 => uint256) public keyToHospitalId;

    // List of registered hospital IDs
    uint256[] public hospitalIds;

    // Events
    event HospitalRegistered(
        uint256 indexed hospitalId,
        string name,
        uint256 pubKeyAx,
        uint256 pubKeyAy,
        address evmAddress,
        address payoutAddress
    );
    event HospitalStatusUpdated(uint256 indexed hospitalId, bool isActive);
    event HospitalPayoutAddressUpdated(uint256 indexed hospitalId, address oldPayout, address newPayout);
    event HospitalMerkleRootUpdated(uint256 oldRoot, uint256 newRoot);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Register a new approved healthcare provider
     */
    function registerHospital(
        uint256 _hospitalId,
        string calldata _name,
        string calldata _licenseNumber,
        uint256 _pubKeyAx,
        uint256 _pubKeyAy,
        address _evmAddress,
        address _payoutAddress
    ) external onlyOwner {
        require(_hospitalId > 0, "Invalid hospital ID");
        require(bytes(_name).length > 0, "Hospital name required");
        require(_pubKeyAx != 0 && _pubKeyAy != 0, "Invalid BabyJubJub public key");
        require(_evmAddress != address(0), "Invalid EVM address");
        require(_payoutAddress != address(0), "Invalid payout address");
        require(hospitals[_hospitalId].hospitalId == 0, "Hospital already registered");

        bytes32 keyHash = keccak256(abi.encodePacked(_pubKeyAx, _pubKeyAy));
        require(keyToHospitalId[keyHash] == 0, "Public key already registered");

        hospitals[_hospitalId] = Hospital({
            hospitalId: _hospitalId,
            name: _name,
            licenseNumber: _licenseNumber,
            pubKeyAx: _pubKeyAx,
            pubKeyAy: _pubKeyAy,
            evmAddress: _evmAddress,
            payoutAddress: _payoutAddress,
            isActive: true,
            registeredAt: block.timestamp
        });

        keyToHospitalId[keyHash] = _hospitalId;
        hospitalIds.push(_hospitalId);

        emit HospitalRegistered(_hospitalId, _name, _pubKeyAx, _pubKeyAy, _evmAddress, _payoutAddress);
    }

    /**
     * @dev Update hospital active status
     */
    function setHospitalStatus(uint256 _hospitalId, bool _isActive) external onlyOwner {
        require(hospitals[_hospitalId].hospitalId != 0, "Hospital not found");
        hospitals[_hospitalId].isActive = _isActive;
        emit HospitalStatusUpdated(_hospitalId, _isActive);
    }

    /**
     * @dev Update payout address for a hospital
     */
    function setHospitalPayoutAddress(uint256 _hospitalId, address _newPayout) external onlyOwner {
        require(hospitals[_hospitalId].hospitalId != 0, "Hospital not found");
        require(_newPayout != address(0), "Invalid payout address");
        address oldPayout = hospitals[_hospitalId].payoutAddress;
        hospitals[_hospitalId].payoutAddress = _newPayout;
        emit HospitalPayoutAddressUpdated(_hospitalId, oldPayout, _newPayout);
    }

    /**
     * @dev Set the current hospital Merkle root (calculated off-chain via Poseidon)
     */
    function updateHospitalMerkleRoot(uint256 _newRoot) external onlyOwner {
        require(_newRoot != 0, "Root cannot be zero");
        uint256 oldRoot = hospitalMerkleRoot;
        hospitalMerkleRoot = _newRoot;
        emit HospitalMerkleRootUpdated(oldRoot, _newRoot);
    }

    /**
     * @dev Check if hospital with public key is active and return payout address
     */
    function verifyHospitalAndGetPayout(uint256 _pubKeyAx, uint256 _pubKeyAy)
        external
        view
        returns (bool isActive, address payoutAddress, uint256 hospitalId)
    {
        bytes32 keyHash = keccak256(abi.encodePacked(_pubKeyAx, _pubKeyAy));
        uint256 hId = keyToHospitalId[keyHash];
        if (hId == 0) {
            return (false, address(0), 0);
        }
        Hospital memory h = hospitals[hId];
        return (h.isActive, h.payoutAddress, h.hospitalId);
    }

    /**
     * @dev Get total count of registered hospitals
     */
    function getHospitalCount() external view returns (uint256) {
        return hospitalIds.length;
    }
}
