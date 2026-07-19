const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("🚀 Deploying Election Smart Contract...");
  const Election = await hre.ethers.getContractFactory("Election");
  const election = await Election.deploy("การเลือกตั้งสภานักศึกษา มหาวิทยาลัยอุบลราชธานี 2570");
  await election.waitForDeployment();
  const address = await election.getAddress();
  console.log(`✅ Deployed to: ${address}`);

  const candidates = [
    { name: "ทีมก้าวไกล",    party: "พรรคอนาคตใหม่",    slogan: "ก้าวไปด้วยกัน เพื่ออนาคตที่ดีกว่าของทุกคน" },
    { name: "ทีมพลังใหม่",    party: "พรรคพลังนักศึกษา", slogan: "พลังของคนรุ่นใหม่ เปลี่ยนแปลงวันนี้เพื่อวันพรุ่งนี้" },
    { name: "ทีมรวมใจพัฒนา", party: "พรรครวมใจ",         slogan: "รวมพลัง ร่วมคิด สร้างสรรค์มหาวิทยาลัย" },
    { name: "ทีมเพื่อเรา",    party: "พรรคเพื่อเรา",      slogan: "ทุกเสียงมีความหมาย พัฒนาอย่างเข้าใจ" },
  ];

  for (const c of candidates) {
    const tx = await election.addCandidate(c.name, c.party, c.slogan);
    await tx.wait();
    console.log(`  ✓ ${c.name}`);
  }

  fs.writeFileSync("./contract-config.json", JSON.stringify({ contractAddress: address, network: "localhost", deployedAt: new Date().toISOString() }, null, 2));
  console.log(`🎉 Done! Contract: ${address}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
