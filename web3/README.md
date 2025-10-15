# SocialProofPass Smart Contract

NFT contract for zkTLS-verified social proofs on Sepolia testnet.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and add your private key and RPC URL
```

Required in `.env`:
- `DEPLOYER_PRIVATE_KEY` - Your wallet private key (get Sepolia ETH from faucet)
- `SEPOLIA_RPC_URL` - RPC endpoint (Infura, Alchemy, or public RPC)
- `ETHERSCAN_API_KEY` - For contract verification

### 3. Get Sepolia ETH
Get free testnet ETH from these faucets:
- https://sepoliafaucet.com/
- https://www.infura.io/faucet/sepolia
- https://faucet.quicknode.com/ethereum/sepolia

### 4. Compile Contract
```bash
npm run compile
```

### 5. Deploy to Sepolia
```bash
npm run deploy:sepolia
```

### 6. Verify Contract (Optional)
```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## 📝 Contract Details

**Contract Name:** SocialProofPass  
**Symbol:** SPP  
**Network:** Sepolia Testnet  
**Standard:** ERC-721 (NFT)

### Features
- ✅ Dynamic on-chain SVG metadata
- ✅ Multi-provider verification support
- ✅ Upgradeable proof data
- ✅ Owner-controlled minting
- ✅ Query functions for verified providers

### Main Functions

**Owner Functions:**
- `mintSocialProofPass(address to, string[] providers, bytes proofData)` - Mint new NFT
- `addVerifiedProviders(uint256 tokenId, string[] providers, bytes proofData)` - Add more verifications

**View Functions:**
- `getSocialProof(uint256 tokenId)` - Get proof details
- `getTokensByHolder(address holder)` - Get user's tokens
- `hasProofPass(address holder)` - Check if user has NFT
- `totalSupply()` - Total minted tokens

## 🔧 Development

### Run Tests
```bash
npm test
```

### Local Development
```bash
npx hardhat node
# In another terminal:
npx hardhat run scripts/deploy.js --network localhost
```

## 📁 Project Structure

```
contracts/
  └── SocialProofPass.sol    # Main NFT contract
scripts/
  └── deploy.js              # Deployment script
test/
  └── Lock.js                # Test files
deployments/                 # Deployment records (auto-generated)
```

## 🌐 After Deployment

1. Copy the deployed contract address
2. Update `backend/.env`:
   ```
   NFT_CONTRACT_ADDRESS=<your-contract-address>
   RPC_URL=https://sepolia.infura.io/v3/<your-key>
   ```
3. View on Sepolia Etherscan:
   `https://sepolia.etherscan.io/address/<your-contract-address>`

## 📊 Supported Providers

The contract supports verification badges for:
- GitHub (⚡)
- Gmail (📧)
- LinkedIn (💼)
- Twitter (🐦)
- Custom providers (✓)

## 🔒 Security Notes

- Never commit `.env` file
- Keep private keys secure
- Test thoroughly on Sepolia before mainnet
- Consider auditing before production use

## 📚 Resources

- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Sepolia Testnet](https://sepolia.dev/)
- [Etherscan Sepolia](https://sepolia.etherscan.io/)
