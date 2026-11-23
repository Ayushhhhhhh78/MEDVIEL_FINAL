// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestToken (MVT)
 * @dev Test ERC-20 token for simulating healthcare claim settlements in MEDVEIL.
 */
contract TestToken is ERC20, Ownable {
    constructor() ERC20("MedVeil Settlement Token", "MVT") Ownable(msg.sender) {
        // Mint 10,000,000 MVT tokens with 18 decimals to deployer for settlement pool
        _mint(msg.sender, 10_000_000 * 10 ** decimals());
    }

    /**
     * @dev Mint additional test tokens for prototype testing
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
