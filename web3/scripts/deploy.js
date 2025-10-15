const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     Deploying SocialProofPass NFT Contract to Sepolia     ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  
  console.log("📍 Network:", hre.network.name);
  console.log("📍 Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
  console.log("👤 Deployer address:", deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("❌ Error: Deployer account has no ETH!");
    console.log("   Please fund your account with Sepolia ETH from a faucet:");
    console.log("   - https://sepoliafaucet.com/");
    console.log("   - https://www.infura.io/faucet/sepolia");
    process.exit(1);
  }

  console.log("🚀 Deploying SocialProofPass contract...\n");

  // Deploy the contract
  const SocialProofPass = await hre.ethers.getContractFactory("SocialProofPass");
  const socialProofPass = await SocialProofPass.deploy();

  await socialProofPass.waitForDeployment();

  const contractAddress = await socialProofPass.getAddress();

  console.log("✅ SocialProofPass deployed successfully!");
  console.log("📝 Contract address:", contractAddress);
  console.log("🔍 Transaction hash:", socialProofPass.deploymentTransaction().hash);
  console.log("⛓️  Block number:", socialProofPass.deploymentTransaction().blockNumber);
  
  // Get Reclaim Protocol address from contract
  const reclaimAddress = await socialProofPass.getReclaimAddress();
  console.log("🔗 Reclaim Protocol address:", reclaimAddress);

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    contractAddress: contractAddress,
    reclaimAddress: reclaimAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    transactionHash: socialProofPass.deploymentTransaction().hash,
    blockNumber: socialProofPass.deploymentTransaction().blockNumber,
    features: {
      onChainVerification: true,
      offChainVerification: true,
      dynamicSVG: true,
      reclaimIntegration: true
    }
  };

  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}-deployment.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n📁 Deployment info saved to:", deploymentFile);

  // Verification instructions
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                     Next Steps                             ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  
  console.log("1️⃣  Update your .env files with the contract address:");
  console.log(`    NFT_CONTRACT_ADDRESS=${contractAddress}\n`);
  
  console.log("2️⃣  Verify contract on Etherscan (wait ~1 minute first):");
  console.log(`    npx hardhat verify --network ${hre.network.name} ${contractAddress}\n`);
  
  console.log("3️⃣  View your contract on Sepolia Etherscan:");
  console.log(`    https://sepolia.etherscan.io/address/${contractAddress}\n`);

  console.log("4️⃣  Update backend/.env with:");
  console.log(`    RPC_URL=https://sepolia.infura.io/v3/YOUR-API-KEY`);
  console.log(`    NFT_CONTRACT_ADDRESS=${contractAddress}\n`);

  console.log("5️⃣  Test on-chain verification:");
  console.log(`    The contract supports both on-chain and off-chain verification modes`);
  console.log(`    Reclaim Protocol address: ${reclaimAddress}\n`);

  console.log("✨ Deployment complete!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
