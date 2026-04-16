import {
  Connection,
  Keypair,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createUmi,
} from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNft,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  keypairIdentity,
  generateSigner,
  percentAmount,
  createSignerFromKeypair,
} from "@metaplex-foundation/umi";
import * as fs from "fs";
import * as crypto from "crypto";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

const animalName   = "Luna";
const animalId     = "ANIMAL-001";
const operatorId   = "OP-CRIOLLO-001";
const operatorRole = "VetTechnician";
const eventType    = "VaccinationEvent";
const attestedAt   = new Date().toISOString();
const witnessedAt  = new Date().toISOString();

const vcrHash         = sha256(`${animalId}-${eventType}-${attestedAt}`);
const attestationHash = sha256(`attestation-${vcrHash}`);
const eventHash       = sha256(`event-${eventType}-${animalId}`);
const animalHash      = sha256(`animal-${animalId}`);
const environmentHash = sha256(`env-LATAM-Colombia`);
const operatorHash    = sha256(`operator-${operatorId}`);

const metadata = {
  name: `Criollo VCR — ${animalName}`,
  symbol: "VCR",
  description: "Verifiable Care Receipt — Criollo Animal Rescue Network",
  image: "https://raw.githubusercontent.com/todoencadena/Criollo-vcr-engine/main/docs/criollo-logo.png",
  attributes: [
    { trait_type: "vcrHash",         value: vcrHash },
    { trait_type: "attestationHash", value: attestationHash },
    { trait_type: "eventHash",       value: eventHash },
    { trait_type: "animalHash",      value: animalHash },
    { trait_type: "environmentHash", value: environmentHash },
    { trait_type: "operatorHash",    value: operatorHash },
    { trait_type: "operatorRole",    value: operatorRole },
    { trait_type: "attestedAt",      value: attestedAt },
    { trait_type: "witnessedAt",     value: witnessedAt },
    { trait_type: "network",         value: "Solana Devnet" },
    { trait_type: "version",         value: "1.0" },
  ],
};

fs.writeFileSync("./vcr-metadata.json", JSON.stringify(metadata, null, 2));
console.log("✅ Metadata JSON generado");

async function main() {
  console.log("\n🦁 Criollo VCR Engine — Solana Devnet Mint\n");

  const keypairPath = `${process.env.HOME}/.config/solana/id.json`;
  const secretKey   = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
  const keypair     = Keypair.fromSecretKey(secretKey);

  console.log("🔑 Wallet:", keypair.publicKey.toBase58());

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const balance    = await connection.getBalance(keypair.publicKey);
  console.log("💰 Balance:", balance / 1e9, "SOL\n");

  if (balance < 0.01 * 1e9) {
    throw new Error("❌ Balance insuficiente. Necesitas al menos 0.01 SOL.");
  }

  // Inicializar UMI correctamente
  const umi = createUmi("https://api.devnet.solana.com")
    .use(mplTokenMetadata());

  // Crear keypair de UMI desde secret key
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer     = createSignerFromKeypair(umi, umiKeypair);
  umi.use(keypairIdentity(signer));

  const mint = generateSigner(umi);
  console.log("🪙 Mint Address:", mint.publicKey);
  console.log("⏳ Minteando VCR NFT en Devnet...\n");

  const { signature } = await createNft(umi, {
    mint,
    name:                 `Criollo VCR — ${animalName}`,
    symbol:               "VCR",
    uri:                  `https://raw.githubusercontent.com/todoencadena/Criollo-vcr-engine/main/vcr-metadata.json`,
    sellerFeeBasisPoints: percentAmount(0),
    isMutable:            true,
  }).sendAndConfirm(umi);

  console.log("✅ VCR NFT minteado exitosamente!");
  console.log("📋 Mint Address:", mint.publicKey);
  console.log("🔗 Signature:   ", Buffer.from(signature).toString("base64"));
  console.log("\n🔍 Ver en explorador:");
  console.log(`   https://explorer.solana.com/address/${mint.publicKey}?cluster=devnet`);
  console.log(`\n📄 VCR Hash: ${vcrHash}`);

  const result = {
    mintAddress:   mint.publicKey,
    signature:     Buffer.from(signature).toString("base64"),
    vcrHash,
    attestationHash,
    eventHash,
    animalHash,
    environmentHash,
    operatorHash,
    operatorRole,
    attestedAt,
    witnessedAt,
    network:       "devnet",
    timestamp:     new Date().toISOString(),
  };

  fs.writeFileSync("./vcr-mint-result.json", JSON.stringify(result, null, 2));
  console.log("\n💾 Resultado guardado en vcr-mint-result.json");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
