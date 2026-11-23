const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { generateKeys } = require("../backend/src/services/eddsaService");
const {
  buildHospitalRegistryTree,
  buildCoveredProceduresTree,
} = require("../backend/src/utils/merkleTree");
const { computePolicyCommitment } = require("../backend/src/services/zkService");

async function main() {
  console.log("=== MEDVEIL Smart Contract Deployment ===");
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // 1. Deploy Groth16 Verifier
  console.log("\n1. Deploying Groth16Verifier...");
  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("   ✓ Groth16Verifier deployed at:", verifierAddress);

  // 2. Deploy HospitalRegistry
  console.log("\n2. Deploying HospitalRegistry...");
  const HospitalRegistryFactory = await ethers.getContractFactory("HospitalRegistry");
  const hospitalRegistry = await HospitalRegistryFactory.deploy();
  await hospitalRegistry.waitForDeployment();
  const hospitalRegistryAddress = await hospitalRegistry.getAddress();
  console.log("   ✓ HospitalRegistry deployed at:", hospitalRegistryAddress);

  // 3. Deploy PolicyRegistry
  console.log("\n3. Deploying PolicyRegistry...");
  const PolicyRegistryFactory = await ethers.getContractFactory("PolicyRegistry");
  const policyRegistry = await PolicyRegistryFactory.deploy();
  await policyRegistry.waitForDeployment();
  const policyRegistryAddress = await policyRegistry.getAddress();
  console.log("   ✓ PolicyRegistry deployed at:", policyRegistryAddress);
  if (process.env.SEPOLIA_INSURER_ADDRESS) {
    if (!ethers.isAddress(process.env.SEPOLIA_INSURER_ADDRESS)) {
      throw new Error("SEPOLIA_INSURER_ADDRESS must be a valid Ethereum address");
    }
    const authorizationTx = await policyRegistry.setInsurerAuthorization(
      process.env.SEPOLIA_INSURER_ADDRESS,
      true
    );
    await authorizationTx.wait();
    console.log("   ✓ MetaMask insurer wallet authorized:", process.env.SEPOLIA_INSURER_ADDRESS);
  }

  // 4. Deploy PatientAccess
  console.log("\n4. Deploying PatientAccess...");
  const PatientAccessFactory = await ethers.getContractFactory("PatientAccess");
  const patientAccess = await PatientAccessFactory.deploy();
  await patientAccess.waitForDeployment();
  const patientAccessAddress = await patientAccess.getAddress();
  console.log("   ✓ PatientAccess deployed at:", patientAccessAddress);

  // 5. Deploy TestToken (MVT)
  console.log("\n5. Deploying TestToken (MVT)...");
  const TestTokenFactory = await ethers.getContractFactory("TestToken");
  const testToken = await TestTokenFactory.deploy();
  await testToken.waitForDeployment();
  const testTokenAddress = await testToken.getAddress();
  console.log("   ✓ TestToken deployed at:", testTokenAddress);

  // 6. Deploy ClaimSettlement
  console.log("\n6. Deploying ClaimSettlement...");
  const ClaimSettlementFactory = await ethers.getContractFactory("ClaimSettlement");
  const claimSettlement = await ClaimSettlementFactory.deploy(
    verifierAddress,
    hospitalRegistryAddress,
    policyRegistryAddress,
    testTokenAddress
  );
  await claimSettlement.waitForDeployment();
  const claimSettlementAddress = await claimSettlement.getAddress();
  console.log("   ✓ ClaimSettlement deployed at:", claimSettlementAddress);

  // 7. Fund Settlement Pool
  console.log("\n7. Funding ClaimSettlement pool with 5,000,000 MVT tokens...");
  const fundTx = await testToken.transfer(claimSettlementAddress, ethers.parseEther("5000000"));
  await fundTx.wait();
  console.log("   ✓ Settlement pool funded successfully");

  // 8. Register Synthetic Apollo Hospital
  console.log("\n8. Initializing synthetic hospital registry & Merkle root...");
  const hospitalSeed = process.env.HOSPITAL_EDDSA_SEED || "4c696665536176657273486f73706974616c5365656432303236303130313031";
  const hospitalKeys = await generateKeys(hospitalSeed);

  // Payout address: Account #1 or deployer
  const signers = await ethers.getSigners();
  const hospitalPayout = signers.length > 1 ? signers[1].address : deployer.address;

  const hospitals = [
    {
      hospitalId: 101,
      name: "Apollo Synthetic Hospital",
      pubKeyAx: hospitalKeys.publicKey.x,
      pubKeyAy: hospitalKeys.publicKey.y,
    },
  ];

  const hospitalTree = await buildHospitalRegistryTree(hospitals);
  const hospitalRoot = hospitalTree.getRootString();

  const regHospTx = await hospitalRegistry.registerHospital(
    101,
    "Apollo Synthetic Hospital",
    "APOLLO-DELHI-9921",
    hospitalKeys.publicKey.x,
    hospitalKeys.publicKey.y,
    deployer.address,
    hospitalPayout
  );
  await regHospTx.wait();
  console.log("   ✓ Apollo Synthetic Hospital registered on-chain");

  const updateRootTx = await hospitalRegistry.updateHospitalMerkleRoot(hospitalRoot);
  await updateRootTx.wait();
  console.log("   ✓ Hospital Merkle root set to:", hospitalRoot);

  // 9. Register Synthetic Policy & Coverage Merkle Root
  console.log("\n9. Registering synthetic insurance policy...");
  const coveredProcedures = [7701, 7702, 7703]; // 7701: Appendectomy, 7702: Cholecystectomy, 7703: Orthopedic
  const procedureTree = await buildCoveredProceduresTree(coveredProcedures);
  const coverageRoot = procedureTree.getRootString();

  const policyId = 5001;
  const policyLimit = 500000;      // ₹5,00,000
  const policyExpiryDate = 20261231; // Dec 31, 2026

  const commitment = await computePolicyCommitment(
    policyId,
    policyLimit,
    policyExpiryDate,
    coverageRoot
  );

  const regPolTx = await policyRegistry.registerPolicy(policyId, commitment, coverageRoot);
  await regPolTx.wait();
  console.log("   ✓ Policy #5001 registered with commitment:", commitment);

  // Save deployment JSON
  const deployments = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    contracts: {
      Groth16Verifier: verifierAddress,
      HospitalRegistry: hospitalRegistryAddress,
      PolicyRegistry: policyRegistryAddress,
      PatientAccess: patientAccessAddress,
      TestToken: testTokenAddress,
      ClaimSettlement: claimSettlementAddress,
    },
    demo: {
      hospitalId: 101,
      hospitalName: "Apollo Synthetic Hospital",
      hospitalAx: hospitalKeys.publicKey.x,
      hospitalAy: hospitalKeys.publicKey.y,
      hospitalPayout: hospitalPayout,
      hospitalMerkleRoot: hospitalRoot,
      policyId: 5001,
      policyLimit: 500000,
      policyExpiryDate: 20261231,
      coverageRoot: coverageRoot,
      policyCommitment: commitment,
      coveredProcedures: [7701, 7702, 7703],
    },
  };

  const deployPath = path.join(__dirname, "..", "deployed-addresses.json");
  fs.writeFileSync(deployPath, JSON.stringify(deployments, null, 2));
  console.log("\n>>> Deployed addresses written to:", deployPath);

  console.log("\n=== Deployment Completed Successfully ===");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
