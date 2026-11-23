// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./HospitalRegistry.sol";
import "./PolicyRegistry.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[7] calldata input
    ) external view returns (bool r);
}

/**
 * @title ClaimSettlement
 * @dev Verifies Zero-Knowledge Groth16 claim proofs on-chain, ensures valid hospital
 * authorization, prevents duplicate claims via nullifiers, and executes token settlement.
 */
contract ClaimSettlement is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum ClaimStatus {
        NONE,
        VERIFIED,
        SETTLED,
        REJECTED
    }

    struct SettledClaim {
        uint256 claimNullifier;
        uint256 claimAmount;
        uint256 treatmentDate;
        uint256 policyCommitment;
        uint256 hospitalId;
        address payoutAddress;
        ClaimStatus status;
        uint256 settledAt;
        bytes32 transactionHash;
    }

    IGroth16Verifier public verifier;
    HospitalRegistry public hospitalRegistry;
    PolicyRegistry public policyRegistry;
    IERC20 public settlementToken;

    // Track used nullifiers to strictly prevent double settlement
    mapping(uint256 => bool) public nullifierUsed;

    // nullifier => SettledClaim
    mapping(uint256 => SettledClaim) public claims;

    // List of settled nullifiers
    uint256[] public settledNullifiers;

    // Total volume settled
    uint256 public totalVolumeSettled;

    // Events
    event ClaimSubmitted(
        uint256 indexed nullifier,
        uint256 claimAmount,
        uint256 indexed policyCommitment,
        uint256 indexed hospitalId,
        address payoutAddress
    );
    event ClaimVerified(uint256 indexed nullifier, uint256 claimAmount);
    event ClaimSettled(
        uint256 indexed nullifier,
        uint256 claimAmount,
        address indexed recipient,
        uint256 timestamp
    );
    event ClaimRejected(uint256 indexed nullifier, string reason);
    event VerifierUpdated(address indexed newVerifier);
    event RegistriesUpdated(address indexed hospitalRegistry, address indexed policyRegistry);
    event SettlementTokenUpdated(address indexed token);

    constructor(
        address _verifier,
        address _hospitalRegistry,
        address _policyRegistry,
        address _settlementToken
    ) Ownable(msg.sender) {
        require(_verifier != address(0), "Invalid verifier address");
        require(_hospitalRegistry != address(0), "Invalid hospital registry address");
        require(_policyRegistry != address(0), "Invalid policy registry address");

        verifier = IGroth16Verifier(_verifier);
        hospitalRegistry = HospitalRegistry(_hospitalRegistry);
        policyRegistry = PolicyRegistry(_policyRegistry);
        if (_settlementToken != address(0)) {
            settlementToken = IERC20(_settlementToken);
        }
    }

    /**
     * @dev Set or update the Groth16 verifier contract
     */
    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier address");
        verifier = IGroth16Verifier(_verifier);
        emit VerifierUpdated(_verifier);
    }

    /**
     * @dev Set or update registries
     */
    function setRegistries(address _hospitalRegistry, address _policyRegistry) external onlyOwner {
        require(_hospitalRegistry != address(0), "Invalid hospital registry address");
        require(_policyRegistry != address(0), "Invalid policy registry address");
        hospitalRegistry = HospitalRegistry(_hospitalRegistry);
        policyRegistry = PolicyRegistry(_policyRegistry);
        emit RegistriesUpdated(_hospitalRegistry, _policyRegistry);
    }

    /**
     * @dev Set or update the settlement token
     */
    function setSettlementToken(address _token) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        settlementToken = IERC20(_token);
        emit SettlementTokenUpdated(_token);
    }

    /**
     * @dev Submits and verifies a ZK Groth16 claim proof, then executes settlement.
     * Public input layout:
     * input[0] = claimAmount
     * input[1] = treatmentDate
     * input[2] = hospitalRegistryRoot
     * input[3] = policyCommitment
     * input[4] = claimNullifier
     * input[5] = hospitalAx
     * input[6] = hospitalAy
     */
    function verifyAndSettleClaim(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[7] calldata input
    ) external nonReentrant returns (bool) {
        // 1. Replay attack check: Nullifier MUST NOT have been consumed previously
        require(!nullifierUsed[input[4]], "Claim nullifier already consumed");
        require(input[0] > 0, "Claim amount must be greater than zero");

        // 2. Policy check: Policy commitment MUST be registered and active
        require(policyRegistry.isPolicyActive(input[3]), "Policy commitment is inactive or unregistered");

        // 3. Hospital root check: Submitted root MUST match current hospital registry root
        require(
            input[2] == hospitalRegistry.hospitalMerkleRoot(),
            "Hospital registry Merkle root mismatch"
        );

        // 4. Hospital identity check: Verify hospital is registered and active
        (bool isHospitalActive, address payoutAddress, uint256 hospitalId) =
            hospitalRegistry.verifyHospitalAndGetPayout(input[5], input[6]);
        require(isHospitalActive, "Hospital public key not active in registry");
        require(payoutAddress != address(0), "Registered payout address is invalid");

        // 5. Zero-Knowledge Proof Verification on-chain
        require(verifier.verifyProof(a, b, c, input), "Zero-Knowledge proof verification failed");

        emit ClaimVerified(input[4], input[0]);

        // 6. Mark nullifier as consumed BEFORE token transfer (checks-effects-interactions)
        nullifierUsed[input[4]] = true;

        claims[input[4]] = SettledClaim({
            claimNullifier: input[4],
            claimAmount: input[0],
            treatmentDate: input[1],
            policyCommitment: input[3],
            hospitalId: hospitalId,
            payoutAddress: payoutAddress,
            status: ClaimStatus.SETTLED,
            settledAt: block.timestamp,
            transactionHash: bytes32(0)
        });

        settledNullifiers.push(input[4]);
        totalVolumeSettled += input[0];

        emit ClaimSubmitted(input[4], input[0], input[3], hospitalId, payoutAddress);

        // 7. Token Settlement: Transfer funds directly to the registered payout address
        if (address(settlementToken) != address(0)) {
            uint256 contractBalance = settlementToken.balanceOf(address(this));
            if (contractBalance >= input[0]) {
                settlementToken.safeTransfer(payoutAddress, input[0]);
            } else {
                settlementToken.safeTransferFrom(msg.sender, payoutAddress, input[0]);
            }
        }

        emit ClaimSettled(input[4], input[0], payoutAddress, block.timestamp);

        return true;
    }

    /**
     * @dev Fund the contract settlement pool with tokens
     */
    function fundSettlementPool(uint256 amount) external {
        require(address(settlementToken) != address(0), "Settlement token not configured");
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @dev Check if a claim nullifier has been settled
     */
    function isNullifierUsed(uint256 _nullifier) external view returns (bool) {
        return nullifierUsed[_nullifier];
    }

    /**
     * @dev Get total number of settled claims
     */
    function getSettledClaimsCount() external view returns (uint256) {
        return settledNullifiers.length;
    }
}
