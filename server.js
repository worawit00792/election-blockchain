require("dotenv").config();
const express    = require("express");
const session    = require("express-session");
const axios      = require("axios");
const { ethers } = require("ethers");
const path       = require("path");
const fs         = require("fs");
const multer     = require("multer");

// ─── Multer (อัพโหลดรูปผู้สมัคร) ──────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "frontend/images/candidates");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `candidate_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const app  = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ALLOWED_DOMAIN       = "ubu.ac.th";
const REDIRECT_URI         = `http://127.0.0.1:${PORT}/auth/google/callback`;

let provider, wallet, contract, contractABI, contractAddress;

// ─── Candidate extra data (เก็บ in-memory: นโยบาย, ประวัติ, รูป, สี, emoji) ──
let candidateExtra = {}; // key = candidateId (number)

async function initBlockchain() {
  try {
    const artifactPath = path.join(__dirname, "artifacts/contracts/Election.sol/Election.json");
    if (!fs.existsSync(artifactPath)) { console.log("⚠️  Run: npx hardhat compile"); return; }
    contractABI = JSON.parse(fs.readFileSync(artifactPath)).abi;

    const configPath = path.join(__dirname, "contract-config.json");
    if (!fs.existsSync(configPath)) { console.log("⚠️  Run: npm run deploy"); return; }
    contractAddress = JSON.parse(fs.readFileSync(configPath)).contractAddress;

    provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    wallet   = await provider.getSigner(0);
    contract = new ethers.Contract(contractAddress, contractABI, wallet);
    console.log(`⛓️  Connected to blockchain: ${contractAddress}`);

    // Load saved extra data
    const extraPath = path.join(__dirname, "candidate-extra.json");
    if (fs.existsSync(extraPath)) {
      candidateExtra = JSON.parse(fs.readFileSync(extraPath));
    }
  } catch (err) { console.log("⚠️  Blockchain not available:", err.message); }
}

function saveExtra() {
  fs.writeFileSync(path.join(__dirname, "candidate-extra.json"), JSON.stringify(candidateExtra, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "frontend")));
app.use(session({ secret: "ubu-election-2570", resave: false, saveUninitialized: false, cookie: { maxAge: 86400000 } }));

function requireLogin(req, res, next) { if (!req.session.user) return res.redirect("/login.html"); next(); }
function requireAdmin(req, res, next) { if (!req.session.isAdmin) return res.status(401).json({ error: "Unauthorized" }); next(); }

// ─── Google OAuth ────────────────────────────────────────────
app.get("/auth/google", (req, res) => {
  const next = req.query.next || "/";
  if (next !== "/") req.session.loginNext = next;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20email%20profile`;
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("/login.html?error=no_code");
  try {
    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", { code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" });
    const userRes  = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } });
    const { email, name } = userRes.data;
    if (!email.endsWith("@" + ALLOWED_DOMAIN)) return res.redirect("/login.html?error=wrong_domain");
    req.session.user = { email, name, hasVoted: false };
    if (contract) {
      try { req.session.user.hasVoted = await contract.hasEmailVoted(email); } catch(e) {}
    }
    const dest = req.session.loginNext || "/home.html"; delete req.session.loginNext; res.redirect(dest);
  } catch (err) { res.redirect("/login.html?error=oauth_failed"); }
});

app.post("/auth/logout", (req, res) => { req.session.destroy(); res.json({ ok: true }); });

// ─── API ─────────────────────────────────────────────────────
app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false, isAdmin: !!req.session.isAdmin });
  res.json({ loggedIn: true, ...req.session.user, isAdmin: !!req.session.isAdmin });
});

app.get("/api/candidates", async (req, res) => {
  if (!contract) return res.json({ candidates: getMockCandidates() });
  try {
    const count = Number(await contract.candidateCount());
    const COLORS = ["#2563eb","#f59e0b","#10b981","#7c3aed"];
    const candidates = [];
    for (let i = 1; i <= count; i++) {
      const [id, name, party, slogan, voteCount] = await contract.getCandidate(i);
      const extra = candidateExtra[i] || {};
      candidates.push({
        id: Number(id), name, party, slogan,
        voteCount: Number(voteCount),
        color:    extra.color    || COLORS[i-1] || "#2563eb",
        emoji:    extra.emoji    || "🗳️",
        photo:    extra.photo    || `candidate-${i}.png`,
        policies: extra.policies || [],
        biography:extra.biography|| "",
      });
    }
    res.json({ candidates });
  } catch (err) { res.json({ candidates: getMockCandidates() }); }
});

app.get("/api/stats", async (req, res) => {
  if (!contract) return res.json({ totalVotes: 0, isOpen: true, totalVoters: 2450 });
  try {
    const totalVotes = Number(await contract.totalVotes());
    const isOpen     = await contract.isOpen();
    res.json({ totalVotes, isOpen, totalVoters: 2450 });
  } catch (err) { res.json({ totalVotes: 0, isOpen: true, totalVoters: 2450 }); }
});

app.post("/api/vote", requireLogin, async (req, res) => {
  const { candidateId } = req.body;
  const email = req.session.user.email;
  if (!contract) return res.status(503).json({ error: "Blockchain not available" });
  try {
    const hasVoted = await contract.hasEmailVoted(email);
    if (hasVoted) return res.status(403).json({ error: "คุณได้ลงคะแนนแล้ว" });
    const emailHash   = ethers.keccak256(ethers.toUtf8Bytes(email));
    const voterWallet = new ethers.Wallet(emailHash, provider);
    const fundTx      = await wallet.sendTransaction({ to: voterWallet.address, value: ethers.parseEther("0.1") });
    await fundTx.wait();
    const voterContract = contract.connect(voterWallet);
    const tx      = await voterContract.vote(candidateId, email);
    const receipt = await tx.wait();
    req.session.user.hasVoted = true;
    req.session.user.txHash   = receipt.hash;
    res.json({ ok: true, txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Admin ───────────────────────────────────────────────────
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "admin2570") {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "ข้อมูลไม่ถูกต้อง" });
  }
});

app.post("/api/admin/toggle", requireAdmin, async (req, res) => {
  if (!contract) return res.status(503).json({ error: "Blockchain not available" });
  try {
    const tx = await contract.toggleElection();
    await tx.wait();
    const isOpen = await contract.isOpen();
    res.json({ ok: true, isOpen });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// เพิ่มผู้สมัคร (Smart Contract + Extra data + รูป)
app.post("/api/admin/add-candidate", requireAdmin, upload.single("photo"), async (req, res) => {
  if (!contract) return res.status(503).json({ error: "Blockchain not available" });
  try {
    const { name, party, slogan, color, emoji, biography } = req.body;
    let policies = [];
    try { policies = JSON.parse(req.body.policies || "[]"); } catch(e) {}

    if (!name || !party || !slogan) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });

    const tx = await contract.addCandidate(name, party, slogan);
    await tx.wait();

    const count = Number(await contract.candidateCount());

    // Save extra data
    let photoPath = `candidate-${count}.png`; // default
    if (req.file) {
      photoPath = `candidates/${req.file.filename}`;
    }

    candidateExtra[count] = {
      color:    color    || "#2563eb",
      emoji:    emoji    || "🗳️",
      photo:    photoPath,
      policies: policies,
      biography:biography || "",
    };
    saveExtra();

    res.json({ ok: true, message: `เพิ่ม ${name} สำเร็จ` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ลบผู้สมัคร (ลบ extra data ด้วย แต่ Smart Contract ลบไม่ได้)
app.delete("/api/admin/delete-candidate/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (candidateExtra[id]) {
    // ลบรูปด้วยถ้ามี
    if (candidateExtra[id].photo && candidateExtra[id].photo.startsWith("candidates/")) {
      const imgPath = path.join(__dirname, "frontend/images", candidateExtra[id].photo);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    delete candidateExtra[id];
    saveExtra();
  }
  res.json({ ok: true, message: "ลบข้อมูลเพิ่มเติมแล้ว (Smart Contract ไม่สามารถลบได้)" });
});

app.get("/api/blockchain", async (req, res) => {
  if (!provider || !contract) return res.json({ blocks: [], contractAddress: null, isValid: false });
  try {
    const blockNumber = await provider.getBlockNumber();
    const blocks = [];
    for (let i = Math.max(0, blockNumber - 9); i <= blockNumber; i++) {
      const block = await provider.getBlock(i, true);
      if (block) blocks.push({ number: block.number, hash: block.hash, parentHash: block.parentHash, timestamp: new Date(block.timestamp * 1000).toISOString(), txCount: block.transactions ? block.transactions.length : 0 });
    }
    res.json({ blocks: blocks.reverse(), contractAddress, isValid: true, totalBlocks: blockNumber + 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function getMockCandidates() {
  return [
    { id:1, name:"ทีมก้าวไกล",    party:"พรรคอนาคตใหม่",    slogan:"ก้าวไปด้วยกัน",     voteCount:0, color:"#2563eb", emoji:"🚀", photo:"candidate-1.png", policies:[], biography:"" },
    { id:2, name:"ทีมพลังใหม่",    party:"พรรคพลังนักศึกษา", slogan:"พลังของคนรุ่นใหม่",  voteCount:0, color:"#f59e0b", emoji:"⚡", photo:"candidate-2.png", policies:[], biography:"" },
    { id:3, name:"ทีมรวมใจพัฒนา", party:"พรรครวมใจ",         slogan:"รวมพลัง ร่วมคิด",    voteCount:0, color:"#10b981", emoji:"🌱", photo:"candidate-3.png", policies:[], biography:"" },
    { id:4, name:"ทีมเพื่อเรา",    party:"พรรคเพื่อเรา",      slogan:"ทุกเสียงมีความหมาย", voteCount:0, color:"#7c3aed", emoji:"💙", photo:"candidate-4.png", policies:[], biography:"" },
  ];
}

app.listen(PORT, async () => {
  await initBlockchain();
  console.log("\n" + "═".repeat(50));
  console.log("  🗳️  UBU Election System 2570 (Blockchain)");
  console.log("  " + "─".repeat(46));
  console.log(`  URL  : http://127.0.0.1:${PORT}`);
  console.log("  Admin: admin / admin2570");
  console.log("═".repeat(50) + "\n");
});
