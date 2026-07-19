require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY  = process.env.PRIVATE_KEY || "";

module.exports = {
  solidity: "0.8.28",
  networks: {
    hardhat:   { chainId: 1337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 1337 },
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111
    }
  }
};