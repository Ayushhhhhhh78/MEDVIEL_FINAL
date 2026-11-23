# MEDVEIL — Deployment Guide

## Prerequisites

1. **Node.js**: v20+ or v24+ (Node 24 with native SQLite recommended)
2. **Circom Compiler**: v2.1.6+ (Windows binary bundled in `bin/circom.exe`)
3. **Hardhat**: Bundled in repository

---

## 1. Quick Local Setup

### Step 1: Install Dependencies
```bash
# In project root
npm install

# In backend
cd backend && npm install && cd ..

# In frontend
cd frontend && npm install && cd ..
```

### Step 2: Compile Circuit & Run Groth16 Trusted Setup
```bash
# Compiles ClaimVerification.circom
node circuits/scripts/compile.js

# Runs Phase 1 & 2 trusted setup and exports contracts/Verifier.sol
node circuits/scripts/setup.js
```

### Step 3: Run Smart Contract Deployment
```bash
# Runs deployment and writes deployed-addresses.json
npx hardhat run scripts/deploy.js
```

### Step 4: Seed Database with Synthetic Demo Data
```bash
node scripts/seed.js
```

### Step 5: Start Backend and Frontend
In terminal 1:
```bash
npm run backend:dev
```
In terminal 2:
```bash
npm run frontend:dev
```
Access the application at `http://localhost:3000`.

---

## 2. Deploying to Polygon Amoy Testnet

1. Set your Amoy RPC and private key in `.env`:
   ```env
   RPC_URL=https://rpc-amoy.polygon.technology
   CHAIN_ID=80002
   DEPLOYER_PRIVATE_KEY=0x<your_amoy_funded_private_key>
   ```

2. Run Hardhat deployment on Amoy:
   ```bash
   npx hardhat run scripts/deploy.js --network amoy
   ```

3. Update `.env` with the generated contract addresses from `deployed-addresses.json`.
