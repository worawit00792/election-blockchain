/**
 * main.js — UBU Election System 2570 (Blockchain Edition)
 */
'use strict';
/* ── Toast ──────────────────────────────────────────────── */
const Toast = (() => {
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  function show(msg, type='success') {
    let wrap = document.getElementById('toast-container');
    if (!wrap) { wrap = document.createElement('div'); wrap.className='toast-wrap'; wrap.id='toast-container'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span style="font-size:16px;font-weight:700">${icons[type]||'•'}</span><span>${msg}</span>`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }
  return { success: m=>show(m,'success'), error: m=>show(m,'error'), info: m=>show(m,'info') };
})();
/* ── API ────────────────────────────────────────────────── */
async function api(url, opts={}) {
  const res = await fetch(url, {
    headers: {'Content-Type':'application/json', ...opts.headers},
    credentials: 'same-origin', ...opts
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
/* ── ชุดสีและตัวช่วยกลาง (ใช้ร่วมกันทุกหน้า) ─────────────────
   แต่ละทีมมี 3 เฉดเสมอ: p = พื้นอ่อน (พื้นหลังรูป, ป้ายพรรค), a = สีสด (ป้ายหมายเลข, แถบ), d = สีเข้ม (ตัวหนังสือ, ปุ่มตอนวางเมาส์) */
const UBU_UI = (() => {
  const KIT = [
    { p:'#DCEBFF', a:'#2563eb', d:'#1d4ed8' },
    { p:'#FFE9B8', a:'#f59e0b', d:'#b45309' },
    { p:'#D3F5E3', a:'#10b981', d:'#047857' },
    { p:'#E6DCFF', a:'#7c3aed', d:'#6d28d9' },
  ];
  const CUT = [1, 2, 3, 4];                       // ผู้สมัครที่มีรูปตัดพื้นหลังเตรียมไว้แล้ว (images/cutout/)
  function mixW(hex, p) {
    const n = parseInt(String(hex).slice(1), 16), f = v => Math.round(v + (255 - v) * p);
    return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function teamKit(c) {
    const k = KIT[Number(c && c.id) - 1];
    if (k) return k;
    const col = /^#[0-9a-fA-F]{6}$/.test((c && c.color) || '') ? c.color : '#2563eb';   // ผู้สมัครที่เพิ่มใหม่ผ่านหน้า Admin
    return { p: mixW(col, .8), a: col, d: col };
  }
  function kitVars(k) { return `--tp:${k.p};--ta:${k.a};--td:${k.d};--tl:${mixW(k.p, .55)}`; }
  function hasCut(c) { return CUT.includes(Number(c && c.id)); }
  /* รูปในกรอบสี่เหลี่ยม: รูปตัดพื้นหลังกว้างเต็มกรอบ ตัวคนอยู่กึ่งกลางชิดขอบล่าง / ผู้สมัครใหม่ใช้รูปเดิมเต็มกรอบ */
  function photoImg(c) {
    if (hasCut(c)) return `<img src="/images/cutout/candidate-${c.id}.png" alt="${esc(c.name)}" style="position:absolute;left:0;bottom:0;width:100%;height:auto;display:block" onerror="this.style.display='none'">`;
    return c && c.photo ? `<img src="/images/${esc(c.photo)}" alt="${esc(c.name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top" onerror="this.style.display='none'">` : '';
  }
  /* รูปวงกลมบนพื้นอ่อนของทีม */
  function avatar(c, size, ring) {
    const k = teamKit(c);
    const img = hasCut(c)
      ? `<img src="/images/cutout/candidate-${c.id}.png" alt="" style="position:absolute;left:0;bottom:0;width:100%;height:auto">`
      : (c && c.photo ? `<img src="/images/${esc(c.photo)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top">` : '');
    return `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:radial-gradient(circle at 50% 36%,${mixW(k.p, .55)} 0%,${k.p} 74%);${ring ? `box-shadow:0 0 0 3px #fff,0 0 0 6px ${k.a}` : ''}">${img}</div>`;
  }
  const CROWN = '<svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true"><path d="M2 22 L5 6 L12 14 L17 2 L22 14 L29 6 L32 22 Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  /* นโยบายสำรองของ 4 ทีมหลัก (ใช้เมื่อข้อมูลจากเซิร์ฟเวอร์ยังว่าง) */
  const DEFAULT_POLICIES = {
  1:["WiFi ฟรีทั่วมหาวิทยาลัย","เพิ่มพื้นที่อ่านหนังสือ 24 ชม.","ลดค่าอาหารโรงอาหาร","พัฒนาระบบขนส่งภายในมหาลัย","เพิ่มทุนการศึกษาสำหรับนักศึกษาที่ขาดแคลน"],
  2:["ระบบ Smart Campus","App นักศึกษาอัจฉริยะ","ขยายเวลาห้องสมุดถึงเที่ยงคืน","พัฒนาพื้นที่ Co-Working Space","เพิ่มอุปกรณ์กีฬาและสันทนาการ"],
  3:["Green Campus ลดโลกร้อน","ศูนย์ดูแลสุขภาพนักศึกษา","สนามกีฬาและนันทนาการ","พัฒนาระบบรับเรื่องร้องเรียน","ส่งเสริมกิจกรรมวัฒนธรรมไทย"],
  4:["ระบบร้องเรียนออนไลน์","ตลาดนักศึกษา","กองทุนช่วยเหลือนักศึกษา","พัฒนาศูนย์แนะแนวอาชีพ","เพิ่มพื้นที่จอดรถนักศึกษา"]
};
  function policiesOf(c) {
    const fromServer = (c && Array.isArray(c.policies)) ? c.policies.filter(Boolean) : [];
    return fromServer.length ? fromServer : (DEFAULT_POLICIES[Number(c && c.id)] || []);
  }
  return { teamKit, kitVars, mixW, esc, hasCut, photoImg, avatar, policiesOf, CROWN };
})();
/* ── Navbar ─────────────────────────────────────────────── */
async function initNavbar() {
  const path = location.pathname;
  const nav = document.querySelector('.navbar');
  if (nav) window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>20),{passive:true});
  // เมนูมือถือ (แฮมเบอร์เกอร์)
  const toggleBtn = document.getElementById('nav-toggle');
  const navLinks   = document.getElementById('nav-links');
  const authBox    = document.getElementById('nav-auth');
  // ย้าย nav-auth เข้าไปในเมนูตอนจอเล็ก / ย้ายกลับตอนจอใหญ่
  function placeAuth() {
    if (!navLinks || !authBox) return;
    if (window.innerWidth <= 900) {
      if (authBox.parentElement !== navLinks) navLinks.appendChild(authBox);
    } else {
      const inner = document.querySelector('.navbar-inner');
      if (inner && authBox.parentElement !== inner) inner.appendChild(authBox);
    }
  }
  placeAuth();
  window.addEventListener('resize', placeAuth);
  if (toggleBtn && navLinks) {
    toggleBtn.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      toggleBtn.classList.toggle('open', open);
    });
    // ปิดเมนูอัตโนมัติเมื่อกดลิงก์ไหนก็ตาม
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      toggleBtn.classList.remove('open');
    }));
  }
  try {
    const me = await api('/api/me');
    const authEl = document.getElementById('nav-auth');
    if (!authEl) return;
    // Show blockchain link only for admin
    if (me.isAdmin) {
      document.querySelectorAll('.blockchain-link').forEach(el => el.style.display = '');
      document.querySelectorAll('#admin-nav-link').forEach(el => el.style.display = '');
    }
    // ปุ่ม "ลงคะแนนเลยตอนนี้" หน้า home — ถ้า login แล้วไปหน้าโหวตเลย ไม่ต้อง login ซ้ำ
    const heroBtn = document.getElementById('hero-vote-btn');
    if (heroBtn) heroBtn.href = me.loggedIn ? '/vote.html' : '/login.html?next=/vote.html';
    if (me.loggedIn) {
      authEl.innerHTML = `
        <div class="nav-user"><span class="nav-user-icon">👤</span><span class="nav-user-name">${me.name || me.email}</span></div>
        <a href="/vote.html" class="btn btn-primary btn-sm">ลงคะแนน</a>
        <button onclick="logout()" class="btn btn-sm" style="background:transparent;color:var(--g600);border:1.5px solid var(--g300)">ออกจากระบบ</button>`;
    } else {
      authEl.innerHTML = `
        <a href="/login.html" class="btn btn-sm" style="background:transparent;color:var(--navy);border:1.5px solid var(--g300)">เข้าสู่ระบบ</a>
        <a href="/login.html" class="btn btn-primary btn-sm">ลงทะเบียน</a>`;
    }
  } catch(e) {}
}
async function logout() {
  await api('/auth/logout',{method:'POST'}).catch(()=>{});
  location.href='/login.html';
}
/* ── Candidates ─────────────────────────────────────────── */
async function loadCandidates(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const { candidates } = await api('/api/candidates');
    container.innerHTML = candidates.map(c => {
      const k = UBU_UI.teamKit(c);
      return `
      <div class="cand-card" style="${UBU_UI.kitVars(k)}" onclick="location.href='/candidate_detail.html?id=${c.id}'">
        <div class="cand-photo">
          ${UBU_UI.photoImg(c)}
          <div class="cand-badge">หมายเลข ${c.id}</div>
          <div class="cand-arrow" aria-hidden="true">→</div>
        </div>
        <div class="cand-info">
          <div class="cand-name">${UBU_UI.esc(c.name)}</div>
          <div><span class="cand-party">${UBU_UI.esc(c.party)}</span></div>
          <p class="cand-slogan">"${UBU_UI.esc(c.slogan)}"</p>
          <button class="cand-btn" type="button">ดูรายละเอียด</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) { console.error(e); }
}
/* ── Vote ───────────────────────────────────────────────── */
let selectedCandidateId = null;
async function loadVoteCandidates() {
  const container = document.getElementById('vote-candidates');
  if (!container) return;
  try {
    const me = await api('/api/me');
    if (!me.loggedIn) { location.href='/login.html'; return; }
    if (me.hasVoted) {
      container.innerHTML = `
        <div style="text-align:center;padding:48px 40px;background:#fff;border-radius:var(--r-xl);border:2px solid var(--green);box-shadow:0 8px 32px rgba(16,185,129,.15)">
          <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 20px;box-shadow:0 4px 16px rgba(16,185,129,.3);color:#fff">✓</div>
          <h2 style="font-size:28px;font-weight:800;color:var(--navy);margin-bottom:8px">คุณได้ลงคะแนนแล้ว</h2>
          <p style="color:var(--g500);margin-bottom:8px">คะแนนของคุณถูกบันทึกเรียบร้อยแล้ว</p>
          <p style="color:var(--g400);font-size:13px;margin-bottom:28px">ไม่สามารถลงคะแนนซ้ำได้</p>
          <div style="display:flex;gap:12px;justify-content:center">
            <a href="/results.html" class="btn btn-primary btn-lg">ดูผลคะแนน →</a>
            <a href="/home.html" class="btn btn-ghost btn-lg">กลับหน้าหลัก</a>
          </div>
        </div>`;
      return;
    }
    const { candidates } = await api('/api/candidates');
    window._voteCandidates = candidates;
    container.className = 'vote-grid';
    container.setAttribute('role', 'radiogroup');
    container.setAttribute('aria-label', 'เลือกผู้สมัคร 1 คน');
    container.innerHTML = candidates.map(c => {
      const k = UBU_UI.teamKit(c);
      return `
      <div class="vote-card" id="vc-${c.id}" data-id="${c.id}" role="radio" aria-checked="false" tabindex="0"
           style="${UBU_UI.kitVars(k)}" onclick="selectCandidate(${c.id})" onkeydown="voteCardKey(event,${c.id})">
        <div class="vote-photo">
          ${UBU_UI.photoImg(c)}
          <div class="vote-badge">หมายเลข ${c.id}</div>
          <div class="vote-check" id="vcirc-${c.id}" aria-hidden="true"></div>
        </div>
        <div class="vote-info">
          <div class="vote-name">${UBU_UI.esc(c.name)}</div>
          <div><span class="cand-party">${UBU_UI.esc(c.party)}</span></div>
          <p class="vote-slogan">"${UBU_UI.esc(c.slogan)}"</p>
        </div>
      </div>`;
    }).join('');
  } catch(e) { console.error(e); }
}
function voteCardKey(e, id) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCandidate(id); }
}
function selectCandidate(id) {
  selectedCandidateId = id;
  document.querySelectorAll('.vote-card').forEach(card => {
    const sel = parseInt(card.dataset.id) === id;
    card.classList.toggle('selected', sel);
    card.setAttribute('aria-checked', sel ? 'true' : 'false');
    const chk = card.querySelector('.vote-check');
    if (chk) chk.textContent = sel ? '✓' : '';
  });
  showVoteBar(id);
}
/* ── แถบยืนยันด้านล่าง: โชว์ว่าเลือกใคร + ปุ่ม "กดค้างเพื่อยืนยัน" (กันกดพลาด) ── */
const VOTE_HOLD_MS = 1500;
function showVoteBar(id) {
  const c = (window._voteCandidates || []).find(x => x.id === id);
  if (!c) return;
  const k = UBU_UI.teamKit(c);
  let bar = document.getElementById('vote-bar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'vote-bar'; bar.className = 'vote-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'ยืนยันการลงคะแนน'); document.body.appendChild(bar); }
  bar.setAttribute('style', UBU_UI.kitVars(k));
  bar.innerHTML = `
    <div class="vb-who">
      ${UBU_UI.avatar(c, 46, true)}
      <div><div class="vb-label">คุณเลือก</div><div class="vb-name">หมายเลข ${c.id} ${UBU_UI.esc(c.name)}</div></div>
    </div>
    <div class="vb-note">คะแนนจะถูกบันทึกทันที · การลงคะแนนไม่สามารถเปลี่ยนแปลงได้ เมื่อบันทึกลงแล้ว</div>
    <button id="vote-hold-btn" class="vb-hold" type="button" aria-label="กดค้างเพื่อยืนยันการลงคะแนน (กดปุ่มนี้ค้างไว้ หรือกด Enter ค้างไว้)">
      <span class="vb-fill"></span><span class="vb-text">กดค้างเพื่อยืนยัน</span>
    </button>`;
  bindVoteHold(document.getElementById('vote-hold-btn'));
  requestAnimationFrame(() => bar.classList.add('show'));
  document.body.classList.add('has-vote-bar');
}
function bindVoteHold(btn) {
  const fill = btn.querySelector('.vb-fill'), txt = btn.querySelector('.vb-text');
  let raf = null, start = 0, active = false, fired = false;
  function frame(now) {
    if (!active) return;
    const p = Math.min(1, (now - start) / VOTE_HOLD_MS);
    fill.style.width = (p * 100) + '%';
    if (p >= 1) {
      active = false; fired = true; btn.disabled = true; txt.textContent = 'กำลังยืนยัน…';
      submitVote();
      return;
    }
    txt.textContent = 'กดค้างไว้…';
    raf = requestAnimationFrame(frame);
  }
  function begin(e) {
    if (fired || active) return;
    if (e.type === 'keydown' && (e.repeat || !(e.key === 'Enter' || e.key === ' '))) return;
    if (e.cancelable) e.preventDefault();
    active = true; start = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function end() {
    if (!active) return;
    active = false; cancelAnimationFrame(raf);
    fill.style.transition = 'width .25s'; fill.style.width = '0%';
    setTimeout(() => { fill.style.transition = ''; }, 260);
    txt.textContent = 'กดค้างเพื่อยืนยัน';
  }
  btn.addEventListener('pointerdown', begin);
  ['pointerup', 'pointerleave', 'pointercancel', 'blur', 'keyup'].forEach(t => btn.addEventListener(t, end));
  btn.addEventListener('keydown', begin);
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
/* ── อ่านข้อมูลผู้สมัครที่โหวต "ครั้งเดียว" แล้วลบทันที (ป้องกันดูซ้ำ/เป็นหลักฐานบังคับโหวต) ── */
function getVotedCandidateOnce() {
  try {
    const raw = sessionStorage.getItem('votedCandidateOnce');
    sessionStorage.removeItem('votedCandidateOnce'); // ★ ลบทันทีไม่ว่าจะอ่านสำเร็จหรือไม่ — รีเฟรช/เข้าใหม่จะไม่เจอแล้ว
    return raw ? JSON.parse(raw) : null;
  } catch(_) { return null; }
}

/* ── หน้าจอโหลดเต็มจอตอนกำลังยืนยันการลงคะแนน ───────────────── */
let _voteLoadingMsgInterval = null;
const VOTE_LOADING_MESSAGES = [
  'กำลังตรวจสอบสิทธิ์การลงคะแนน...',
  'กำลังบันทึกคะแนนของคุณ...',
  'กำลังยืนยันผลลัพธ์...',
  'ใกล้เสร็จแล้ว โปรดรอสักครู่...',
];
function showVoteLoadingOverlay() {
  let ov = document.getElementById('vote-loading-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'vote-loading-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:linear-gradient(135deg,var(--navy),#1e3a8a);display:flex;align-items:center;justify-content:center;flex-direction:column;padding:24px';
    ov.innerHTML = `
      <div style="width:64px;height:64px;border:4px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .9s linear infinite;margin-bottom:28px"></div>
      <div id="vote-loading-text" style="color:#fff;font-size:17px;font-weight:700;text-align:center;min-height:26px;transition:opacity .25s">${VOTE_LOADING_MESSAGES[0]}</div>
      <div style="width:220px;height:6px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;margin-top:20px">
        <div style="width:40%;height:100%;background:#60a5fa;border-radius:4px;animation:voteBarSlide 1.3s ease-in-out infinite"></div>
      </div>
      <div style="color:rgba(255,255,255,.4);font-size:13px;margin-top:18px">โปรดรอสักครู่ ระบบกำลังดำเนินการให้ปลอดภัยที่สุด</div>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes voteBarSlide { 0%{margin-left:-40%} 50%{margin-left:60%} 100%{margin-left:-40%} }
      </style>`;
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  let i = 0;
  const textEl = document.getElementById('vote-loading-text');
  _voteLoadingMsgInterval = setInterval(() => {
    i = (i + 1) % VOTE_LOADING_MESSAGES.length;
    if (!textEl) return;
    textEl.style.opacity = 0;
    setTimeout(() => { textEl.textContent = VOTE_LOADING_MESSAGES[i]; textEl.style.opacity = 1; }, 250);
  }, 2200);
}
function hideVoteLoadingOverlay(finalMessage) {
  clearInterval(_voteLoadingMsgInterval);
  const ov = document.getElementById('vote-loading-overlay');
  const textEl = document.getElementById('vote-loading-text');
  if (finalMessage && textEl) { textEl.style.opacity = 0; setTimeout(()=>{ textEl.textContent = finalMessage; textEl.style.opacity = 1; }, 250); }
  if (ov) setTimeout(() => { ov.style.display = 'none'; }, finalMessage ? 700 : 0);
}

const VOTE_LOADING_MIN_MS = 2600; // ★ เวลาขั้นต่ำที่หน้าโหลดต้องแสดง (กันโหลดเร็วเกินจนดูเหมือนไม่มีอะไรเกิดขึ้น)
async function submitVote() {
  if (!selectedCandidateId) return;
  const loadingStartedAt = Date.now(); // ★ จับเวลาเริ่มโหลด
  showVoteLoadingOverlay(); // ★ โชว์หน้าจอโหลดเต็มจอ แทนปุ่มค้างเฉยๆ ระหว่างรอ Blockchain ยืนยัน
  try {
    const d = await api('/api/vote',{method:'POST',body:JSON.stringify({candidateId:selectedCandidateId})});
    // ★ เก็บข้อมูลผู้สมัครที่เลือกไว้ "ชั่วคราว" ใน sessionStorage เพื่อโชว์ในหน้าถัดไปแค่ครั้งเดียว
    if (d.votedCandidate) {
      try { sessionStorage.setItem('votedCandidateOnce', JSON.stringify(d.votedCandidate)); } catch(_) {}
    }
    const elapsed = Date.now() - loadingStartedAt;
    const remain  = Math.max(0, VOTE_LOADING_MIN_MS - elapsed); // ★ ถ้าเสร็จเร็วกว่าเวลาขั้นต่ำ ให้รอเพิ่มจนครบ
    setTimeout(() => {
      hideVoteLoadingOverlay('✅ สำเร็จ! กำลังพาไปหน้าถัดไป...');
      setTimeout(()=>location.href=`/success.html?tx=${d.txHash}&block=${d.blockNumber}`,700);
    }, remain);
  } catch(err) {
    hideVoteLoadingOverlay();
    Toast.error(err.message);
    if (selectedCandidateId) showVoteBar(selectedCandidateId); // ★ สร้างปุ่มกดค้างใหม่ให้กดลองอีกครั้งได้
  }
}
/* ── Results ────────────────────────────────────────────── */
// ★★★ แก้ไขแล้ว: ระหว่างเปิดรับคะแนน โชว์แค่ยอดผู้ใช้สิทธิ์ ไม่โชว์คะแนนแยกผู้สมัคร ★★★
/* ── ตัวเลขนับไต่ขึ้น (Odometer/Count-up Animation) ─────────── */
function animateCountUp(elId, target, duration=900) {
  const el = document.getElementById(elId);
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic — ไวตอนแรก ช้าลงตอนใกล้จบ ดูเป็นธรรมชาติ
    const current = Math.round(start + (target - start) * eased);
    el.textContent = current.toLocaleString('th-TH');
    if (progress < 1) requestAnimationFrame(frame);
    else el.textContent = target.toLocaleString('th-TH');
  }
  requestAnimationFrame(frame);
}

/* ── LIVE: แสดงเวลาผ่านไปนับจากโหวตล่าสุด (อัปเดตทุกวินาที) ── */
let _liveAgoInterval = null;
function startLiveAgo(lastVoteAtISO, elId) {
  if (_liveAgoInterval) clearInterval(_liveAgoInterval);
  const el = document.getElementById(elId);
  if (!el) return;
  if (!lastVoteAtISO) { el.textContent = 'ยังไม่มีการลงคะแนน'; return; }

  function tick() {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(lastVoteAtISO).getTime()) / 1000));
    let text;
    if (diffSec < 60) text = `${diffSec} วินาทีที่แล้ว`;
    else if (diffSec < 3600) text = `${Math.floor(diffSec/60)} นาทีที่แล้ว`;
    else text = `${Math.floor(diffSec/3600)} ชั่วโมงที่แล้ว`;
    el.textContent = `โหวตล่าสุดเมื่อ ${text}`;
  }
  tick();
  _liveAgoInterval = setInterval(tick, 1000);
}

/* ── นับถอยหลังเวลาปิดรับคะแนน (Real-time Countdown) ───────── */
let _countdownInterval = null;
function startCountdown(closingTimeISO, elId) {
  if (_countdownInterval) clearInterval(_countdownInterval); // กันซ้อนถ้าเคยเรียกไว้ก่อน
  const el = document.getElementById(elId);
  if (!el || !closingTimeISO) return;

  function tick() {
    const now = new Date().getTime();
    const target = new Date(closingTimeISO).getTime();
    const diff = target - now;

    if (diff <= 0) {
      el.innerHTML = `<span>⏰ ปิดรับคะแนนแล้ว</span>`;
      clearInterval(_countdownInterval);
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const parts = [];
    if (d > 0) parts.push(`${d} วัน`);
    parts.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    el.textContent = parts.join(' ');
  }
  tick();
  _countdownInterval = setInterval(tick, 1000);
}

async function loadResults() {
  try {
    const { isOpen, totalVotes, totalVoters, lastVoteAt, closingTime } = await api('/api/stats');
    const container = document.getElementById('results-container');
    const tvEl = document.getElementById('total-votes');

    // ★ ช่องสถิติที่ 3 บนสุด — นับถอยหลังเวลาปิดรับคะแนน (โชว์ตลอด ไม่ว่า isOpen จะเป็นอะไร ถ้ามีการตั้งเวลาไว้)
    const topCountdownEl = document.getElementById('countdown-topbox');
    if (topCountdownEl && isOpen) {
      if (closingTime) startCountdown(closingTime, 'countdown-topbox');
      else topCountdownEl.textContent = 'ยังไม่กำหนด';
    }

    // ★ ระหว่างเปิดรับคะแนน — โชว์แค่ยอดผู้ใช้สิทธิ์ ไม่โชว์คะแนนแยกผู้สมัคร
    if (isOpen) {
      const voters = totalVoters || 2450;
      const pct = Math.min(100, Math.round((totalVotes / voters) * 100));
      if (container) {
        container.innerHTML = `
          <div style="text-align:center;padding:56px 32px;background:var(--g50);border-radius:16px">
            <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#1d4ed8);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 20px;color:#fff">🗳️</div>
            <h2 style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:8px">การเลือกตั้งกำลังดำเนินอยู่</h2>
            <p style="color:var(--g500);margin-bottom:4px;max-width:400px;margin-left:auto;margin-right:auto">เพื่อความยุติธรรมและป้องกันการชี้นำผู้ลงคะแนน ผลคะแนนจะประกาศให้ทราบหลังปิดรับคะแนนเท่านั้น</p>

            <div style="max-width:320px;margin:24px auto 0">
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--g500);margin-bottom:6px">
                <span>ผู้มาใช้สิทธิ์แล้ว</span><span>${pct}%</span>
              </div>
              <div style="height:10px;background:var(--g200);border-radius:6px;overflow:hidden">
                <div id="turnout-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#2563eb,#1d4ed8);border-radius:6px;transition:width 1.1s cubic-bezier(.25,.8,.25,1)"></div>
              </div>
            </div>

            <div style="margin-top:24px;font-size:40px;font-weight:900;color:var(--navy)" id="total-votes-odometer">0</div>
            <div style="font-size:13px;color:var(--g400)">คนมาใช้สิทธิ์แล้ว</div>

            <div class="badge-live" style="margin-top:16px;display:inline-flex">
              <span style="width:7px;height:7px;border-radius:50%;background:#34d399;flex-shrink:0"></span>
              <span id="live-ago-box">กำลังโหลด...</span>
            </div>
          </div>`;
        // สั่งขยับแถบ Progress Bar หลัง Paint เฟรมแรก ให้เห็น Animation วิ่งเข้า (ไม่ใช่โผล่มาเลยแบบไม่มีการเคลื่อนไหว)
        requestAnimationFrame(() => {
          const bar = document.getElementById('turnout-bar');
          if (bar) bar.style.width = pct + '%';
        });
        animateCountUp('total-votes-odometer', totalVotes);
        startLiveAgo(lastVoteAt, 'live-ago-box');
      }
      if (tvEl) tvEl.textContent = totalVotes;
      return; // ★ ออกจากฟังก์ชันเลย ไม่ไปดึง candidates มาโชว์คะแนน
    }

    // ── ปิดรับคะแนนแล้ว: แสดงผลแบบสนามแข่ง ──
    const { candidates } = await api('/api/candidates');
    renderClosedResults(candidates, totalVotes, totalVoters || 2450);
    if (tvEl) tvEl.textContent = totalVotes;
  } catch(e) { console.error(e); }
}
/* ── หน้าผลคะแนนหลังปิดรับ: แบบสนามแข่ง ───────────────────────── */
let _raceData = null;
function rankList(list) {
  const ranked = [...list].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
  let rank = 0, prev = null;
  ranked.forEach((c, i) => { const v = c.voteCount || 0; if (v !== prev) { rank = i + 1; prev = v; } c._rank = rank; });  // คะแนนเท่ากัน = อันดับเดียวกัน
  return ranked;
}
function renderClosedResults(candidates, totalVotes, totalVoters) {
  const container = document.getElementById('results-container');
  if (!container) return;
  const ranked = rankList(candidates);
  const total = ranked.reduce((s, c) => s + (c.voteCount || 0), 0);
  const turnout = totalVoters ? Math.min(100, total / totalVoters * 100) : 0;
  const badge = document.getElementById('res-badge'); if (badge) badge.textContent = 'ประกาศผลแล้ว';
  const l3 = document.getElementById('stat3-label'), v3 = document.getElementById('countdown-topbox');
  if (l3) l3.textContent = 'อัตราผู้มาใช้สิทธิ์';          // หลังปิดรับแล้ว ตัวนับถอยหลังไม่มีความหมาย
  if (v3) v3.textContent = turnout.toFixed(1) + '%';
  const title = document.getElementById('results-title'); if (title) title.textContent = 'อันดับคะแนน';
  const sub = document.getElementById('results-sub');
  if (total === 0) {
    if (sub) sub.textContent = '';
    container.innerHTML = `<div style="text-align:center;padding:48px 24px;background:var(--g50);border-radius:16px"><div style="font-size:20px;font-weight:800;color:var(--navy);margin-bottom:6px">ยังไม่มีผู้ลงคะแนน</div><p style="color:var(--g500);font-size:14px">การเลือกตั้งปิดรับคะแนนแล้ว แต่ไม่มีคะแนนที่ถูกบันทึกไว้</p></div>`;
    return;
  }
  const leaders = ranked.filter(c => c._rank === 1);
  const second = ranked.find(c => c._rank > 1);
  if (sub) {
    sub.textContent = leaders.length > 1
      ? `คะแนนเสมอกันที่อันดับ 1: ${leaders.map(c => c.name).join(' และ ')}`
      : `${leaders[0].name} นำอันดับ 2 อยู่ ${((leaders[0].voteCount || 0) - (second ? (second.voteCount || 0) : 0)).toLocaleString('th-TH')} คะแนน`;
  }
  _raceData = { ranked, total, turnout };
  const actions = document.getElementById('res-actions'); if (actions) actions.style.display = 'flex';
  container.innerHTML = raceDesktopHtml(ranked, total) + raceMobileHtml(ranked, total);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });   // แถบวิ่งจากศูนย์
  }));
  ranked.forEach(c => { animateCountUp('rv-' + c.id, c.voteCount || 0, 1100); animateCountUp('rvm-' + c.id, c.voteCount || 0, 1100); });
}
function raceDetailHtml(c, k) {
  const pol = UBU_UI.policiesOf(c).slice(0, 3);
  return `<div class="rd-in" style="background:${UBU_UI.mixW(k.p, .6)};border-color:${k.p}">
    <div class="rd-top">${UBU_UI.avatar(c, 72, false)}
      <div style="flex:1;min-width:0">
        <div class="rd-t">นโยบายเด่นของ${UBU_UI.esc(c.name)}</div>
        <div class="rd-chips">${pol.length ? pol.map(p => `<span style="border-color:${k.p}">${UBU_UI.esc(p)}</span>`).join('') : '<span class="muted">ยังไม่มีข้อมูลนโยบาย</span>'}</div>
      </div>
    </div>
    ${c.slogan ? `<p class="rd-slogan">"${UBU_UI.esc(c.slogan)}"</p>` : ''}
    <div class="rd-btns"><a class="btn btn-primary btn-sm" href="/candidate_detail.html?id=${c.id}">ดูนโยบายทั้งหมด →</a><a class="btn btn-ghost btn-sm" href="/blockchain.html">ตรวจสอบคะแนนที่บันทึกไว้</a></div>
  </div>`;
}
function raceDesktopHtml(ranked, total) {
  const maxV = Math.max(1, ranked[0].voteCount || 0);
  const leadersCount = ranked.filter(c => c._rank === 1).length;
  return `<div class="race-desktop">` + ranked.map(c => {
    const k = UBU_UI.teamKit(c), v = c.voteCount || 0, first = c._rank === 1;
    const w = Math.round(v / maxV * 62 * 10) / 10;
    const pct = total ? (v / total * 100).toFixed(1) : '0.0';
    const gap = first ? (leadersCount > 1 ? 'เสมอกัน' : 'ผู้นำ') : `ตามหลัง ${(maxV - v).toLocaleString('th-TH')}`;
    return `<div class="rl" data-rid="${c.id}" style="${UBU_UI.kitVars(k)}">
      <div class="rl-row" role="button" tabindex="0" aria-expanded="false" onclick="toggleRaceDetail(${c.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleRaceDetail(${c.id})}">
        <div class="rl-rank${first ? ' first' : ''}" aria-label="อันดับ ${c._rank}">${c._rank}</div>
        <div class="rl-track">
          <div class="rl-bar${first ? ' first' : ''}" data-w="${w}" style="width:0">
            <div class="rl-name"><div class="n">${UBU_UI.esc(c.name)}</div><div class="p">${UBU_UI.esc(c.party || '')}</div></div>
            <div class="rl-avatar">${first ? `<div class="rl-crown">${UBU_UI.CROWN}</div>` : ''}${UBU_UI.avatar(c, 96, true)}</div>
          </div>
          <div class="rl-num" style="left:calc(max(${w}%, 310px) + 30px)"><span class="v" id="rv-${c.id}">0</span><span class="pc">${pct}%</span><span class="gap">${gap}</span></div>
        </div>
        <div class="rl-chev" aria-hidden="true">⌄</div>
      </div>
      <div class="rl-detail">${raceDetailHtml(c, k)}</div>
    </div>`;
  }).join('') + `</div>`;
}
function raceMobileHtml(ranked, total) {
  const maxV = Math.max(1, ranked[0].voteCount || 0);
  return `<div class="race-mobile">` + ranked.map(c => {
    const k = UBU_UI.teamKit(c), v = c.voteCount || 0, first = c._rank === 1;
    const pct = total ? (v / total * 100).toFixed(1) : '0.0';
    return `<div class="rm${first ? ' first' : ''}" data-rid="${c.id}" style="${UBU_UI.kitVars(k)}">
      <div class="rm-row" role="button" tabindex="0" aria-expanded="false" onclick="toggleRaceDetail(${c.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleRaceDetail(${c.id})}">
        <div class="rm-av">${UBU_UI.avatar(c, 64, true)}<span class="rm-rank" aria-label="อันดับ ${c._rank}">${c._rank}</span></div>
        <div class="rm-mid"><div class="n">${UBU_UI.esc(c.name)}</div><div class="p">${UBU_UI.esc(c.party || '')}</div></div>
        <div class="rm-val"><div class="v" id="rvm-${c.id}">0</div><div class="pc">${pct}%</div></div>
      </div>
      <div class="rm-bar"><div data-w="${Math.round(v / maxV * 100)}" style="width:0"></div></div>
      <div class="rl-detail">${raceDetailHtml(c, k)}</div>
    </div>`;
  }).join('') + `</div>`;
}
function toggleRaceDetail(id) {
  document.querySelectorAll(`[data-rid="${id}"]`).forEach(el => {
    const open = el.classList.toggle('open');
    const row = el.querySelector('[role="button"]');
    if (row) row.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

/* ── โหมดประกาศผล (เต็มจอ ใช้ฉายขึ้นจอใหญ่ในวันประกาศผล) ────────── */
function openAnnounce() {
  if (!_raceData) return;
  const { ranked, total } = _raceData;
  const groups = [];
  ranked.forEach(c => { let g = groups.find(x => x.rank === c._rank); if (!g) { g = { rank: c._rank, teams: [] }; groups.push(g); } g.teams.push(c); });
  groups.reverse();                                                       // เปิดผลจากอันดับท้ายขึ้นไปอันดับ 1
  const steps = [{ type: 'intro' }, ...groups.map(g => ({ type: g.rank === 1 ? 'winner' : 'rank', g }))];
  let i = 0, autoTimer = null;
  const ov = document.createElement('div');
  ov.className = 'ann'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'โหมดประกาศผล');
  ov.innerHTML = `
    <div class="ann-top"><div class="ann-brand"><img src="/images/ubu-logo.png" alt="" style="height:42px"><div><div style="font-weight:800;font-size:16px">ประกาศผลการเลือกตั้งสภานักศึกษา</div><div style="font-size:12px;opacity:.6">มหาวิทยาลัยอุบลราชธานี 2570</div></div></div><div class="ann-dots" id="ann-dots"></div><button class="ann-x" id="ann-close" type="button" aria-label="ปิดโหมดประกาศผล">✕</button></div>
    <div class="ann-stage" id="ann-stage"></div>
    <div class="ann-ctl"><button class="ann-btn" id="ann-prev" type="button">◀ ก่อนหน้า</button><button class="ann-btn primary" id="ann-next" type="button">ถัดไป ▶</button><button class="ann-btn" id="ann-auto" type="button">เล่นอัตโนมัติ</button><button class="ann-btn" id="ann-full" type="button">เต็มจอ</button></div>`;
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  const stage = ov.querySelector('#ann-stage'), dots = ov.querySelector('#ann-dots');
  const teamHtml = (c, size) => `<div class="ann-team">${UBU_UI.avatar(c, size, true)}<div class="ann-tn">${UBU_UI.esc(c.name)}</div><div class="ann-tv"><span id="ann-v-${c.id}">0</span> <small>คะแนน · ${total ? (((c.voteCount || 0) / total) * 100).toFixed(1) : '0.0'}%</small></div></div>`;
  function confetti() {
    const cols = ['#2563eb', '#f59e0b', '#10b981', '#7c3aed', '#ef4444', '#ffffff'];
    let h = '';
    for (let n = 0; n < 70; n++) h += `<div class="ann-conf" style="left:${Math.random() * 100}%;width:${6 + Math.random() * 7}px;height:${8 + Math.random() * 10}px;background:${cols[n % cols.length]};animation-duration:${4 + Math.random() * 5}s;animation-delay:${-Math.random() * 6}s"></div>`;
    return h;
  }
  function render() {
    const s = steps[i];
    dots.innerHTML = steps.slice(1).map((_, n) => `<span class="${n < i ? 'done' : (n === i - 1 ? 'cur' : '')}"></span>`).join('');
    if (s.type === 'intro') {
      stage.innerHTML = `<div class="ann-pop"><div style="font-size:clamp(28px,5vw,56px);font-weight:800">ประกาศผลการเลือกตั้ง</div><div style="font-size:clamp(16px,2vw,24px);opacity:.75;margin-top:10px">ผู้มาใช้สิทธิ์ ${total.toLocaleString('th-TH')} คน</div><div style="margin-top:28px;font-size:15px;opacity:.6">กด "ถัดไป" หรือปุ่มลูกศรขวา เพื่อเริ่มประกาศ</div></div>`;
    } else if (s.type === 'rank') {
      stage.innerHTML = `<div class="ann-pop"><div class="ann-badge">อันดับ ${s.g.rank}</div><div class="ann-row">${s.g.teams.map(c => teamHtml(c, 190)).join('')}</div></div>`;
      s.g.teams.forEach(c => animateCountUp('ann-v-' + c.id, c.voteCount || 0, 1300));
    } else {
      const tie = s.g.teams.length > 1;
      const others = ranked.filter(c => c._rank !== 1);
      stage.innerHTML = `<div class="ann-conf-wrap">${confetti()}</div><div class="ann-pop"><div class="ann-badge gold">${UBU_UI.CROWN}${tie ? 'คะแนนเสมอกัน' : 'ผู้ชนะการเลือกตั้ง'}</div><div class="ann-row">${s.g.teams.map(c => teamHtml(c, tie ? 220 : 300)).join('')}</div></div>
        <div class="ann-others">${others.map(c => `<div class="ann-chip">${UBU_UI.avatar(c, 44, false)}<div><small>อันดับ ${c._rank}</small><div style="font-weight:800">${UBU_UI.esc(c.name)}</div></div><b>${(c.voteCount || 0).toLocaleString('th-TH')}</b></div>`).join('')}</div>`;
      s.g.teams.forEach(c => animateCountUp('ann-v-' + c.id, c.voteCount || 0, 1600));
    }
    ov.querySelector('#ann-prev').disabled = i === 0;
    ov.querySelector('#ann-next').disabled = i === steps.length - 1;
  }
  function go(d) { const n = Math.min(steps.length - 1, Math.max(0, i + d)); if (n !== i) { i = n; render(); } if (i === steps.length - 1) stopAuto(); }
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; ov.querySelector('#ann-auto').textContent = 'เล่นอัตโนมัติ'; } }
  function close() { stopAuto(); document.removeEventListener('keydown', onKey); ov.remove(); document.body.style.overflow = ''; if (document.fullscreenElement) { try { document.exitFullscreen(); } catch(_) {} } }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  }
  ov.querySelector('#ann-next').onclick = () => go(1);
  ov.querySelector('#ann-prev').onclick = () => go(-1);
  ov.querySelector('#ann-close').onclick = close;
  ov.querySelector('#ann-auto').onclick = () => {
    if (autoTimer) { stopAuto(); return; }
    ov.querySelector('#ann-auto').textContent = 'หยุดเล่น';
    autoTimer = setInterval(() => go(1), 3800);
  };
  ov.querySelector('#ann-full').onclick = () => { try { (ov.requestFullscreen || document.documentElement.requestFullscreen).call(ov.requestFullscreen ? ov : document.documentElement); } catch(_) {} };
  document.addEventListener('keydown', onKey);
  render();
}

/* ── แชร์ผลเป็นภาพ (สร้างภาพในเบราว์เซอร์ ไม่ส่งข้อมูลไปไหน) ───────── */
async function shareResultImage() {
  if (!_raceData) return;
  const { ranked, total, turnout } = _raceData;
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const FONT = '"Noto Sans Thai","Sarabun",sans-serif';
  try { await document.fonts.load(`800 60px ${FONT}`); await document.fonts.load(`400 30px ${FONT}`); } catch(_) {}
  const loadImg = src => new Promise(res => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e3a8a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = `800 56px ${FONT}`; g.fillText('ผลการเลือกตั้งสภานักศึกษา', W / 2, 120);
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `400 32px ${FONT}`; g.fillText('มหาวิทยาลัยอุบลราชธานี 2570', W / 2, 170);
  async function drawAvatar(c, cx, cy, r) {
    const k = UBU_UI.teamKit(c);
    g.save();
    g.beginPath(); g.arc(cx, cy, r + 12, 0, Math.PI * 2); g.fillStyle = k.a; g.fill();
    g.beginPath(); g.arc(cx, cy, r + 5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    const grd = g.createRadialGradient(cx, cy - r * .28, r * .1, cx, cy, r); grd.addColorStop(0, UBU_UI.mixW(k.p, .55)); grd.addColorStop(1, k.p);
    g.fillStyle = grd; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    const im = await loadImg(UBU_UI.hasCut(c) ? `/images/cutout/candidate-${c.id}.png` : (c.photo ? `/images/${c.photo}` : ''));
    if (im) { const w = 2 * r, h = w * im.height / im.width; g.drawImage(im, cx - r, cy + r - h, w, h); }
    g.restore();
  }
  const leaders = ranked.filter(c => c._rank === 1), tie = leaders.length > 1;
  const shown = leaders.slice(0, 2);
  const R = shown.length === 1 ? 250 : 180, cy = 560;
  for (let n = 0; n < shown.length; n++) await drawAvatar(shown[n], shown.length === 1 ? W / 2 : W * (n + 1) / 3, cy, R);
  g.fillStyle = '#fde68a'; g.font = `800 36px ${FONT}`; g.fillText(tie ? 'คะแนนเสมอกัน' : 'ผู้ชนะการเลือกตั้ง', W / 2, 270);
  g.fillStyle = '#fff';
  if (shown.length === 1) {
    g.font = `800 72px ${FONT}`; g.fillText(shown[0].name, W / 2, 900);
    g.fillStyle = '#93c5fd'; g.font = `800 58px ${FONT}`;
    g.fillText(`${(shown[0].voteCount || 0).toLocaleString('th-TH')} คะแนน · ${(((shown[0].voteCount || 0) / total) * 100).toFixed(1)}%`, W / 2, 985);
  } else {
    g.font = `800 50px ${FONT}`; shown.forEach((c, n) => g.fillText(c.name, W * (n + 1) / 3, 850));
    g.fillStyle = '#93c5fd'; g.font = `800 50px ${FONT}`; shown.forEach((c, n) => g.fillText((c.voteCount || 0).toLocaleString('th-TH') + ' คะแนน', W * (n + 1) / 3, 925));
  }
  const others = ranked.filter(c => c._rank !== 1).slice(0, 3);
  for (let n = 0; n < others.length; n++) {
    const cx = W * (n + .5) / others.length, c = others[n];
    await drawAvatar(c, cx, 1110, 56);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `400 24px ${FONT}`; g.fillText('อันดับ ' + c._rank, cx, 1205);
    g.fillStyle = '#fff'; g.font = `800 30px ${FONT}`; g.fillText(c.name, cx, 1243);
    g.fillStyle = '#93c5fd'; g.font = `800 34px ${FONT}`; g.fillText((c.voteCount || 0).toLocaleString('th-TH'), cx, 1288);
  }
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `400 24px ${FONT}`;
  g.fillText(`ผู้มาใช้สิทธิ์ ${total.toLocaleString('th-TH')} คน (${turnout.toFixed(1)}%)`, W / 2, 1330);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  if (!blob) { Toast.error('สร้างภาพไม่สำเร็จ'); return; }
  const file = new File([blob], 'ผลการเลือกตั้ง.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'ผลการเลือกตั้งสภานักศึกษา' }); return; } catch(e) { if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ผลการเลือกตั้ง.png';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  Toast.success('บันทึกภาพผลคะแนนแล้ว');
}
/* ── Blockchain ─────────────────────────────────────────── */
async function loadBlockchain() {
  try {
    const { blocks, contractAddress } = await api('/api/blockchain');
    const container = document.getElementById('blocks-container');
    if (!container) return;
    if (contractAddress) {
      const addrEl = document.getElementById('contract-address');
      if (addrEl) addrEl.textContent = contractAddress;
    }
    container.innerHTML = blocks.map(b => `
      <div style="background:var(--navy-mid);border:1px solid rgba(37,99,235,.22);border-radius:var(--r-lg);padding:24px 28px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:16px">
          <span style="background:rgba(37,99,235,.18);color:var(--blue-glow);font-size:13px;font-weight:700;padding:5px 14px;border-radius:7px">Block #${b.number}</span>
          <span style="color:rgba(255,255,255,.3);font-size:12px">${b.timestamp}</span>
        </div>
        <div style="margin-bottom:10px">
          <div style="color:rgba(255,255,255,.3);font-size:10px;margin-bottom:5px">Block Hash</div>
          <div style="font-family:monospace;font-size:11px;word-break:break-all;padding:9px 14px;border-radius:6px;background:rgba(16,185,129,.07);color:#34d399">${b.hash}</div>
        </div>
        <div>
          <div style="color:rgba(255,255,255,.3);font-size:10px;margin-bottom:5px">Parent Hash</div>
          <div style="font-family:monospace;font-size:11px;word-break:break-all;padding:9px 14px;border-radius:6px;background:rgba(37,99,235,.08);color:var(--blue-glow)">${b.parentHash}</div>
        </div>
        <div style="margin-top:10px;color:rgba(255,255,255,.4);font-size:13px">Transactions: ${b.txCount}</div>
      </div>`
    ).join('');
  } catch(e) { console.error(e); }
}
/* ── Modal ──────────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); document.body.style.overflow=''; }
document.addEventListener('click',e=>{ if(e.target.classList.contains('modal-overlay')) closeModal(e.target.id); });
/* ── DOMContentLoaded ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  const page = document.body.dataset.page;
  if (page==='home')       loadCandidates('candidates-grid');
  if (page==='candidates') loadCandidates('candidates-grid');
  if (page==='vote')       loadVoteCandidates();
  if (page==='results')    loadResults();
  if (page==='blockchain') loadBlockchain();
});
Object.assign(window,{ selectCandidate, voteCardKey, submitVote, openModal, closeModal, logout, Toast, toggleRaceDetail, openAnnounce, shareResultImage });
