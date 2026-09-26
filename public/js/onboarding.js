import { api, session } from './api.js';
import { esc, toast, MEDICAL_OPTIONS, SPORT_OPTIONS } from './ui.js';

const DRAFT_KEY = 'athlora_onboarding';
const STEPS = ['name', 'email', 'otp', 'age', 'medical', 'sports'];

function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; }
}
function saveDraft(d) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
}

export function startOnboarding(root, { user, onDone }) {
  const d = loadDraft();
  d.medical ??= { has: null, conditions: [], notes: '' };
  d.sports ??= { plays: null, list: [] };
  if (user) {
    d.name = user.name;
    d.email = user.email;
    if (!['age', 'medical', 'sports'].includes(d.step)) d.step = 'age';
  } else if (['age', 'medical', 'sports'].includes(d.step) || !d.step) {
    d.step = 'welcome';
  }

  let timer = null;

  function go(step) {
    d.step = step;
    saveDraft(d);
    render();
  }

  function frame({ step, title, sub = '', body = '', foot, back }) {
    const n = STEPS.indexOf(step) + 1;
    return `
      <form class="onb fade-in" id="onbForm" novalidate>
        <div class="onb-progress"><div style="width:${(n / STEPS.length) * 100}%"></div></div>
        ${back ? `<button type="button" class="back-btn" data-back="${back}">← Back</button>` : ''}
        <div class="onb-body">
          <div class="step-no">STEP ${n} OF ${STEPS.length}</div>
          <h1>${title}</h1>
          ${sub ? `<p class="muted">${sub}</p>` : ''}
          ${body}
          <p class="error" id="err"></p>
        </div>
        <div class="onb-foot">${foot}</div>
      </form>`;
  }

  function setError(msg) {
    const el = root.querySelector('#err');
    if (el) el.textContent = msg || '';
  }

  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Please wait…'; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  function render() {
    clearInterval(timer);
    const step = d.step;

    if (step === 'welcome') {
      root.innerHTML = `
        <div class="onb splash fade-in">
          <div>
            <img class="logo" src="/icons/icon.svg" alt="" />
            <div class="word">ATHLORA</div>
            <p class="tag-line">The Anti-Sedentary Engine</p>
            <p class="quote">Fitness becomes a daily behaviour, <span class="accent">not a scheduled workout.</span></p>
          </div>
          <div class="onb-foot" style="margin-top:48px">
            <button class="btn primary block" id="start">Get started</button>
            <p class="muted small">Already joined? Use the same email and we'll sign you back in.</p>
          </div>
        </div>`;
      root.querySelector('#start').onclick = () => go('name');
      return;
    }

    if (step === 'name') {
      root.innerHTML = frame({
        step, back: 'welcome',
        title: "What's your name?",
        sub: "We'll use it to personalise your Move Missions.",
        body: `<input class="input" id="name" autocomplete="name" placeholder="Your name" maxlength="60" value="${esc(d.name || '')}" />`,
        foot: `<button class="btn primary block" type="submit">Continue</button>`,
      });
      const input = root.querySelector('#name');
      input.focus();
      onSubmit(() => {
        const v = input.value.trim();
        if (v.length < 2) return setError('Please enter your name');
        d.name = v;
        go('email');
      });
    }

    else if (step === 'email') {
      root.innerHTML = frame({
        step, back: 'name',
        title: `Hi ${esc(d.name)}, what's your email?`,
        sub: "We'll send a 6-digit code to verify it.",
        body: `<input class="input" id="email" type="email" inputmode="email" autocomplete="email" placeholder="you@college.edu" value="${esc(d.email || '')}" />`,
        foot: `<button class="btn primary block" type="submit" id="sendBtn">Send code</button>`,
      });
      const input = root.querySelector('#email');
      input.focus();
      onSubmit(async () => {
        const email = input.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setError('Please enter a valid email address');
        const btn = root.querySelector('#sendBtn');
        busy(btn, true, 'Sending…');
        try {
          const r = await api('/auth/request-otp', { method: 'POST', body: { name: d.name, email } });
          d.email = email;
          d.devMode = r.devMode;
          d.resendAt = Date.now() + r.resendIn * 1000;
          go('otp');
        } catch (err) {
          busy(btn, false);
          if (err.data?.wait && d.email === email) { d.resendAt = Date.now() + err.data.wait * 1000; go('otp'); return; }
          setError(err.message);
        }
      });
    }

    else if (step === 'otp') {
      root.innerHTML = frame({
        step, back: 'email',
        title: 'Enter the code',
        sub: `We sent a 6-digit code to <b style="color:var(--text)">${esc(d.email)}</b>. Check your spam folder too.`,
        body: `
          <div class="otp-boxes">${Array.from({ length: 6 }, (_, i) =>
            `<input inputmode="numeric" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" maxlength="6" aria-label="Digit ${i + 1}" />`).join('')}</div>
          ${d.devMode ? `<p class="note">Developer mode: email isn't configured on the server yet, so the code is printed in the server terminal.</p>` : ''}
          <p class="small muted" id="resendRow"></p>`,
        foot: `<button class="btn primary block" type="submit" id="verifyBtn">Verify</button>`,
      });
      const boxes = [...root.querySelectorAll('.otp-boxes input')];
      boxes[0].focus();
      const code = () => boxes.map((b) => b.value).join('');
      boxes.forEach((box, i) => {
        box.addEventListener('input', () => {
          const digits = box.value.replace(/\D/g, '');
          if (digits.length > 1) {
            // pasted or autofilled full code
            digits.slice(0, 6).split('').forEach((ch, j) => { if (boxes[j]) boxes[j].value = ch; });
            boxes[Math.min(digits.length, 6) - 1].focus();
          } else {
            box.value = digits;
            if (digits && boxes[i + 1]) boxes[i + 1].focus();
          }
          if (code().length === 6) root.querySelector('#onbForm').requestSubmit();
        });
        box.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !box.value && boxes[i - 1]) boxes[i - 1].focus();
        });
      });

      const resendRow = root.querySelector('#resendRow');
      const tick = () => {
        const left = Math.ceil(((d.resendAt || 0) - Date.now()) / 1000);
        if (left > 0) resendRow.textContent = `Resend code in ${left}s`;
        else {
          clearInterval(timer);
          resendRow.innerHTML = `Didn't get it? <button type="button" class="link" id="resend">Resend code</button>`;
          resendRow.querySelector('#resend').onclick = async () => {
            try {
              const r = await api('/auth/request-otp', { method: 'POST', body: { name: d.name, email: d.email } });
              d.resendAt = Date.now() + r.resendIn * 1000;
              saveDraft(d);
              toast('New code sent');
              timer = setInterval(tick, 1000); tick();
            } catch (err) { setError(err.message); }
          };
        }
      };
      timer = setInterval(tick, 1000); tick();

      let verifying = false;
      onSubmit(async () => {
        if (verifying) return;
        if (code().length !== 6) return setError('Enter all 6 digits');
        const btn = root.querySelector('#verifyBtn');
        verifying = true;
        busy(btn, true, 'Verifying…');
        try {
          const r = await api('/auth/verify-otp', { method: 'POST', body: { email: d.email, code: code(), name: d.name } });
          session.set(r.token);
          if (r.user.onboarded) {
            clearDraft();
            clearInterval(timer);
            onDone(r.user);
            return;
          }
          go('age');
        } catch (err) {
          verifying = false;
          busy(btn, false);
          boxes.forEach((b) => (b.value = ''));
          boxes[0].focus();
          setError(err.message);
        }
      });
    }

    else if (step === 'age') {
      root.innerHTML = frame({
        step,
        title: 'How old are you?',
        sub: 'Helps ATHLORA set safe starting intensity.',
        body: `<input class="input" id="age" type="number" inputmode="numeric" min="10" max="100" placeholder="Age" value="${esc(d.age || '')}" />`,
        foot: `<button class="btn primary block" type="submit">Continue</button>`,
      });
      const input = root.querySelector('#age');
      input.focus();
      onSubmit(() => {
        const age = Number(input.value);
        if (!Number.isInteger(age) || age < 10 || age > 100) return setError('Please enter a valid age (10–100)');
        d.age = age;
        go('medical');
      });
    }

    else if (step === 'medical') {
      const m = d.medical;
      root.innerHTML = frame({
        step, back: 'age',
        title: 'Any medical conditions?',
        sub: 'Anything that affects how you exercise.',
        body: `
          <div class="choice-grid">
            <button type="button" class="choice ${m.has === false ? 'on' : ''}" data-has="no"><b>No</b><span>I'm good to go</span></button>
            <button type="button" class="choice ${m.has === true ? 'on' : ''}" data-has="yes"><b>Yes</b><span>I have a condition</span></button>
          </div>
          ${m.has ? `
            <div class="check-list">
              ${MEDICAL_OPTIONS.map((c) => `<label class="check"><input type="checkbox" value="${esc(c)}" ${m.conditions.includes(c) ? 'checked' : ''}/> ${esc(c)}</label>`).join('')}
            </div>
            <textarea class="input" id="notes" rows="2" placeholder="Anything else we should know? (optional)" maxlength="300">${esc(m.notes)}</textarea>
            <p class="note">ATHLORA doesn't diagnose anything. With a condition, your missions avoid high-impact moves. Please check with your doctor before starting new exercise.</p>` : ''}`,
        foot: `<button class="btn primary block" type="submit" ${m.has === null ? 'disabled' : ''}>Continue</button>`,
      });
      root.querySelectorAll('[data-has]').forEach((b) => b.onclick = () => {
        syncMedical();
        m.has = b.dataset.has === 'yes';
        saveDraft(d);
        render();
      });
      function syncMedical() {
        if (!m.has) return;
        m.conditions = [...root.querySelectorAll('.check input:checked')].map((i) => i.value);
        m.notes = root.querySelector('#notes')?.value.trim() || '';
      }
      onSubmit(() => {
        if (m.has === null) return setError('Please choose Yes or No');
        syncMedical();
        if (!m.has) { m.conditions = []; m.notes = ''; }
        if (m.has && !m.conditions.length && !m.notes) return setError('Select a condition or add a note');
        go('sports');
      });
    }

    else if (step === 'sports') {
      const s = d.sports;
      const custom = s.list.filter((x) => !SPORT_OPTIONS.includes(x));
      root.innerHTML = frame({
        step, back: 'medical',
        title: 'Do you play any sports?',
        sub: 'Regularly, for a team, or just for fun.',
        body: `
          <div class="choice-grid">
            <button type="button" class="choice ${s.plays === false ? 'on' : ''}" data-plays="no"><b>No</b><span>Not right now</span></button>
            <button type="button" class="choice ${s.plays === true ? 'on' : ''}" data-plays="yes"><b>Yes</b><span>I play sports</span></button>
          </div>
          ${s.plays ? `
            <p class="small muted">Which ones?</p>
            <div class="chips" id="sportChips">
              ${[...SPORT_OPTIONS, ...custom].map((sp) => `<button type="button" class="chip ${s.list.includes(sp) ? 'on' : ''}" data-sport="${esc(sp)}">${esc(sp)}</button>`).join('')}
            </div>
            <div class="row">
              <input class="input" id="otherSport" placeholder="Other sport" maxlength="30" />
              <button type="button" class="btn sm" id="addSport">Add</button>
            </div>` : ''}`,
        foot: `<button class="btn primary block" type="submit" id="finishBtn" ${s.plays === null ? 'disabled' : ''}>Finish setup</button>`,
      });
      root.querySelectorAll('[data-plays]').forEach((b) => b.onclick = () => {
        s.plays = b.dataset.plays === 'yes';
        saveDraft(d);
        render();
      });
      root.querySelector('#sportChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-sport]');
        if (!chip) return;
        chip.classList.toggle('on');
        const v = chip.dataset.sport;
        s.list = chip.classList.contains('on') ? [...new Set([...s.list, v])] : s.list.filter((x) => x !== v);
        saveDraft(d);
      });
      const addSport = () => {
        const inp = root.querySelector('#otherSport');
        const v = inp.value.trim();
        if (!v) return;
        if (!s.list.includes(v)) s.list.push(v);
        saveDraft(d);
        render();
      };
      root.querySelector('#addSport')?.addEventListener('click', addSport);
      root.querySelector('#otherSport')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSport(); } });

      onSubmit(async () => {
        if (s.plays === null) return setError('Please choose Yes or No');
        if (s.plays && !s.list.length) return setError('Pick at least one sport');
        const btn = root.querySelector('#finishBtn');
        busy(btn, true, 'Setting up…');
        try {
          const r = await api('/me/onboarding', {
            method: 'PUT',
            body: { age: d.age, medical: d.medical, sports: s.plays ? s : { plays: false, list: [] } },
          });
          clearDraft();
          onDone(r.user);
        } catch (err) {
          busy(btn, false);
          setError(err.message);
        }
      });
    }

    root.querySelector('[data-back]')?.addEventListener('click', () => go(root.querySelector('[data-back]').dataset.back));
  }

  function onSubmit(handler) {
    root.querySelector('#onbForm').addEventListener('submit', (e) => {
      e.preventDefault();
      setError('');
      handler();
    });
  }

  render();
}
