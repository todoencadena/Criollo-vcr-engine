import hre from "hardhat";

async function main() {
  const network = hre.network.name;
  
  if (network !== 'baseMainnet') {
    throw new Error(`Wrong network: ${network}. Use --network baseMainnet`);
  }

  console.log("=== CRIOLLO VCR ENGINE — BASE MAINNET DEPLOY ===");
  console.log("WARNING: This deploys to MAINNET with real ETH");
  console.log("================================================");

  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.01")) {
    throw new Error("Insufficient ETH for mainnet deploy. Need at least 0.01 ETH.");
  }

  const CriolloVCR = await ethers.getContractFactory("CriolloVCR");
  console.log("Deploying CriolloVCR...");
  
  const criolloVCR = await CriolloVCR.deploy();
  await criolloVCR.waitForDeployment();

  const address = await criolloVCR.getAddress();
  
  console.log("\n=== DEPLOYMENT SUCCESSFUL ===");
  console.log("Contract address:", address);
  console.log("Transaction hash:", criolloVCR.deploymentTransaction().hash);
  console.log("Explorer:", `https://basescan.org/address/${address}`);
  console.log("\nNEXT STEPS:");
  console.log("1. Verify contract on BaseScan");
  console.log("2. Transfer ownership to multi-sig");
  console.log("3. Update INSTITUTIONAL_AUDIT.md with mainnet address");
  console.log("4. Notify Medici with contract address");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
