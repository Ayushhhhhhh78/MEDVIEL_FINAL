// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PatientAccess
 * @dev Patient-controlled medical record permissions and access control.
 * Patients register encrypted records (IPFS CID, encryption metadata) and grant/revoke
 * decryption access to designated doctors with optional expiration timestamps.
 */
contract PatientAccess {
    struct MedicalRecord {
        uint256 recordId;
        address patientAddress;
        string ipfsCid;              // Encrypted content location
        string fileHash;             // SHA-256 integrity hash of encrypted file
        string recordType;           // E.g., LAB_REPORT, SURGICAL_SUMMARY, DISCHARGE_NOTE
        uint256 encryptedAt;
    }

    struct AccessPermission {
        bool isGranted;
        uint256 grantedAt;
        uint256 expiresAt;           // 0 means no expiration
    }

    // recordId => MedicalRecord
    mapping(uint256 => MedicalRecord) public records;

    // patient => recordIds
    mapping(address => uint256[]) public patientRecordIds;

    // recordId => doctorAddress => AccessPermission
    mapping(uint256 => mapping(address => AccessPermission)) public recordPermissions;

    // Global patient => doctor authorization: patient => doctor => AccessPermission
    mapping(address => mapping(address => AccessPermission)) public patientDoctorPermissions;

    // Events
    event RecordRegistered(
        uint256 indexed recordId,
        address indexed patient,
        string ipfsCid,
        string fileHash,
        string recordType
    );
    event AccessGranted(
        uint256 indexed recordId,
        address indexed patient,
        address indexed doctor,
        uint256 expiresAt
    );
    event AccessRevoked(
        uint256 indexed recordId,
        address indexed patient,
        address indexed doctor
    );
    event GlobalAccessGranted(
        address indexed patient,
        address indexed doctor,
        uint256 expiresAt
    );
    event GlobalAccessRevoked(
        address indexed patient,
        address indexed doctor
    );

    modifier onlyRecordOwner(uint256 _recordId) {
        require(records[_recordId].patientAddress == msg.sender, "Caller not record owner");
        _;
    }

    /**
     * @dev Register a new encrypted medical record reference on-chain
     */
    function registerRecord(
        uint256 _recordId,
        string calldata _ipfsCid,
        string calldata _fileHash,
        string calldata _recordType
    ) external {
        require(_recordId > 0, "Invalid record ID");
        require(bytes(_ipfsCid).length > 0, "IPFS CID required");
        require(bytes(_fileHash).length > 0, "File integrity hash required");
        require(records[_recordId].recordId == 0, "Record already registered");

        records[_recordId] = MedicalRecord({
            recordId: _recordId,
            patientAddress: msg.sender,
            ipfsCid: _ipfsCid,
            fileHash: _fileHash,
            recordType: _recordType,
            encryptedAt: block.timestamp
        });

        patientRecordIds[msg.sender].push(_recordId);

        emit RecordRegistered(_recordId, msg.sender, _ipfsCid, _fileHash, _recordType);
    }

    /**
     * @dev Grant an authorized doctor access to a specific medical record
     */
    function grantAccess(
        uint256 _recordId,
        address _doctor,
        uint256 _expiresAt
    ) external onlyRecordOwner(_recordId) {
        require(_doctor != address(0), "Invalid doctor address");
        require(_doctor != msg.sender, "Cannot grant access to self");
        if (_expiresAt > 0) {
            require(_expiresAt > block.timestamp, "Expiration must be in future");
        }

        recordPermissions[_recordId][_doctor] = AccessPermission({
            isGranted: true,
            grantedAt: block.timestamp,
            expiresAt: _expiresAt
        });

        emit AccessGranted(_recordId, msg.sender, _doctor, _expiresAt);
    }

    /**
     * @dev Revoke a doctor's access to a specific medical record
     */
    function revokeAccess(uint256 _recordId, address _doctor) external onlyRecordOwner(_recordId) {
        require(_doctor != address(0), "Invalid doctor address");
        recordPermissions[_recordId][_doctor].isGranted = false;
        emit AccessRevoked(_recordId, msg.sender, _doctor);
    }

    /**
     * @dev Grant doctor access to all present and future records of the patient
     */
    function grantGlobalAccess(address _doctor, uint256 _expiresAt) external {
        require(_doctor != address(0), "Invalid doctor address");
        if (_expiresAt > 0) {
            require(_expiresAt > block.timestamp, "Expiration must be in future");
        }

        patientDoctorPermissions[msg.sender][_doctor] = AccessPermission({
            isGranted: true,
            grantedAt: block.timestamp,
            expiresAt: _expiresAt
        });

        emit GlobalAccessGranted(msg.sender, _doctor, _expiresAt);
    }

    /**
     * @dev Revoke global doctor access
     */
    function revokeGlobalAccess(address _doctor) external {
        require(_doctor != address(0), "Invalid doctor address");
        patientDoctorPermissions[msg.sender][_doctor].isGranted = false;
        emit GlobalAccessRevoked(msg.sender, _doctor);
    }

    /**
     * @dev Check if doctor has active authorization to read a specific record
     */
    function hasAccess(uint256 _recordId, address _doctor) external view returns (bool) {
        MedicalRecord memory rec = records[_recordId];
        if (rec.recordId == 0) return false;
        if (rec.patientAddress == _doctor) return true; // Patient always has access to own records

        // Check record-specific access
        AccessPermission memory perm = recordPermissions[_recordId][_doctor];
        if (perm.isGranted) {
            if (perm.expiresAt == 0 || block.timestamp <= perm.expiresAt) {
                return true;
            }
        }

        // Check global patient-doctor access
        AccessPermission memory globalPerm = patientDoctorPermissions[rec.patientAddress][_doctor];
        if (globalPerm.isGranted) {
            if (globalPerm.expiresAt == 0 || block.timestamp <= globalPerm.expiresAt) {
                return true;
            }
        }

        return false;
    }

    /**
     * @dev Get all records owned by a patient
     */
    function getPatientRecords(address _patient) external view returns (uint256[] memory) {
        return patientRecordIds[_patient];
    }
}
