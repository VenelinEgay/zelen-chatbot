/**
 * Zelen.bg Chat Widget
 * Embed this on your website with:
 * <script src="https://YOUR-SERVER/widget.js" data-server="https://YOUR-SERVER"></script>
 */
(function() {
  'use strict';

  // Get server URL from script tag or default
  const scriptTag = document.currentScript;
  const SERVER_URL = scriptTag?.getAttribute('data-server') || scriptTag?.src?.replace('/widget.js', '') || 'http://localhost:3000';
  const API_URL = SERVER_URL + '/api/chat';

  // Session
  const sessionId = 'zelen_' + Math.random().toString(36).substring(2, 15);

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #zelen-widget-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #6ab04c;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(106, 176, 76, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      z-index: 99999;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #zelen-widget-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 24px rgba(106, 176, 76, 0.5);
    }
    #zelen-widget-btn .badge {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #e74c3c;
      border: 2px solid white;
      display: none;
    }

    #zelen-widget-panel {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      height: 520px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      z-index: 99998;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: zelenSlideUp 0.3s ease;
    }
    #zelen-widget-panel.open { display: flex; }

    @keyframes zelenSlideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .zelen-header {
      background: linear-gradient(135deg, #6ab04c, #4a8c34);
      color: white;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .zelen-header-icon {
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.2);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    .zelen-header-text h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
    }
    .zelen-header-text p {
      font-size: 11px;
      opacity: 0.85;
      margin: 0;
    }
    .zelen-close {
      margin-left: auto;
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
    }
    .zelen-close:hover { opacity: 1; }

    .zelen-messages {
      flex: 1;
      overflow-y: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f5f7f0;
    }

    .zelen-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.45;
      word-wrap: break-word;
    }
    .zelen-msg.bot {
      background: white;
      border: 1px solid #dfe6e9;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .zelen-msg.user {
      background: #6ab04c;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .zelen-msg a { color: #4a8c34; text-decoration: underline; }
    .zelen-msg strong { color: #4a8c34; }

    .zelen-typing {
      display: flex;
      gap: 4px;
      padding: 10px 14px;
      align-self: flex-start;
    }
    .zelen-typing span {
      width: 7px;
      height: 7px;
      background: #6ab04c;
      border-radius: 50%;
      animation: zelenBounce 1.4s infinite both;
    }
    .zelen-typing span:nth-child(2) { animation-delay: 0.2s; }
    .zelen-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes zelenBounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    .zelen-quick {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 14px;
    }
    .zelen-quick-btn {
      padding: 6px 10px;
      border: 1px solid #6ab04c;
      border-radius: 14px;
      background: white;
      color: #4a8c34;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .zelen-quick-btn:hover {
      background: #6ab04c;
      color: white;
    }

    .zelen-input-area {
      padding: 10px 14px;
      display: flex;
      gap: 8px;
      background: white;
      border-top: 1px solid #dfe6e9;
    }
    .zelen-input-area input {
      flex: 1;
      padding: 10px 14px;
      border: 1.5px solid #dfe6e9;
      border-radius: 20px;
      font-size: 13px;
      outline: none;
      font-family: inherit;
    }
    .zelen-input-area input:focus { border-color: #6ab04c; }
    .zelen-input-area button {
      padding: 10px 16px;
      background: #6ab04c;
      color: white;
      border: none;
      border-radius: 20px;
      font-size: 13px;
      cursor: pointer;
      font-weight: 600;
      font-family: inherit;
    }
    .zelen-input-area button:hover { background: #4a8c34; }
    .zelen-input-area button:disabled { opacity: 0.5; }

    .zelen-footer {
      text-align: center;
      padding: 6px;
      font-size: 10px;
      color: #b2bec3;
      background: white;
    }
    .zelen-footer a { color: #4a8c34; text-decoration: none; }

    @media (max-width: 420px) {
      #zelen-widget-panel {
        width: calc(100vw - 20px);
        right: 10px;
        bottom: 80px;
        height: 60vh;
      }
    }
  `;
  document.head.appendChild(style);

  // Create widget button
  const btn = document.createElement('button');
  btn.id = 'zelen-widget-btn';
  btn.innerHTML = '🌿<div class="badge"></div>';
  btn.title = 'Чат с ЗЕЛЕН';
  document.body.appendChild(btn);

  // Create chat panel
  const panel = document.createElement('div');
  panel.id = 'zelen-widget-panel';
  panel.innerHTML = `
    <div class="zelen-header">
      <div class="zelen-header-icon">🌿</div>
      <div class="zelen-header-text">
        <h3>ЗЕЛЕН Асистент</h3>
        <p>Онлайн — обикновено отговаря веднага</p>
      </div>
      <button class="zelen-close" id="zelenClose">&times;</button>
    </div>
    <div class="zelen-messages" id="zelenMessages">
      <div class="zelen-msg bot">
        Здравей! 👋 Аз съм AI асистентът на ЗЕЛЕН. Мога да ти помогна да намериш подходящите био продукти за теб. Какво търсиш?
      </div>
    </div>
    <div class="zelen-quick" id="zelenQuick">
      <button class="zelen-quick-btn" data-msg="Искам нещо с малко калории">🥗 Ниски калории</button>
      <button class="zelen-quick-btn" data-msg="Искам нещо с висок протеин">💪 Протеин</button>
      <button class="zelen-quick-btn" data-msg="Какво имате без глутен?">🌾 Без глутен</button>
      <button class="zelen-quick-btn" data-msg="Имате ли веган продукти?">🌱 Веган</button>
    </div>
    <div class="zelen-input-area">
      <input type="text" id="zelenInput" placeholder="Напиши съобщение..." autocomplete="off" />
      <button id="zelenSend">Изпрати</button>
    </div>
    <div class="zelen-footer">
      <a href="https://zelen.bg" target="_blank">zelen.bg</a> | 📞 0879368774
    </div>
  `;
  document.body.appendChild(panel);

  // Elements
  const messages = document.getElementById('zelenMessages');
  const input = document.getElementById('zelenInput');
  const sendBtnEl = document.getElementById('zelenSend');
  const closeBtn = document.getElementById('zelenClose');
  const quickBtns = document.getElementById('zelenQuick');

  // Toggle panel
  let isOpen = false;
  btn.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen) {
      input.focus();
      btn.querySelector('.badge').style.display = 'none';
    }
  });
  closeBtn.addEventListener('click', () => {
    isOpen = false;
    panel.classList.remove('open');
  });

  // Quick buttons
  quickBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('.zelen-quick-btn');
    if (btn) {
      input.value = btn.dataset.msg;
      sendMsg();
    }
  });

  // Send
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMsg();
  });
  sendBtnEl.addEventListener('click', sendMsg);

  function formatMsg(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      .replace(/\n/g, '<br>')
      .replace(/^- (.+)/gm, '&bull; $1');
  }

  function addMsg(text, type) {
    const div = document.createElement('div');
    div.className = `zelen-msg ${type}`;
    div.innerHTML = type === 'bot' ? formatMsg(text) : text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'zelen-typing';
    div.id = 'zelenTyping';
    div.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('zelenTyping');
    if (el) el.remove();
  }

  async function sendMsg() {
    const text = input.value.trim();
    if (!text) return;

    addMsg(text, 'user');
    input.value = '';
    sendBtnEl.disabled = true;
    quickBtns.style.display = 'none';
    showTyping();

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId })
      });
      const data = await res.json();
      hideTyping();
      addMsg(data.reply || 'Грешка при обработка.', 'bot');
    } catch (err) {
      hideTyping();
      addMsg('Грешка при връзката. Обадете ни се на 0879368774.', 'bot');
    }

    sendBtnEl.disabled = false;
    input.focus();
  }

  // Auto-open after 15 seconds if not interacted
  let autoOpened = false;
  setTimeout(() => {
    if (!isOpen && !autoOpened) {
      btn.querySelector('.badge').style.display = 'block';
      autoOpened = true;
    }
  }, 15000);

})();
