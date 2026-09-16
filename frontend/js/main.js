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
    const COLORS = ["#2563eb","#f59e0b","#10b981","#7c3aed"];
    const PHOTOS = ["candidate-1.png","candidate-2.png","candidate-3.png","candidate-4.png"];
    container.innerHTML = candidates.map((c,i) => {
      const col = COLORS[i] || c.color;
      return `
      <div style="background:#fff;border:1px solid var(--g200);border-radius:var(--r-lg);overflow:hidden;cursor:pointer;transition:all .25s;display:flex;flex-direction:column"
           onclick="location.href='/candidate_detail.html?id=${c.id}'"
           onmouseover="this.style.transform='translateY(-5px)';this.style.boxShadow='0 16px 48px rgba(0,0,0,.15)'"
           onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="position:relative;height:220px;overflow:hidden">
          <img src="/images/${PHOTOS[i]}" alt="${c.name}" style="width:100%;height:100%;object-fit:cover;object-position:center top" onerror="this.style.display='none'">
          <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:linear-gradient(to top,rgba(0,0,0,.5),transparent)"></div>
          <div style="position:absolute;top:12px;left:12px;width:40px;height:40px;border-radius:10px;background:${col};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff">${c.id}</div>
          <div style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,.9);color:#333;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px">${c.party}</div>
        </div>
        <div style="padding:16px 18px;flex:1;display:flex;flex-direction:column">
          <div style="font-size:38px;font-weight:900;color:${col};line-height:1;margin-bottom:2px">${c.id}</div>
          <div style="font-size:18px;font-weight:800;color:var(--navy);margin-bottom:4px">${c.name}</div>
          <p style="font-size:12px;color:var(--g500);flex:1">"${c.slogan}"</p>
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--g100)">
            <button style="width:100%;padding:10px;border-radius:var(--r-md);font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;background:transparent;border:1.5px solid ${col};color:${col};transition:all .25s"
                    onmouseover="this.style.background='${col}';this.style.color='#fff'"
                    onmouseout="this.style.background='transparent';this.style.color='${col}'">
              ดูรายละเอียด →
            </button>
          </div>
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
          <p style="color:var(--g500);margin-bottom:8px">คะแนนของคุณถูกบันทึกบน Blockchain เรียบร้อยแล้ว</p>
          <p style="color:var(--g400);font-size:13px;margin-bottom:28px">ไม่สามารถลงคะแนนซ้ำได้</p>
          <div style="display:flex;gap:12px;justify-content:center">
            <a href="/results.html" class="btn btn-primary btn-lg">ดูผลคะแนน →</a>
            <a href="/home.html" class="btn btn-ghost btn-lg">กลับหน้าหลัก</a>
          </div>
        </div>`;
      return;
    }
    const { candidates } = await api('/api/candidates');
    const COLORS = ["#2563eb","#f59e0b","#10b981","#7c3aed"];
    const PHOTOS = ["candidate-1.png","candidate-2.png","candidate-3.png","candidate-4.png"];
    container.innerHTML = candidates.map((c,i) => `
      <div class="vote-card" id="vc-${c.id}" data-id="${c.id}" onclick="selectCandidate(${c.id})"
           style="background:#fff;border:2px solid var(--g200);border-radius:var(--r-lg);padding:20px;cursor:pointer;transition:all .25s;display:flex;align-items:center;gap:16px">
        <img src="/images/${PHOTOS[i]}" style="width:80px;height:80px;object-fit:cover;border-radius:10px" onerror="this.style.display='none'">
        <div style="flex:1">
          <div style="font-size:28px;font-weight:900;color:${COLORS[i]}">เบอร์ ${c.id}</div>
          <h3 style="font-size:18px;font-weight:800;margin-bottom:4px">${c.name}</h3>
          <span style="background:rgba(0,0,0,.06);font-size:12px;font-weight:700;padding:3px 10px;border-radius:12px">${c.party}</span>
          <p style="font-size:13px;color:var(--g500);margin-top:6px">"${c.slogan}"</p>
        </div>
        <div class="vote-circle" id="vcirc-${c.id}" style="width:28px;height:28px;border-radius:50%;border:2px solid var(--g300);flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .25s"></div>
      </div>`).join('');
  } catch(e) { console.error(e); }
}
function selectCandidate(id) {
  const COLORS = ["#2563eb","#f59e0b","#10b981","#7c3aed"];
  selectedCandidateId = id;
  document.querySelectorAll('.vote-card').forEach(c => {
    const sel = parseInt(c.dataset.id) === id;
    const col = COLORS[parseInt(c.dataset.id)-1];
    c.style.borderColor = sel ? col : 'var(--g200)';
    c.style.background  = sel ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#fff';
    const circle = c.querySelector('.vote-circle');
    if (circle) { circle.textContent = sel?'✓':''; circle.style.background=sel?col:''; circle.style.borderColor=sel?col:'var(--g300)'; circle.style.color=sel?'#fff':''; }
  });
  const btn = document.getElementById('vote-submit-btn');
  if (btn) { btn.disabled=false; btn.style.opacity='1'; }
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
  closeModal('vote-modal');
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
    const btn = document.getElementById('m-confirm-btn');
    if (btn) { btn.disabled=false; btn.textContent='ยืนยันการลงคะแนน ✓'; }
  }
}
function openVoteConfirm() {
  if (!selectedCandidateId) return;
  document.getElementById('vote-modal')?.classList.add('open');
  document.body.style.overflow='hidden';
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
      el.innerHTML = `<span style="color:#ef4444">⏰ ปิดรับคะแนนแล้ว</span>`;
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
    if (topCountdownEl) {
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

    // ── ปิดรับคะแนนแล้ว: โชว์ผลเต็มแบบเดิมทุกอย่าง ──
    const { candidates } = await api('/api/candidates');
    const total = totalVotes || 1;
    const sorted = [...candidates].sort((a,b) => b.voteCount - a.voteCount);
    if (container) {
      container.innerHTML = sorted.map((c,i) => {
        const rank = i + 1;
        const pct = Math.round(c.voteCount/total*100);
        const isTop = rank === 1;
        const policies = (c.policies||[]).slice(0,4);
        return `
        <div style="border-radius:12px;background:${isTop?'var(--bg-warning,#fef3c7)':'var(--g50)'};overflow:hidden;margin-bottom:10px">
          <div onclick="const d=document.getElementById('rdetail-${c.id}');const a=document.getElementById('rarrow-${c.id}');const open=d.style.display!=='none';d.style.display=open?'none':'block';a.style.transform=open?'rotate(0deg)':'rotate(180deg)';"
               style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer">
            <div style="width:44px;height:44px;border-radius:9px;background:${isTop?c.color:'#fff'};border:${isTop?'none':'1.5px solid var(--g200)'};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">
              <span style="font-size:8px;color:${isTop?'#fff':'var(--g500)'};line-height:1">เบอร์</span>
              <span style="font-size:17px;font-weight:800;color:${isTop?'#fff':'var(--navy)'};line-height:1.2">${rank}</span>
            </div>
            <img src="/images/${c.photo}" onerror="this.style.display='none'" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #fff;flex-shrink:0">
            <div style="flex:1;min-width:0">
              <div style="font-weight:800;font-size:15px;color:var(--navy)">${c.emoji||''} ${c.name}</div>
              <div style="font-size:12px;color:var(--g500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.party||''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:19px;font-weight:800;color:${isTop?c.color:'var(--navy)'}">${c.voteCount}</div>
              <div style="font-size:11px;color:var(--g400)">${pct}%</div>
            </div>
            <svg id="rarrow-${c.id}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--g400);flex-shrink:0;transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div style="height:6px;background:rgba(0,0,0,.06);margin:0 16px 14px;border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${c.color};border-radius:4px;transition:width 1s"></div>
          </div>
          <div id="rdetail-${c.id}" style="display:none;padding:0 16px 16px;border-top:1px solid rgba(0,0,0,.06)">
            <div style="font-size:12px;color:var(--g500);margin:12px 0 8px;font-weight:700">นโยบายหลัก</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
              ${policies.length ? policies.map(p=>`<span style="font-size:11.5px;background:#fff;padding:4px 11px;border-radius:999px;color:var(--g600)">${p}</span>`).join('') : `<span style="font-size:12px;color:var(--g400)">ยังไม่มีข้อมูลนโยบาย</span>`}
            </div>
            <a href="/candidate_detail.html?id=${c.id}" class="btn btn-primary btn-sm" style="width:100%;justify-content:center">ดูรายละเอียดเต็ม →</a>
          </div>
        </div>`;
      }).join('');
    }
    if (tvEl) tvEl.textContent = totalVotes;
  } catch(e) { console.error(e); }
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
Object.assign(window,{ selectCandidate, openVoteConfirm, submitVote, openModal, closeModal, logout, Toast });
