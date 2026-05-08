/**
 * Chatbot Présence Vibratoire — lauraballo.com
 * Widget auto-contenu : une seule ligne à ajouter dans le HTML
 * <script src="/chatbot-widget.js" defer></script>
 */

(function () {
  // ─── Configuration ───────────────────────────────────────────────
  const CONFIG = {
    apiEndpoint: '/api/chat',
    botName: 'Aura',
    botSubtitle: 'Assistante de Laura Ballo',
    welcomeMessage: "Bonjour 🌿 Je suis Aura, l'assistante de Laura. Vous cherchez à développer votre présence, votre leadership ou votre prise de parole ?",
    colors: {
      brown:     '#3D3128',
      terracotta:'#AA564C',
      ochre:     '#C4A574',
      cream:     '#F5EFE6',
      creamDark: '#EDE4D7',
      white:     '#FDFAF6',
    }
  };

  // ─── Inject fonts ─────────────────────────────────────────────────
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;1,300&family=DM+Sans:wght@300;400;500&display=swap';
  document.head.appendChild(fontLink);

  // ─── Styles ───────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #lb-chat-btn {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: #AA564C;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(170,86,76,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9998;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    #lb-chat-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 28px rgba(170,86,76,0.5);
    }
    #lb-chat-btn svg { transition: opacity 0.2s; }

    #lb-chat-window {
      position: fixed;
      bottom: 100px;
      right: 28px;
      width: 360px;
      max-height: 520px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 48px rgba(61,49,40,0.22);
      display: flex;
      flex-direction: column;
      z-index: 9999;
      background: #FDFAF6;
      font-family: 'DM Sans', sans-serif;
      transform: translateY(16px);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
    }
    #lb-chat-window.open {
      transform: translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* Header */
    #lb-header {
      background: #3D3128;
      padding: 16px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #lb-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #C4A574, #AA564C);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Fraunces', serif;
      font-weight: 300;
      font-size: 17px;
      color: #FDFAF6;
      flex-shrink: 0;
    }
    #lb-header-text { flex: 1; }
    #lb-header-name {
      font-family: 'Fraunces', serif;
      font-weight: 300;
      font-size: 15px;
      color: #F5EFE6;
      letter-spacing: 0.02em;
    }
    #lb-header-sub {
      font-size: 11px;
      color: #C4A574;
      margin-top: 2px;
      font-weight: 300;
    }
    #lb-close-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #C4A574;
      padding: 4px;
      border-radius: 6px;
      transition: color 0.2s;
      display: flex;
    }
    #lb-close-btn:hover { color: #F5EFE6; }

    /* Messages */
    #lb-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #F5EFE6;
      scrollbar-width: thin;
      scrollbar-color: #C4A574 transparent;
    }
    #lb-messages::-webkit-scrollbar { width: 4px; }
    #lb-messages::-webkit-scrollbar-thumb { background: #C4A574; border-radius: 4px; }

    .lb-msg {
      max-width: 82%;
      padding: 10px 13px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.55;
      animation: lb-fadein 0.25s ease;
    }
    @keyframes lb-fadein {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .lb-msg.bot {
      background: #FDFAF6;
      color: #3D3128;
      border-radius: 14px 14px 14px 4px;
      box-shadow: 0 1px 6px rgba(61,49,40,0.08);
      align-self: flex-start;
    }
    .lb-msg.user {
      background: #AA564C;
      color: #FDFAF6;
      border-radius: 14px 14px 4px 14px;
      align-self: flex-end;
    }

    /* Typing indicator */
    .lb-typing {
      display: flex;
      gap: 4px;
      align-items: center;
      padding: 12px 14px;
      background: #FDFAF6;
      border-radius: 14px 14px 14px 4px;
      align-self: flex-start;
      box-shadow: 0 1px 6px rgba(61,49,40,0.08);
    }
    .lb-typing span {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #C4A574;
      animation: lb-bounce 1.2s infinite;
    }
    .lb-typing span:nth-child(2) { animation-delay: 0.2s; }
    .lb-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes lb-bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-5px); }
    }

    /* Input area */
    #lb-input-area {
      padding: 12px 14px;
      background: #FDFAF6;
      border-top: 1px solid #EDE4D7;
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    #lb-input {
      flex: 1;
      border: 1.5px solid #EDE4D7;
      border-radius: 10px;
      padding: 9px 12px;
      font-family: 'DM Sans', sans-serif;
      font-size: 13.5px;
      color: #3D3128;
      background: #F5EFE6;
      resize: none;
      outline: none;
      transition: border-color 0.2s;
      line-height: 1.5;
      max-height: 80px;
      min-height: 38px;
    }
    #lb-input:focus { border-color: #AA564C; }
    #lb-input::placeholder { color: #C4A574; }

    #lb-send-btn {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: #AA564C;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s, transform 0.1s;
    }
    #lb-send-btn:hover { background: #8f4840; }
    #lb-send-btn:active { transform: scale(0.94); }
    #lb-send-btn:disabled { background: #C4A574; cursor: not-allowed; }

    /* Footer */
    #lb-footer {
      text-align: center;
      font-size: 10px;
      color: #C4A574;
      padding: 5px 0 8px;
      background: #FDFAF6;
      font-family: 'DM Sans', sans-serif;
      letter-spacing: 0.03em;
    }

    /* Responsive mobile */
    @media (max-width: 420px) {
      #lb-chat-window {
        width: calc(100vw - 24px);
        right: 12px;
        bottom: 90px;
      }
      #lb-chat-btn { right: 16px; bottom: 20px; }
    }
  `;
  document.head.appendChild(style);

  // ─── HTML ─────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'lb-chat-btn';
  btn.setAttribute('aria-label', 'Ouvrir le chat');
  btn.innerHTML = `
    <svg id="lb-icon-open" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDFAF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;

  const win = document.createElement('div');
  win.id = 'lb-chat-window';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Chat avec Aura');
  win.innerHTML = `
    <div id="lb-header">
      <div id="lb-avatar">A</div>
      <div id="lb-header-text">
        <div id="lb-header-name">${CONFIG.botName}</div>
        <div id="lb-header-sub">${CONFIG.botSubtitle}</div>
      </div>
      <button id="lb-close-btn" aria-label="Fermer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div id="lb-messages"></div>

    <div id="lb-input-area">
      <textarea id="lb-input" placeholder="Votre message…" rows="1" maxlength="500"></textarea>
      <button id="lb-send-btn" aria-label="Envoyer" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FDFAF6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
    <div id="lb-footer">Propulsé par Laura Ballo × IA</div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(win);

  // ─── State ────────────────────────────────────────────────────────
  let isOpen = false;
  let isLoading = false;
  let hasOpened = false;
  const messageHistory = [];

  const messagesEl = win.querySelector('#lb-messages');
  const inputEl    = win.querySelector('#lb-input');
  const sendBtn    = win.querySelector('#lb-send-btn');

  // ─── Helpers ──────────────────────────────────────────────────────
  function addMessage(text, role) {
    const div = document.createElement('div');
    div.className = `lb-msg ${role}`;
    // Simple link detection
    div.innerHTML = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#AA564C;text-decoration:underline;">$1</a>');
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'lb-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  }

  // ─── API call ─────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (!text.trim() || isLoading) return;

    isLoading = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;

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

      const reply = data.reply || "Je suis désolée, une erreur est survenue. Vous pouvez joindre Laura directement sur son site.";
      addMessage(reply, 'bot');
      messageHistory.push({ role: 'assistant', content: reply });

    } catch {
      typing.remove();
      addMessage("Je rencontre une petite difficulté technique 🙏 Vous pouvez joindre Laura directement sur <a href='https://calendly.com/laura-ballo1993/echangecoaching' target='_blank' style='color:#AA564C'>Calendly</a>.", 'bot');
    }

    isLoading = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }

  // ─── Open / Close ─────────────────────────────────────────────────
  function openChat() {
    isOpen = true;
    win.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');

    if (!hasOpened) {
      hasOpened = true;
      setTimeout(() => {
        const typing = showTyping();
        setTimeout(() => {
          typing.remove();
          const msg = addMessage(CONFIG.welcomeMessage, 'bot');
          messageHistory.push({ role: 'assistant', content: CONFIG.welcomeMessage });
        }, 900);
      }, 200);
    }

    setTimeout(() => inputEl.focus(), 350);
  }

  function closeChat() {
    isOpen = false;
    win.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  // ─── Events ───────────────────────────────────────────────────────
  btn.addEventListener('click', () => isOpen ? closeChat() : openChat());
  win.querySelector('#lb-close-btn').addEventListener('click', closeChat);

  inputEl.addEventListener('input', () => {
    autoResize();
    sendBtn.disabled = !inputEl.value.trim();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage(inputEl.value);
    }
  });

  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

  // Fermer en cliquant à l'extérieur
  document.addEventListener('click', (e) => {
    if (isOpen && !win.contains(e.target) && e.target !== btn) closeChat();
  });

  // Échap pour fermer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closeChat();
  });

})();
