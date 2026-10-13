require("dotenv").config();
const express    = require("express");
const session    = require("express-session");
const axios      = require("axios");
const { ethers } = require("ethers");
const path       = require("path");
const fs         = require("fs");
const multer     = require("multer");
const dataStore = require("./storage");   // ที่เก็บข้อมูลถาวร (ข่าวสาร / ข้อมูลหน้าเว็บ / รูป)
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
const REDIRECT_URI = process.env.RENDER_EXTERNAL_URL
  ? `${process.env.RENDER_EXTERNAL_URL}/auth/google/callback`
  : `http://127.0.0.1:${PORT}/auth/google/callback`;
let provider, wallet, contract, contractABI, contractAddress;
let closingTime = null; // เวลาปิดรับคะแนน (ISO string) — Admin ตั้งเอง, เก็บไว้ในหน่วยความจำเซิร์ฟเวอร์
let lastVoteAt = null; // เวลาที่มีคนโหวตล่าสุด (ISO string) — สำหรับโชว์ LIVE indicator หน้าผลคะแนน
// ─── Candidate extra data (นโยบาย, ประวัติ, รูป, สี, emoji, hidden) เก็บลงไฟล์ candidate-extra.json ──
let candidateExtra = {}; // key = candidateId (number)
// ─── ตั้งค่าการเลือกตั้งที่ต้องไม่หายเมื่อรีสตาร์ท (เวลาปิดรับคะแนน) เก็บลงไฟล์ election-settings.json ──
// หมายเหตุ: บน Render แผนฟรี ไฟล์ที่เขียนตอนรันจะหายเมื่อรีสตาร์ท/Deploy ใหม่ จึงมีตัวแปร Environment สำรองไว้ให้
//   CLOSING_TIME=2026-10-20T16:00:00+07:00   เวลาปิดรับคะแนน (ใช้เมื่อไม่มีไฟล์)
//   HIDDEN_CANDIDATES=5,6                     หมายเลขผู้สมัครที่ซ่อนถาวร (ซ่อนจากทุกหน้า และโหวตไม่ได้)
const settingsPath = path.join(__dirname, "election-settings.json");
const ENV_HIDDEN = new Set((process.env.HIDDEN_CANDIDATES || "").split(",").map(x => parseInt(x.trim())).filter(Boolean));
function isHidden(id) { return !!(candidateExtra[id] && candidateExtra[id].hidden) || ENV_HIDDEN.has(Number(id)); }
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const st = JSON.parse(fs.readFileSync(settingsPath));
      closingTime = (st && st.closingTime && !isNaN(Date.parse(st.closingTime))) ? new Date(st.closingTime).toISOString() : null;
      return;
    }
  } catch (_) {}
  if (process.env.CLOSING_TIME && !isNaN(Date.parse(process.env.CLOSING_TIME))) closingTime = new Date(process.env.CLOSING_TIME).toISOString();
}
function saveSettings() { try { fs.writeFileSync(settingsPath, JSON.stringify({ closingTime }, null, 2)); } catch (e) { console.log("⚠️  บันทึกการตั้งค่าไม่สำเร็จ:", e.message); } }
// ─── ปิดการเลือกตั้งอัตโนมัติเมื่อถึงเวลาที่ Admin ตั้งไว้ ──
let autoClosePromise = null;
async function checkAutoClose() {
  if (!contract || !closingTime) return;
  if (Date.now() < Date.parse(closingTime)) return;
  if (autoClosePromise) return autoClosePromise;      // กันหลายคำขอสั่งปิดพร้อมกัน
  autoClosePromise = (async () => {
    try {
      if (await contract.isOpen()) {
        const tx = await contract.toggleElection(); await tx.wait();
        console.log("⏰ ปิดการเลือกตั้งอัตโนมัติ (ถึงเวลาที่ตั้งไว้: " + closingTime + ")");
      }
    } catch (e) { console.log("⚠️  ปิดอัตโนมัติไม่สำเร็จ:", e.message); }
    finally { autoClosePromise = null; }
  })();
  return autoClosePromise;
}
function removeUploaded(req) { try { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (_) {} }
async function initBlockchain() {
  try {
    const artifactPath = path.join(__dirname, "artifacts/contracts/Election.sol/Election.json");
    if (!fs.existsSync(artifactPath)) { console.log("⚠️  Run: npx hardhat compile"); return; }
    contractABI = JSON.parse(fs.readFileSync(artifactPath)).abi;
    const configPath = path.join(__dirname, "contract-config.json");
    if (!fs.existsSync(configPath)) { console.log("⚠️  Run: npm run deploy"); return; }
    contractAddress = JSON.parse(fs.readFileSync(configPath)).contractAddress;
    const RPC_URL = process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545";
    const isSepolia = RPC_URL.includes("sepolia") || RPC_URL.includes("alchemy") || RPC_URL.includes("infura");
    if (isSepolia) {
      // บอก network ตรงๆ (staticNetwork) กัน error "failed to detect network"
      provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 11155111, name: "sepolia" }, { staticNetwork: true });
      wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    } else {
      provider = new ethers.JsonRpcProvider(RPC_URL);
      wallet   = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : await provider.getSigner(0);
    }
    // ★ ครอบกระเป๋ากลางด้วย NonceManager: กระเป๋ากลางใบเดียวต้องส่งธุรกรรมให้ทุกคน (ค่าธรรมเนียมผู้โหวต / เพิ่มผู้สมัคร / ปิด-เปิด)
    //   ถ้าไม่จัดลำดับ nonce เอง คนโหวตพร้อมกันหลายคนจะชนกัน ("nonce has already been used") และโหวตไม่สำเร็จ
    const rawWallet = wallet, nm = new ethers.NonceManager(rawWallet), sendOnce = nm.sendTransaction.bind(nm);
    let sendQueue = Promise.resolve();   // ส่งทีละธุรกรรมตามลำดับ (รอแค่ให้ส่งสำเร็จ ไม่รอให้ขุดบล็อก) กันธุรกรรมถึงโหนดสลับลำดับ
    nm.sendTransaction = tx => {
      const p = sendQueue.then(async () => { try { return await sendOnce(tx); } catch (e) { nm.reset(); throw e; } });   // ส่งไม่สำเร็จ → ล้างตัวนับ ไม่ให้ลำดับค้าง
      sendQueue = p.catch(() => {});
      return p;
    };
    wallet = nm;
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

// ★★★ แก้ไขแล้ว: ซ่อนคะแนนแยกผู้สมัครระหว่างเปิดรับคะแนน (isOpen=true) ★★★
app.get("/api/candidates", async (req, res) => {
  if (!contract) return res.json({ candidates: getMockCandidates() });
  try {
    const count  = Number(await contract.candidateCount());
    const isOpen = await contract.isOpen();
    const COLORS = ["#2563eb","#f59e0b","#10b981","#7c3aed"];
    const wantAll = req.query.all === "1" && !!req.session.isAdmin;   // เฉพาะ Admin เห็นผู้สมัครที่ซ่อนอยู่
    const candidates = [];
    for (let i = 1; i <= count; i++) {
      const hidden = isHidden(i);
      if (hidden && !wantAll) continue;
      const [id, name, party, slogan, voteCount] = await contract.getCandidate(i);
      const extra = candidateExtra[i] || {};
      candidates.push({
        id: Number(id), name, party, slogan, hidden,
        // ★ ระหว่างเปิดรับคะแนน ไม่ส่งตัวเลขคะแนนออกไปเลย (null) ป้องกันการชี้นำ/บังคับโหวต
        voteCount: isOpen ? null : Number(voteCount),
        color:    extra.color    || COLORS[i-1] || "#2563eb",
        emoji:    extra.emoji    || "🗳️",
        photo:    extra.photo    || `candidate-${i}.png`,
        policies: extra.policies || [],
        biography:extra.biography|| "",
      });
    }
    res.json({ candidates, isOpen });
  } catch (err) { res.json({ candidates: getMockCandidates() }); }
});

app.get("/api/stats", async (req, res) => {
  if (!contract) return res.json({ totalVotes: 0, isOpen: true, totalVoters: 2450, closingTime, lastVoteAt });
  try {
    await checkAutoClose();                                  // ถึงเวลาแล้วปิดให้ก่อนตอบ
    const totalVotes = Number(await contract.totalVotes());
    const isOpen     = await contract.isOpen();
    res.json({ totalVotes, isOpen, totalVoters: 2450, closingTime, lastVoteAt });
  } catch (err) { res.json({ totalVotes: 0, isOpen: true, totalVoters: 2450, closingTime, lastVoteAt }); }
});
app.post("/api/vote", requireLogin, async (req, res) => {
  const { candidateId } = req.body;
  const email = req.session.user.email;
  if (!contract) return res.status(503).json({ error: "Blockchain not available" });
  if (closingTime && Date.now() >= Date.parse(closingTime)) {
    checkAutoClose().catch(() => {});
    return res.status(403).json({ error: "หมดเวลาลงคะแนนแล้ว" });
  }
  const cid = parseInt(candidateId);
  if (!Number.isInteger(cid) || cid < 1 || isHidden(cid)) return res.status(400).json({ error: "ไม่พบผู้สมัครที่เลือก" });
  try {
    // แก้ช่องโหว่เงินกระเป๋ากลางรั่ว: ตรวจก่อนโอนค่าธรรมเนียมให้ผู้โหวต (เดิมโอนก่อน แล้วค่อยถูกปฏิเสธ เสียเงินทุกครั้งที่กดซ้ำ)
    if (!(await contract.isOpen())) return res.status(403).json({ error: "การเลือกตั้งปิดรับคะแนนแล้ว" });
    if (cid > Number(await contract.candidateCount())) return res.status(400).json({ error: "ไม่พบผู้สมัครที่เลือก" });
    const hasVoted = await contract.hasEmailVoted(email);
    if (hasVoted) return res.status(403).json({ error: "คุณได้ลงคะแนนแล้ว" });
    const emailHash   = ethers.keccak256(ethers.toUtf8Bytes(email));
    const voterWallet = new ethers.Wallet(emailHash, provider);
    const fundTx      = await wallet.sendTransaction({ to: voterWallet.address, value: ethers.parseEther("0.002") });
    await fundTx.wait();
    const voterContract = contract.connect(voterWallet);
    const tx      = await voterContract.vote(candidateId, email);
    const receipt = await tx.wait();
    req.session.user.hasVoted = true;
    req.session.user.txHash   = receipt.hash;
    lastVoteAt = new Date().toISOString(); // ★ บันทึกเวลาโหวตล่าสุด สำหรับ LIVE indicator

    // ★ ดึงชื่อ+รูปผู้สมัครที่เลือก ส่งกลับไปให้หน้า success.html โชว์ "ครั้งเดียว" (ไม่ได้เก็บถาวรที่ไหนเลย)
    let votedCandidate = null;
    try {
      const [, name, party] = await contract.getCandidate(candidateId);
      const extra = candidateExtra[candidateId] || {};
      votedCandidate = { name, party, photo: extra.photo || `candidate-${candidateId}.png`, emoji: extra.emoji || "🗳️" };
    } catch (_) { /* ไม่กระทบการโหวตหลัก ถ้าดึงข้อมูลนี้พลาดก็แค่ไม่โชว์รูป */ }

    res.json({ ok: true, txHash: receipt.hash, blockNumber: receipt.blockNumber, votedCandidate });
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
    let closingTimeCleared = false;
    if (isOpen && closingTime) { closingTime = null; saveSettings(); closingTimeCleared = true; }   // เปิดกลับ = เวลาปิดเดิมใช้ไม่ได้แล้ว กันระบบปิดซ้ำเอง
    res.json({ ok: true, isOpen, closingTimeCleared });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─── ตั้ง/ล้าง เวลาปิดรับคะแนน (ระบบปิดการเลือกตั้งให้อัตโนมัติเมื่อถึงเวลา) ───────────
app.post("/api/admin/set-closing-time", requireAdmin, (req, res) => {
  const { closingTime: newTime } = req.body; // ต้องเป็น ISO string เช่น "2026-09-20T18:00:00"
  if (newTime && isNaN(Date.parse(newTime))) {
    return res.status(400).json({ error: "รูปแบบวันเวลาไม่ถูกต้อง" });
  }
  closingTime = newTime ? new Date(newTime).toISOString() : null; // ส่ง null/ว่าง มา = ล้างเวลา (ไม่แสดงนับถอยหลัง และไม่ปิดอัตโนมัติ)
  saveSettings();
  const passed = !!closingTime && Date.now() >= Date.parse(closingTime);
  if (passed) checkAutoClose().catch(() => {});   // เวลาที่ตั้งผ่านไปแล้ว: ปิดการเลือกตั้งทันที
  res.json({ ok: true, closingTime, closesNow: passed });
});
// เพิ่มผู้สมัคร (Smart Contract + Extra data + รูป)
app.post("/api/admin/add-candidate", requireAdmin, upload.single("photo"), async (req, res) => {
  if (!contract) return res.status(503).json({ error: "Blockchain not available" });
  try {
    const { name, party, slogan, color, emoji, biography } = req.body;
    let policies = [];
    try { policies = JSON.parse(req.body.policies || "[]"); } catch(e) {}
    if (!name || !party || !slogan) { removeUploaded(req); return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" }); }
    const votesNow = Number(await contract.totalVotes());
    if (votesNow > 0 && req.body.confirmLate !== "true") {
      removeUploaded(req);
      return res.status(409).json({ error: `มีผู้ลงคะแนนแล้ว ${votesNow} คน การเพิ่มผู้สมัครตอนนี้ไม่ยุติธรรมกับคนที่โหวตไปแล้ว`, needConfirm: true, totalVotes: votesNow });
    }
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
  } catch (err) { removeUploaded(req); res.status(500).json({ error: err.message }); }
});
// ซ่อน/แสดงผู้สมัคร (Smart Contract ลบผู้สมัครไม่ได้ จึงใช้ "ซ่อน" แทน: ซ่อนจากทุกหน้าและโหวตให้ไม่ได้)
// ทำได้เฉพาะตอนยังไม่มีผู้ลงคะแนนเลย เพื่อความยุติธรรม
app.post("/api/admin/hide-candidate/:id", requireAdmin, async (req, res) => {
  if (!contract) return res.status(503).json({ error: "Blockchain not available" });
  try {
    const id = parseInt(req.params.id);
    const hide = !(req.body.hidden === false || req.body.hidden === "false");
    const count = Number(await contract.candidateCount());
    if (!Number.isInteger(id) || id < 1 || id > count) return res.status(404).json({ error: "ไม่พบผู้สมัคร" });
    const votesNow = Number(await contract.totalVotes());
    if (votesNow > 0) return res.status(409).json({ error: `มีผู้ลงคะแนนแล้ว ${votesNow} คน จึงซ่อน/แสดงผู้สมัครไม่ได้ เพื่อความยุติธรรมกับคนที่โหวตไปแล้ว` });
    if (!hide && ENV_HIDDEN.has(id)) return res.status(400).json({ error: "ผู้สมัครนี้ถูกซ่อนด้วยตัวแปร HIDDEN_CANDIDATES บน Render ต้องแก้ที่นั่น" });
    if (hide) {
      let visible = 0;
      for (let i = 1; i <= count; i++) if (i !== id && !isHidden(i)) visible++;
      if (visible < 1) return res.status(400).json({ error: "ต้องมีผู้สมัครที่แสดงอยู่อย่างน้อย 1 คน" });
    }
    candidateExtra[id] = { ...(candidateExtra[id] || {}), hidden: hide };
    saveExtra();
    res.json({ ok: true, hidden: hide, message: hide ? "ซ่อนผู้สมัครแล้ว (หายจากทุกหน้า และโหวตให้ไม่ได้)" : "แสดงผู้สมัครอีกครั้งแล้ว" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// แก้ไขข้อมูลเสริมของผู้สมัคร (สี อีโมจิ รูป นโยบาย ประวัติ) — ชื่อ พรรค สโลแกน อยู่บน Blockchain แก้ไม่ได้
app.put("/api/admin/update-candidate/:id", requireAdmin, upload.single("photo"), async (req, res) => {
  if (!contract) { removeUploaded(req); return res.status(503).json({ error: "Blockchain not available" }); }
  try {
    const id = parseInt(req.params.id);
    const count = Number(await contract.candidateCount());
    if (!Number.isInteger(id) || id < 1 || id > count) { removeUploaded(req); return res.status(404).json({ error: "ไม่พบผู้สมัคร" }); }
    const next = { ...(candidateExtra[id] || {}) };
    if (typeof req.body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.color)) next.color = req.body.color;
    if (typeof req.body.emoji === "string") next.emoji = req.body.emoji || "🗳️";
    if (typeof req.body.biography === "string") next.biography = req.body.biography;
    if (req.body.policies !== undefined) {
      let p = []; try { p = JSON.parse(req.body.policies || "[]"); } catch (_) {}
      next.policies = (Array.isArray(p) ? p : []).map(x => String(x).trim()).filter(Boolean).slice(0, 20);
    }
    if (req.file) {
      const old = next.photo;
      if (old && old.startsWith("candidates/")) { const oldPath = path.join(__dirname, "frontend/images", old); try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (_) {} }
      next.photo = `candidates/${req.file.filename}`;
    }
    candidateExtra[id] = next;
    saveExtra();
    res.json({ ok: true, message: "บันทึกการแก้ไขแล้ว" });
  } catch (err) { removeUploaded(req); res.status(500).json({ error: err.message }); }
});

// ═══════════════ ข่าวสาร / ประกาศ และ ข้อมูลหน้าเว็บ (เก็บผ่าน storage.js) ═══════════════
const ANN_FILE = "announcements.json", INFO_FILE = "site-info.json";
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
function uploadNewsImage(req, res, next) {
  uploadMem.single("image")(req, res, err => {
    if (err) return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "รูปใหญ่เกิน 3MB" : "อัปโหลดรูปไม่สำเร็จ" });
    next();
  });
}
function sniffImage(b) {                       // ตรวจชนิดรูปจากเนื้อไฟล์จริง ไม่เชื่อนามสกุลที่ผู้ใช้ส่งมา
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.slice(0, 4).toString() === "GIF8") return "gif";
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "webp";
  return null;
}
const cleanStr = (v, max) => String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max);
const isYMD = x => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
async function loadAnn() { const d = await dataStore.readJson(ANN_FILE, { items: [] }); return Array.isArray(d.items) ? d.items : []; }
const saveAnn = items => dataStore.writeJson(ANN_FILE, { items });
const publicAnn = i => ({ id: i.id, type: i.type, title: i.title, body: i.body || "", date: i.date, image: i.image ? "/media/" + i.image : null });
function readAnnFields(req, existing) {
  const type = req.body.type !== undefined ? cleanStr(req.body.type, 10) : (existing && existing.type) || "news";
  const title = req.body.title !== undefined ? cleanStr(req.body.title, 150) : (existing && existing.title) || "";
  const body = req.body.body !== undefined ? cleanStr(req.body.body, 4000) : (existing && existing.body) || "";
  const date = req.body.date !== undefined ? cleanStr(req.body.date, 10) : (existing && existing.date) || new Date().toISOString().slice(0, 10);
  if (type !== "news" && type !== "announce") return { error: "ประเภทต้องเป็น ข่าวสาร หรือ ประกาศสำคัญ" };
  if (!title) return { error: "กรุณากรอกหัวข้อ" };
  if (!isYMD(date)) return { error: "วันที่ไม่ถูกต้อง" };
  return { type, title, body, date };
}
function sortAnn(items) { return items.sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))); }

app.get("/api/announcements", async (req, res) => {
  try {
    let items = await loadAnn();
    if (req.query.type === "news" || req.query.type === "announce") items = items.filter(i => i.type === req.query.type);
    sortAnn(items);
    const limit = parseInt(req.query.limit); if (limit > 0) items = items.slice(0, Math.min(limit, 200));
    res.json({ items: items.map(publicAnn) });
  } catch (e) { res.json({ items: [], degraded: true }); }        // ที่เก็บข้อมูลมีปัญหา: หน้าเว็บยังเปิดได้ แค่ไม่มีข่าว
});
app.post("/api/admin/announcements", requireAdmin, uploadNewsImage, async (req, res) => {
  let imgName = null;
  try {
    const f = readAnnFields(req, null); if (f.error) return res.status(400).json({ error: f.error });
    const items = await loadAnn();
    if (items.length >= 200) return res.status(400).json({ error: "มีข่าวครบ 200 รายการแล้ว กรุณาลบรายการเก่าก่อน" });
    const id = newId(), item = { id, type: f.type, title: f.title, body: f.body, date: f.date, image: null, createdAt: new Date().toISOString() };
    if (req.file) {
      const ext = sniffImage(req.file.buffer); if (!ext) return res.status(400).json({ error: "รองรับเฉพาะไฟล์รูป JPG, PNG, GIF, WEBP" });
      imgName = `news-${id}.${ext}`; await dataStore.saveMedia(imgName, req.file.buffer); item.image = imgName;
    }
    items.push(item);
    try { await saveAnn(items); } catch (e) { if (imgName) dataStore.deleteMedia(imgName).catch(() => {}); throw e; }
    res.json({ ok: true, item: publicAnn(item), message: "เพิ่มข่าวแล้ว" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/admin/announcements/:id", requireAdmin, uploadNewsImage, async (req, res) => {
  try {
    const items = await loadAnn(); const idx = items.findIndex(i => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "ไม่พบรายการนี้" });
    const cur = items[idx], f = readAnnFields(req, cur); if (f.error) return res.status(400).json({ error: f.error });
    const next = Object.assign({}, cur, f); let newImg = null, dropOld = null;
    if (req.file) {
      const ext = sniffImage(req.file.buffer); if (!ext) return res.status(400).json({ error: "รองรับเฉพาะไฟล์รูป JPG, PNG, GIF, WEBP" });
      newImg = `news-${cur.id}-${Date.now().toString(36)}.${ext}`; await dataStore.saveMedia(newImg, req.file.buffer);
      dropOld = cur.image; next.image = newImg;
    } else if (req.body.removeImage === "true" && cur.image) { dropOld = cur.image; next.image = null; }
    items[idx] = next;
    try { await saveAnn(items); } catch (e) { if (newImg) dataStore.deleteMedia(newImg).catch(() => {}); throw e; }
    if (dropOld) dataStore.deleteMedia(dropOld).catch(() => {});
    res.json({ ok: true, item: publicAnn(next), message: "บันทึกการแก้ไขแล้ว" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/admin/announcements/:id", requireAdmin, async (req, res) => {
  try {
    const items = await loadAnn(); const idx = items.findIndex(i => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "ไม่พบรายการนี้" });
    const [gone] = items.splice(idx, 1); await saveAnn(items);
    if (gone.image) dataStore.deleteMedia(gone.image).catch(() => {});
    res.json({ ok: true, message: "ลบแล้ว" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/media/:name", async (req, res) => {
  try {
    const m = await dataStore.readMedia(req.params.name);
    if (!m) return res.status(404).end();
    res.set({ "Content-Type": m.contentType, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" }); res.send(m.buffer);
  } catch (e) { res.status(502).end(); }
});
// ข้อมูลหน้าเว็บ (ปี วันที่ เวลา ติดต่อ โซเชียล) ว่างได้ทุกช่อง ช่องที่ว่างหน้าเว็บจะซ่อนส่วนนั้น
const INFO_DEFAULT = { year: "", electionDate: "", electionTime: "", contactOrg: "", contactEmail: "", facebook: "", youtube: "", instagram: "", tagline: "" };
app.get("/api/site-info", async (req, res) => {
  try { res.json(Object.assign({}, INFO_DEFAULT, await dataStore.readJson(INFO_FILE, {}))); }
  catch (e) { res.json(Object.assign({}, INFO_DEFAULT)); }
});
app.put("/api/admin/site-info", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {}, out = {};
    const lim = { year: 12, electionDate: 60, electionTime: 60, contactOrg: 120, contactEmail: 120, tagline: 100, facebook: 300, youtube: 300, instagram: 300 };
    for (const k of Object.keys(lim)) out[k] = cleanStr(b[k], lim[k]);
    if (out.contactEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(out.contactEmail)) return res.status(400).json({ error: "รูปแบบอีเมลไม่ถูกต้อง" });
    for (const k of ["facebook", "youtube", "instagram"]) if (out[k] && !/^https?:\/\/[^\s<>"]+$/i.test(out[k])) return res.status(400).json({ error: `ลิงก์ ${k} ต้องขึ้นต้นด้วย http:// หรือ https://` });
    await dataStore.writeJson(INFO_FILE, out);
    res.json({ ok: true, message: "บันทึกข้อมูลหน้าเว็บแล้ว", info: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/admin/storage-status", requireAdmin, (req, res) => res.json(dataStore.status()));

// ตรวจสอบหมายเลขอ้างอิง (Transaction Hash) ว่าถูกบันทึกในระบบเลือกตั้งนี้จริงไหม
// ตอบเฉพาะ: พบหรือไม่ / บล็อกที่บันทึก / เวลา  — ไม่เปิดเผยว่าเลือกใคร หรืออีเมลของใคร
const verifyHits = new Map();
function verifyRateLimited(ip) {
  const now = Date.now(), arr = (verifyHits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); verifyHits.set(ip, arr);
  if (verifyHits.size > 5000) for (const [k, v] of verifyHits) if (!v.length || now - v[v.length - 1] > 60000) verifyHits.delete(k);
  return arr.length > 40;
}
app.get("/api/verify/:hash", async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (verifyRateLimited(ip)) return res.status(429).json({ error: "ตรวจสอบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" });
  if (!provider || !contract) return res.status(503).json({ error: "ระบบ Blockchain ยังไม่พร้อม" });
  const h = String(req.params.hash || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(h)) return res.status(400).json({ error: "หมายเลขอ้างอิงไม่ถูกต้อง ต้องขึ้นต้นด้วย 0x ตามด้วยตัวอักษร 64 ตัว" });
  try {
    const receipt = await provider.getTransactionReceipt(h);
    if (!receipt) return res.json({ found: false });
    const isElection = !!(receipt.to && contractAddress && receipt.to.toLowerCase() === contractAddress.toLowerCase());
    if (!isElection) return res.json({ found: true, isElection: false });
    let isVote = false;
    for (const log of receipt.logs) { try { const p = contract.interface.parseLog(log); if (p && p.name === "VoteCast") isVote = true; } catch (_) {} }
    const block = await provider.getBlock(receipt.blockNumber), latest = await provider.getBlockNumber();
    res.json({ found: true, isElection: true, isVote, success: receipt.status === 1, blockNumber: receipt.blockNumber,
               timestamp: block ? new Date(block.timestamp * 1000).toISOString() : null, confirmations: Math.max(0, latest - receipt.blockNumber + 1) });
  } catch (e) { res.status(500).json({ error: "ตรวจสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }); }
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
  loadSettings();
  await initBlockchain();
  setInterval(() => { checkAutoClose().catch(() => {}); }, 15000);   // ตรวจเวลาปิดรับคะแนนทุก 15 วินาที
  if (closingTime) console.log("⏰ เวลาปิดรับคะแนนที่ตั้งไว้:", closingTime);
  console.log("\n" + "═".repeat(50));
  console.log("  🗳️  UBU Election System 2570 (Blockchain)");
  console.log("  " + "─".repeat(46));
  console.log(`  URL  : http://127.0.0.1:${PORT}`);
  console.log("  Admin: admin / admin2570");
  console.log("═".repeat(50) + "\n");
});
