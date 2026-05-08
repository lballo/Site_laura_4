/**
 * Chatbot Aura — lauraballo.com
 * <script src="/chatbot-widget.js" defer></script>
 */
(function () {

  const CONFIG = {
    apiEndpoint: '/api/chat',
    botName: 'Aura',
    botSubtitle: 'Assistante de Laura Ballo',
    welcomeMessage: "Bonjour 🌿 Je suis Aura, l'assistante de Laura. Vous cherchez à développer votre présence, votre leadership ou votre prise de parole ?",
    chips: [
      "C'est quoi vos offres ?",
      "Je cherche un coaching",
      "C'est pour une entreprise",
      "Quels sont les tarifs ?"
    ]
  };

  // Fonts
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Fraunces:wght@300;400&family=DM+Sans:wght@300;400;500&display=swap';
  document.head.appendChild(fontLink);

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    #lb-btn {
      position: fixed; bottom: 28px; right: 28px;
      width: 56px; height: 56px; border-radius: 50%;
      background: #A83932; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(168,57,50,0.4);
      display: flex; align-items: center; justify-content: center;
      z-index: 9998; transition: transform 0.2s, box-shadow 0.2s;
    }
    #lb-btn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(168,57,50,0.5); }

    #lb-win {
      position: fixed; bottom: 96px; right: 28px;
      width: 360px; border-radius: 16px; overflow: hidden;
      box-shadow: 0 12px 48px rgba(0,0,0,0.15);
      display: flex; flex-direction: column;
      z-index: 9999; background: #fff;
      font-family: 'DM Sans', sans-serif;
      transform: translateY(14px); opacity: 0; pointer-events: none;
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
    }
    #lb-win.open { transform: translateY(0); opacity: 1; pointer-events: all; }

    #lb-head {
      background: #1A1A1A; padding: 14px 16px;
      display: flex; align-items: center; gap: 12px;
    }
    #lb-av {
      width: 38px; height: 38px; border-radius: 50%;
      background: #A83932; display: flex; align-items: center;
      justify-content: center; font-family: 'Fraunces', serif;
      font-size: 16px; color: #F3ECE8; flex-shrink: 0;
    }
    #lb-hname {
      font-family: 'Fraunces', serif; font-weight: 300;
      font-size: 14px; color: #fff; letter-spacing: 0.02em;
    }
    #lb-hsub { font-size: 11px; color: #F3ECE8; margin-top: 2px; }
    #lb-close {
      margin-left: auto; background: none; border: none;
      cursor: pointer; color: #F3ECE8; display: flex;
      padding: 4px; border-radius: 6px; transition: opacity 0.2s;
    }
    #lb-close:hover { opacity: 0.7; }

    #lb-msgs {
      background: #fff; padding: 14px 12px;
      min-height: 180px; max-height: 300px;
      overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
      scrollbar-width: thin; scrollbar-color: #A83932 transparent;
    }
    #lb-msgs::-webkit-scrollbar { width: 4px; }
    #lb-msgs::-webkit-scrollbar-thumb { background: #A83932; border-radius: 4px; }

    .lb-msg {
      max-width: 84%; padding: 9px 12px;
      font-size: 13px; line-height: 1.55;
      animation: lb-in 0.2s ease;
    }
    @keyframes lb-in {
      from { opacity: 0; transform: translateY(5px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .lb-msg.bot {
      background: #f0f0f0; color: #1A1A1A;
      border-radius: 12px 12px 12px 3px; align-self: flex-start;
    }
    .lb-msg.user {
      background: #A83932; color: #fff;
      border-radius: 12px 12px 3px 12px; align-self: flex-end;
    }
    .lb-msg a { color: #A83932; text-decoration: underline; }
    .lb-msg.user a { color: #fde; }

    .lb-typing {
      display: flex; gap: 4px; align-items: center;
      padding: 10px 12px; background: #f0f0f0;
      border-radius: 12px 12px 12px 3px; align-self: flex-start;
    }
    .lb-typing span {
      width: 5px; height: 5px; border-radius: 50%;
      background: #A83932; animation: lb-dot 1.1s infinite;
    }
    .lb-typing span:nth-child(2) { animation-delay: 0.18s; }
    .lb-typing span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes lb-dot {
      0%,60%,100% { transform: translateY(0); }
      30% { transform: translateY(-5px); }
    }

    #lb-chips {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 0 12px 10px; background: #fff;
    }
    .lb-chip {
      background: #fff; border: 1.5px solid #A83932;
      color: #A83932; border-radius: 20px;
      padding: 5px 12px; font-size: 12px; font-weight: 500;
      cursor: pointer; font-family: 'DM Sans', sans-serif;
      transition: all 0.15s;
    }
    .lb-chip:hover { background: #A83932; color: #fff; }

    #lb-input-area {
      background: #fff; border-top: 1px solid #e8e8e8;
      padding: 10px 12px; display: flex; gap: 8px; align-items: flex-end;
    }
    #lb-input {
      flex: 1; border: 1.5px solid #e0e0e0; border-radius: 8px;
      padding: 8px 10px; font-family: 'DM Sans', sans-serif;
      font-size: 13px; color: #1A1A1A; background: #fff;
      resize: none; outline: none;
      min-height: 36px; max-height: 72px; line-height: 1.4;
    }
    #lb-input:focus { border-color: #A83932; }
    #lb-input::placeholder { color: #bbb; }

    #lb-send {
      width: 36px; height: 36px; border-radius: 8px;
      background: #A83932; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.15s;
    }
    #lb-send:hover { background: #8a2d27; }
    #lb-send:disabled { background: #ccc; cursor: not-allowed; }

    #lb-footer {
      background: #fff; text-align: center;
      font-size: 10px; color: #bbb;
      padding: 4px 0 8px; font-family: 'DM Sans', sans-serif;
    }

    @media (max-width: 420px) {
      #lb-win { width: calc(100vw - 24px); right: 12px; bottom: 86px; }
      #lb-btn { right: 16px; bottom: 20px; }
    }
  `;
  document.head.appendChild(style);

  // HTML
  const btn = document.createElement('button');
  btn.id = 'lb-btn';
  btn.setAttribute('aria-label', 'Ouvrir le chat');
  btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  const win = document.createElement('div');
  win.id = 'lb-win';
  win.innerHTML = `
    <div id="lb-head">
      <div id="lb-av">A</div>
      <div>
        <div id="lb-hname">Aura</div>
        <div id="lb-hsub">Assistante de Laura Ballo</div>
      </div>
      <button id="lb-close" aria-label="Fermer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div id="lb-msgs"></div>
    <div id="lb-chips"></div>
    <div id="lb-input-area">
      <textarea id="lb-input" placeholder="Votre message…" rows="1" maxlength="500"></textarea>
      <button id="lb-send" disabled aria-label="Envoyer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
    <div id="lb-footer">Propulsé par Laura Ballo × IA</div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(win);

  // State
  let isOpen = false;
  let isLoading = false;
  let hasOpened = false;
  const messageHistory = [];

  const msgsEl   = document.getElementById('lb-msgs');
  const chipsEl  = document.getElementById('lb-chips');
  const inputEl  = document.getElementById('lb-input');
  const sendBtn  = document.getElementById('lb-send');

  // Chips
  CONFIG.chips.forEach(text => {
    const c = document.createElement('button');
    c.className = 'lb-chip';
    c.textContent = text;
    c.onclick = () => sendMessage(text);
    chipsEl.appendChild(c);
  });

  function addMessage(text, role) {
    const d = document.createElement('div');
    d.className = 'lb-msg ' + role;
    const esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    d.innerHTML = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function showTyping() {
    const d = document.createElement('div');
    d.className = 'lb-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return d;
  }

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 72) + 'px';
  }

  async function sendMessage(text) {
    if (!text.trim() || isLoading) return;
    isLoading = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;
    chipsEl.style.display = 'none';

    addMessage(text, 'user');
    messageHistory.push({ role: 'user', content: text });
    inputEl.value = '';
    autoResize();

    const typing = showTyping();

    try {
      const res = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messageHistory })
      });
      const data = await res.json();
      typing.remove();
      const reply = data.reply || "Je suis désolée, une erreur est survenue. Contactez Laura sur Calendly !";
      addMessage(reply, 'bot');
      messageHistory.push({ role: 'assistant', content: reply });
    } catch {
      typing.remove();
      addMessage("Petite difficulté technique. Rejoignez Laura sur https://calendly.com/laura-ballo1993/echangecoaching", 'bot');
    }

    isLoading = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }

  function openChat() {
    isOpen = true;
    win.classList.add('open');
    if (!hasOpened) {
      hasOpened = true;
      setTimeout(() => {
        const t = showTyping();
        setTimeout(() => {
          t.remove();
          addMessage(CONFIG.welcomeMessage, 'bot');
          messageHistory.push({ role: 'assistant', content: CONFIG.welcomeMessage });
        }, 900);
      }, 200);
    }
    setTimeout(() => inputEl.focus(), 350);
  }

  function closeChat() {
    isOpen = false;
    win.classList.remove('open');
  }

  btn.addEventListener('click', () => isOpen ? closeChat() : openChat());
  document.getElementById('lb-close').addEventListener('click', closeChat);

  inputEl.addEventListener('input', () => {
    autoResize();
    sendBtn.disabled = !inputEl.value.trim();
  });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage(inputEl.value);
    }
  });
  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

  document.addEventListener('click', e => {
    if (isOpen && !win.contains(e.target) && e.target !== btn) closeChat();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) closeChat();
  });

})();
