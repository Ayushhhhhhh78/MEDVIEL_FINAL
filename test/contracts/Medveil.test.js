const { expect } = require("chai");
const { ethers } = require("hardhat");
const { generateKeys, signClaim } = require("../../backend/src/services/eddsaService");
const {
  buildHospitalRegistryTree,
  buildCoveredProceduresTree,
} = require("../../backend/src/utils/merkleTree");
const {
  buildWitness,
  generateProof,
  formatProofForSolidity,
} = require("../../backend/src/services/zkService");

describe("MEDVEIL Smart Contracts End-to-End Suite", function () {
  this.timeout(120000); // Allow time for real Groth16 proof generation

  let owner, hospitalWallet, hospitalPayout, insurerWallet, patientWallet, doctorWallet;
  let verifier, hospitalRegistry, policyRegistry, patientAccess, testToken, claimSettlement;
  let hospitalKeys, hospitalTree, procedureTree;
  let samplePolicy, sampleClaim, patientSecret, claimEpisodeId;
  let validProofCalldata;

  before(async function () {
    [owner, hospitalWallet, hospitalPayout, insurerWallet, patientWallet, doctorWallet] =
      await ethers.getSigners();

    // 1. Deploy Verifier
    const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
    verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();

    // 2. Deploy HospitalRegistry
    const HospitalRegistryFactory = await ethers.getContractFactory("HospitalRegistry");
    hospitalRegistry = await HospitalRegistryFactory.deploy();
    await hospitalRegistry.waitForDeployment();

    // 3. Deploy PolicyRegistry
    const PolicyRegistryFactory = await ethers.getContractFactory("PolicyRegistry");
    policyRegistry = await PolicyRegistryFactory.deploy();
    await policyRegistry.waitForDeployment();

    // 4. Deploy PatientAccess
    const PatientAccessFactory = await ethers.getContractFactory("PatientAccess");
    patientAccess = await PatientAccessFactory.deploy();
    await patientAccess.waitForDeployment();

    // 5. Deploy TestToken
    const TestTokenFactory = await ethers.getContractFactory("TestToken");
    testToken = await TestTokenFactory.deploy();
    await testToken.waitForDeployment();

    // 6. Deploy ClaimSettlement
    const ClaimSettlementFactory = await ethers.getContractFactory("ClaimSettlement");
    claimSettlement = await ClaimSettlementFactory.deploy(
      await verifier.getAddress(),
      await hospitalRegistry.getAddress(),
      await policyRegistry.getAddress(),
      await testToken.getAddress()
    );
    await claimSettlement.waitForDeployment();

    // Fund ClaimSettlement settlement pool with 1,000,000 MVT tokens
    const fundAmount = ethers.parseEther("1000000");
    await testToken.transfer(await claimSettlement.getAddress(), fundAmount);

    // Setup cryptographic keys and trees
    const hospitalSeed = "4c696665536176657273486f73706974616c5365656432303236303130313031";
    hospitalKeys = await generateKeys(hospitalSeed);

    const hospitals = [
      {
        hospitalId: 101,
        name: "Apollo Synthetic Hospital",
        pubKeyAx: hospitalKeys.publicKey.x,
        pubKeyAy: hospitalKeys.publicKey.y,
      },
    ];

    hospitalTree = await buildHospitalRegistryTree(hospitals);
    const coveredProcedures = [7701, 7702, 7703];
    procedureTree = await buildCoveredProceduresTree(coveredProcedures);

    // Register Hospital on-chain
    await hospitalRegistry.registerHospital(
      101,
      "Apollo Synthetic Hospital",
      "MED-APOLLO-991",
      hospitalKeys.publicKey.x,
      hospitalKeys.publicKey.y,
      hospitalWallet.address,
      hospitalPayout.address
    );

    // Update Hospital Merkle root on-chain
    await hospitalRegistry.updateHospitalMerkleRoot(hospitalTree.getRootString());

    // Setup and register Policy on-chain
    samplePolicy = {
      policyId: 5001,
      policyLimit: 500000,
      policyExpiryDate: 20261231,
      coverageRoot: procedureTree.getRootString(),
    };

    const { computePolicyCommitment } = require("../../backend/src/services/zkService");
    const commitment = await computePolicyCommitment(
      samplePolicy.policyId,
      samplePolicy.policyLimit,
      samplePolicy.policyExpiryDate,
      samplePolicy.coverageRoot
    );

    samplePolicy.commitment = commitment;

    // Authorize insurer and register policy
    await policyRegistry.setInsurerAuthorization(insurerWallet.address, true);
    await policyRegistry.connect(insurerWallet).registerPolicy(
      samplePolicy.policyId,
      commitment,
      procedureTree.getRootString()
    );

    // Prepare Claim
    sampleClaim = {
      claimId: 9001,
      policyId: 5001,
      hospitalId: 101,
      claimAmount: 250000,
      treatmentDate: 20260515,
      procedureCode: 7701,
    };

    patientSecret = "98765432101234567890";
    claimEpisodeId = "2026051501";

    const { signature } = await signClaim(hospitalKeys.privateKeyHex, sampleClaim);
    const hospitalProof = hospitalTree.getProof(0);
    const procedureProof = procedureTree.getProof(0);

    const { witnessInput } = await buildWitness({
      claim: sampleClaim,
      hospital: hospitals[0],
      hospitalProof,
      policy: samplePolicy,
      procedureProof,
      patientSecret,
      claimEpisodeId,
      signature,
    });

    // Generate real Groth16 proof
    const { proof, publicSignals } = await generateProof(witnessInput);
    validProofCalldata = formatProofForSolidity(proof, publicSignals);
  });

  describe("Hospital and Policy Registries", function () {
    it("should correctly record hospital details and public keys", async function () {
      const [isActive, payout, hId] = await hospitalRegistry.verifyHospitalAndGetPayout(
        hospitalKeys.publicKey.x,
        hospitalKeys.publicKey.y
      );
      expect(isActive).to.be.true;
      expect(payout).to.equal(hospitalPayout.address);
      expect(hId).to.equal(101);
    });

    it("should correctly record active policy commitment", async function () {
      const isActive = await policyRegistry.isPolicyActive(samplePolicy.commitment);
      expect(isActive).to.be.true;
    });

    it("should prevent unauthorized entities from registering policies", async function () {
      await expect(
        policyRegistry.connect(patientWallet).registerPolicy(9999, 1234567, 7654321)
      ).to.be.revertedWith("Caller not authorized insurer");
    });
  });

  describe("Claim Verification and Settlement", function () {
    it("should accept a valid Groth16 proof and settle funds directly to hospital payout address", async function () {
      const initialPayoutBalance = await testToken.balanceOf(hospitalPayout.address);

      const tx = await claimSettlement.verifyAndSettleClaim(
        validProofCalldata.a,
        validProofCalldata.b,
        validProofCalldata.c,
        validProofCalldata.input
      );
      await tx.wait();

      const finalPayoutBalance = await testToken.balanceOf(hospitalPayout.address);
      const settledAmount = finalPayoutBalance - initialPayoutBalance;

      expect(settledAmount).to.equal(BigInt(sampleClaim.claimAmount));

      // Check nullifier marked as used
      const nullifier = validProofCalldata.input[4];
      const isUsed = await claimSettlement.isNullifierUsed(nullifier);
      expect(isUsed).to.be.true;
    });

    it("should reject double claim submissions with the same nullifier", async function () {
      await expect(
        claimSettlement.verifyAndSettleClaim(
          validProofCalldata.a,
          validProofCalldata.b,
          validProofCalldata.c,
          validProofCalldata.input
        )
      ).to.be.revertedWith("Claim nullifier already consumed");
    });

    it("should reject claim when public inputs or proof are tampered", async function () {
      const tamperedInput = [...validProofCalldata.input];
      tamperedInput[4] = "12345678901234567890"; // Unused nullifier, but invalid for this proof!

      await expect(
        claimSettlement.verifyAndSettleClaim(
          validProofCalldata.a,
          validProofCalldata.b,
          validProofCalldata.c,
          tamperedInput
        )
      ).to.be.revertedWith("Zero-Knowledge proof verification failed");
    });

    it("should reject claim if policy is inactive", async function () {
      // Deactivate policy
      await policyRegistry.connect(insurerWallet).setPolicyStatus(samplePolicy.commitment, false);

      const tamperedInput = [...validProofCalldata.input];
      tamperedInput[4] = "99999999999999999999";

      await expect(
        claimSettlement.verifyAndSettleClaim(
          validProofCalldata.a,
          validProofCalldata.b,
          validProofCalldata.c,
          tamperedInput
        )
      ).to.be.revertedWith("Policy commitment is inactive or unregistered");

      // Reactivate
      await policyRegistry.connect(insurerWallet).setPolicyStatus(samplePolicy.commitment, true);
    });
  });

  describe("Patient Access Control", function () {
    const recordId = 1001;
    const ipfsCid = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
    const fileHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const recordType = "SURGICAL_DISCHARGE_SUMMARY";

    it("should allow a patient to register an encrypted medical record reference", async function () {
      await expect(
        patientAccess
          .connect(patientWallet)
          .registerRecord(recordId, ipfsCid, fileHash, recordType)
      )
        .to.emit(patientAccess, "RecordRegistered")
        .withArgs(recordId, patientWallet.address, ipfsCid, fileHash, recordType);

      const records = await patientAccess.getPatientRecords(patientWallet.address);
      expect(records.length).to.equal(1);
      expect(records[0]).to.equal(recordId);
    });

    it("should allow patient to grant doctor access with expiration", async function () {
      const futureExpiry = Math.floor(Date.now() / 1000) + 86400; // +1 day

      await expect(
        patientAccess
          .connect(patientWallet)
          .grantAccess(recordId, doctorWallet.address, futureExpiry)
      )
        .to.emit(patientAccess, "AccessGranted")
        .withArgs(recordId, patientWallet.address, doctorWallet.address, futureExpiry);

      const hasAccess = await patientAccess.hasAccess(recordId, doctorWallet.address);
      expect(hasAccess).to.be.true;
    });

    it("should allow patient to revoke doctor access", async function () {
      await expect(
        patientAccess.connect(patientWallet).revokeAccess(recordId, doctorWallet.address)
      )
        .to.emit(patientAccess, "AccessRevoked")
        .withArgs(recordId, patientWallet.address, doctorWallet.address);

      const hasAccess = await patientAccess.hasAccess(recordId, doctorWallet.address);
      expect(hasAccess).to.be.false;
    });

    it("should prevent non-owners from granting access to patient records", async function () {
      await expect(
        patientAccess
          .connect(doctorWallet)
          .grantAccess(recordId, hospitalWallet.address, 0)
      ).to.be.revertedWith("Caller not record owner");
    });
  });
});
