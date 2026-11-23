import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export async function connectWallet() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to use Web3 features.');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts selected in MetaMask.');
  }

  const signer = await provider.getSigner(accounts[0]);
  const network = await provider.getNetwork();

  return {
    provider,
    signer,
    address: accounts[0],
    chainId: Number(network.chainId),
  };
}

/**
 * Obtains an active signer for the connected MetaMask account.
 * Reuses existing authorization if already connected, or prompts when necessary.
 */
export async function getConnectedSigner() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to use Web3 features.');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  let accounts: string[] = await window.ethereum.request({ method: 'eth_accounts' });
  if (!accounts || accounts.length === 0) {
    accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  }

  if (!accounts || accounts.length === 0) {
    throw new Error('Please connect your MetaMask wallet to continue.');
  }

  const signer = await provider.getSigner(accounts[0]);
  return {
    provider,
    signer,
    address: accounts[0],
  };
}

/**
 * Computes deterministic SHA-256 body hash for request signing.
 */
export function computeBodyHash(body: any): string {
  if (!body) {
    return ethers.sha256(ethers.toUtf8Bytes(''));
  }
  if (typeof body === 'string') {
    return ethers.sha256(ethers.toUtf8Bytes(body));
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const title = (body.get('title') as string) || '';
    const recordType = (body.get('recordType') as string) || '';
    const file = body.get('file');
    const fileInfo = file && typeof file === 'object' && 'name' in file ? `${(file as any).name}:${(file as any).size}` : '';
    return ethers.sha256(ethers.toUtf8Bytes(`form:${title}:${recordType}:${fileInfo}`));
  }
  return ethers.sha256(ethers.toUtf8Bytes(JSON.stringify(body)));
}

/**
 * Signs an API request with the connected MetaMask wallet according to the MEDVEIL protocol:
 * const signedMessage = [
 *   "MEDVEIL API Request",
 *   method,
 *   route,
 *   timestamp,
 *   nonce,
 *   bodyHash
 * ].join("\n");
 *
 * Triggers the MetaMask signature popup and handles cancellation cleanly.
 */
export async function signApiRequest(method: string, route: string, body?: any) {
  const { signer, address } = await getConnectedSigner();
  const timestamp = Date.now().toString();
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  const bodyHash = computeBodyHash(body);

  const signedMessage = [
    'MEDVEIL API Request',
    method.toUpperCase(),
    route,
    timestamp,
    nonce,
    bodyHash,
  ].join('\n');

  try {
    const signature = await signer.signMessage(signedMessage);
    return {
      headers: {
        'x-wallet-address': address,
        'x-signature': signature,
        'x-timestamp': timestamp,
        'x-nonce': nonce,
        'x-body-hash': bodyHash,
      },
      address,
    };
  } catch (err: any) {
    if (err.code === 4001 || err.code === 'ACTION_REJECTED' || (err.message && err.message.includes('rejected'))) {
      throw new Error('Wallet signature rejected. Operation cancelled.');
    }
    throw err;
  }
}

export async function signChallengeMessage(message: string) {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask not detected');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const signature = await signer.signMessage(message);
  return signature;
}

export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX = '0xaa36a7';

/**
 * Ensures MetaMask is switched to the Sepolia test network.
 */
export async function switchToSepoliaChain() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to use Web3 features.');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_HEX }],
    });
  } catch (switchError: any) {
    if (switchError.code === 4001) {
      throw new Error('Network switch to Sepolia was cancelled in MetaMask.');
    }
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_HEX,
          chainName: 'Sepolia Test Network',
          nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.sepolia.org', 'https://ethereum-sepolia-rpc.publicnode.com'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        }],
      });
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_HEX }],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Calculates low fee EIP-1559 transaction overrides for SepoliaETH.
 */
export async function getSepoliaLowFeeOverrides(provider: ethers.BrowserProvider) {
  try {
    const feeData = await provider.getFeeData();
    const minPriority = ethers.parseUnits('1.0', 'gwei');
    const maxPriority = ethers.parseUnits('1.2', 'gwei');
    let priorityFee = feeData.maxPriorityFeePerGas || minPriority;
    if (priorityFee > maxPriority) priorityFee = maxPriority;
    if (priorityFee < minPriority) priorityFee = minPriority;

    let baseFee = ethers.parseUnits('0.5', 'gwei');
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas && feeData.maxFeePerGas > feeData.maxPriorityFeePerGas) {
      baseFee = feeData.maxFeePerGas - feeData.maxPriorityFeePerGas;
    }

    const maxFee = (baseFee * 115n) / 100n + priorityFee;

    return {
      maxPriorityFeePerGas: priorityFee,
      maxFeePerGas: maxFee,
      gasLimit: 650000n,
    };
  } catch (err) {
    return {
      maxPriorityFeePerGas: ethers.parseUnits('1.1', 'gwei'),
      maxFeePerGas: ethers.parseUnits('2.2', 'gwei'),
      gasLimit: 650000n,
    };
  }
}
