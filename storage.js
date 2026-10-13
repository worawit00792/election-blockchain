/* storage.js — ที่เก็บข้อมูลที่ต้องไม่หาย (ข่าวสาร / ข้อมูลหน้าเว็บ / รูปประกอบข่าว)

   มี 2 โหมด เลือกอัตโนมัติจากตัวแปร Environment:
   1) ไฟล์ในเครื่อง (ค่าเริ่มต้น)  → เก็บที่โฟลเดอร์ data/  ใช้ตอนทดลองในเครื่อง
        ⚠ บน Render แผนฟรี ไฟล์ที่เขียนตอนรันจะหายเมื่อรีสตาร์ท/Deploy ใหม่
   2) GitHub Repo ข้อมูล            → เก็บเป็นไฟล์ใน Repo ที่คุณสร้างไว้ (ถาวร มีประวัติย้อนดูได้ ไม่ทำให้ Render รีสตาร์ท)
        ตั้งตัวแปร:  GITHUB_DATA_REPO=ชื่อบัญชี/ชื่อrepo   GITHUB_DATA_TOKEN=โทเคน (สิทธิ์ Contents: Read and write เฉพาะ repo นั้น)
                      GITHUB_DATA_BRANCH=main (ไม่ใส่ก็ได้)
*/
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");          // โหมดไฟล์: เก็บรูปที่นี่ / โหมด GitHub: ใช้เป็นแคชในเครื่อง
const GH = {
  repo:   (process.env.GITHUB_DATA_REPO || "").trim(),
  token:  (process.env.GITHUB_DATA_TOKEN || "").trim(),
  branch: (process.env.GITHUB_DATA_BRANCH || "main").trim(),
  api:    (process.env.GITHUB_API_BASE || "https://api.github.com").replace(/\/$/, ""),
};
const useGithub = !!(GH.repo && GH.token);
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const SAFE_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const CACHE_MS = 15000;
const cache = new Map();                 // ชื่อไฟล์ -> { at, data }
let queue = Promise.resolve();           // เขียนทีละงาน กันชนกัน
const enqueue = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

function status() {
  return { backend: useGithub ? "github" : "local", persistent: useGithub, repo: useGithub ? GH.repo : null, branch: useGithub ? GH.branch : null };
}

// ── เรียก GitHub API (ใช้โมดูล https ธรรมดา ไม่พึ่งเวอร์ชัน Node) ──
function ghRequest(method, pathname, body, accept) {
  return new Promise((resolve, reject) => {
    const u = new URL(GH.api + pathname);
    const lib = u.protocol === "http:" ? http : https;
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = lib.request({
      method, hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, timeout: 20000,
      headers: Object.assign({
        "Authorization": "Bearer " + GH.token, "User-Agent": "ubu-election",
        "Accept": accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      }, data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}),
    }, res => {
      const chunks = []; res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on("timeout", () => req.destroy(new Error("หมดเวลารอ GitHub")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
const contentsPath = p => `/repos/${GH.repo}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;
const fail = (what, r) => new Error(`${what} (GitHub HTTP ${r.status}${r.status === 401 || r.status === 403 ? " — ตรวจโทเคนและสิทธิ์ของ Repo ข้อมูล" : r.status === 404 ? " — ตรวจชื่อ Repo และ Branch" : ""})`);

async function ghGetSha(p) {
  const r = await ghRequest("GET", `${contentsPath(p)}?ref=${encodeURIComponent(GH.branch)}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw fail("อ่านข้อมูลจากที่เก็บถาวรไม่สำเร็จ", r);
  return JSON.parse(r.body.toString()).sha;
}
async function ghPut(p, buf, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const sha = await ghGetSha(p);
    const r = await ghRequest("PUT", contentsPath(p), Object.assign({ message, content: buf.toString("base64"), branch: GH.branch }, sha ? { sha } : {}));
    if (r.status === 200 || r.status === 201) return;
    if (r.status === 409 || r.status === 422) continue;       // ไฟล์ถูกแก้ระหว่างทาง ลองใหม่ด้วย sha ล่าสุด
    throw fail("บันทึกลงที่เก็บถาวรไม่สำเร็จ", r);
  }
  throw new Error("บันทึกลงที่เก็บถาวรไม่สำเร็จ (ไฟล์ถูกแก้ซ้อนกันหลายครั้ง ลองใหม่อีกครั้ง)");
}
async function ghDelete(p, message) {
  const sha = await ghGetSha(p);
  if (!sha) return;
  const r = await ghRequest("DELETE", contentsPath(p), { message, sha, branch: GH.branch });
  if (r.status !== 200) throw fail("ลบไฟล์จากที่เก็บถาวรไม่สำเร็จ", r);
}

// ── JSON ──
async function readJson(name, fallback) {
  if (!SAFE_NAME.test(name)) throw new Error("ชื่อไฟล์ไม่ถูกต้อง");
  if (!useGithub) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8")); } catch (_) { return fallback; }
  }
  const c = cache.get(name);
  if (c && Date.now() - c.at < CACHE_MS) return JSON.parse(JSON.stringify(c.data));
  try {
    const r = await ghRequest("GET", `${contentsPath(name)}?ref=${encodeURIComponent(GH.branch)}`, null, "application/vnd.github.raw+json");
    let data = fallback;
    if (r.status === 200) data = JSON.parse(r.body.toString("utf8"));
    else if (r.status !== 404) throw fail("อ่านข้อมูลจากที่เก็บถาวรไม่สำเร็จ", r);
    cache.set(name, { at: Date.now(), data });
    return JSON.parse(JSON.stringify(data));
  } catch (e) {
    if (c) return JSON.parse(JSON.stringify(c.data));          // ใช้ข้อมูลเก่าที่เคยอ่านได้ ถ้า GitHub ล่มชั่วคราว
    throw e;
  }
}
function writeJson(name, obj) {
  if (!SAFE_NAME.test(name)) return Promise.reject(new Error("ชื่อไฟล์ไม่ถูกต้อง"));
  const buf = Buffer.from(JSON.stringify(obj, null, 2));
  return enqueue(async () => {
    if (!useGithub) {
      const tmp = path.join(DATA_DIR, name + ".tmp");
      fs.writeFileSync(tmp, buf); fs.renameSync(tmp, path.join(DATA_DIR, name));
      return;
    }
    await ghPut(name, buf, `อัปเดต ${name}`);
    cache.set(name, { at: Date.now(), data: JSON.parse(buf.toString()) });
  });
}

// ── รูปภาพ ──
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
const mimeOf = n => MIME[(n.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
function saveMedia(name, buf) {
  if (!SAFE_NAME.test(name)) return Promise.reject(new Error("ชื่อไฟล์ไม่ถูกต้อง"));
  return enqueue(async () => {
    const local = path.join(MEDIA_DIR, name);
    fs.writeFileSync(local, buf);                               // เก็บในเครื่องไว้ก่อนเสมอ (โหมด GitHub = แคช)
    if (useGithub) {
      try { await ghPut("media/" + name, buf, `เพิ่มรูป ${name}`); }
      catch (e) { try { fs.unlinkSync(local); } catch (_) {} throw e; }   // บันทึกลงที่เก็บถาวรไม่สำเร็จ → ไม่ทิ้งรูปค้างในเครื่อง
    }
  });
}
function deleteMedia(name) {
  if (!SAFE_NAME.test(name)) return Promise.resolve();
  return enqueue(async () => {
    try { fs.unlinkSync(path.join(MEDIA_DIR, name)); } catch (_) {}
    if (useGithub) await ghDelete("media/" + name, `ลบรูป ${name}`);
  });
}
async function readMedia(name) {
  if (!SAFE_NAME.test(name)) return null;
  const local = path.join(MEDIA_DIR, name);
  if (fs.existsSync(local)) return { buffer: fs.readFileSync(local), contentType: mimeOf(name) };
  if (!useGithub) return null;
  const r = await ghRequest("GET", `${contentsPath("media/" + name)}?ref=${encodeURIComponent(GH.branch)}`, null, "application/vnd.github.raw+json");
  if (r.status === 404) return null;
  if (r.status !== 200) throw fail("อ่านรูปจากที่เก็บถาวรไม่สำเร็จ", r);
  try { fs.writeFileSync(local, r.body); } catch (_) {}          // เก็บแคชไว้ ครั้งต่อไปไม่ต้องดึงซ้ำ
  return { buffer: r.body, contentType: mimeOf(name) };
}

module.exports = { status, readJson, writeJson, saveMedia, deleteMedia, readMedia, mimeOf };
