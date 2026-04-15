import hre from "hardhat";

async function main() {
  console.log("Deploying CriolloVCR to Base Sepolia...");

  // In Hardhat 3, ethers is on the network connection, not hre directly
  const connection = await hre.network.connect();
  const ethers = connection.ethers;

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const CriolloVCR = await ethers.getContractFactory("CriolloVCR");
  const criolloVCR = await CriolloVCR.deploy();

  await criolloVCR.waitForDeployment();

  const address = await criolloVCR.getAddress();
  console.log("CriolloVCR deployed to:", address);
  console.log("Transaction hash:", criolloVCR.deploymentTransaction().hash);
  console.log("Explorer:", `https://sepolia.basescan.org/address/${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
