# MEDVEIL — Technical Limitations & Disclosures

The following technical limitations and architectural assumptions apply to this hackathon MVP:

1. **Synthetic Data Only:**  
   The application exclusively utilizes synthetic patient records, hospital identities, and simulated insurance policies. It is not connected to live hospital databases or commercial insurance carriers.

2. **Settlement Mechanism:**  
   Settlement is demonstrated using test tokens (`TestToken` / `MVT`) on a local Hardhat network or testnet assets on Polygon Amoy. It does not transfer real fiat currency or bank deposits.

3. **Nature of Zero-Knowledge Verification:**  
   ZK verification mathematically proves that the provided inputs satisfy all circuit constraints (amount <= limit, date <= expiry, procedure is in Merkle tree, signature is valid). It does not physical verify that a surgery was performed; physical authenticity depends on trusted registered hospitals and legal licensing.

4. **Off-Chain Storage & Revocation Scope:**  
   Patient revocation blocks future decryption requests through MEDVEIL. Cryptographic revocation cannot delete or alter copies of medical records that an authorized doctor previously downloaded or decrypted to their local machine.

5. **Metadata Privacy:**  
   While diagnoses, clinical notes, and procedure codes are shielded, certain public signals (such as the settlement payout amount and hospital public key) are visible on the blockchain to facilitate transaction execution.

6. **Not a Certified Medical Device:**  
   MEDVEIL is a research prototype and hackathon MVP. It has not undergone formal HIPAA, GDPR-health, or FDA medical software certification.
