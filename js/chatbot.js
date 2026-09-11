/* ==========================================================================
   CHATBOT ASSISTANT LOGIC (GOOGLE GEMINI AI INTEGRATION ONLY)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initChatbot();
});

function initChatbot() {
    const triggerBtn = document.getElementById("chatbot-trigger-btn");
    const closeBtn = document.getElementById("chatbot-close-btn");
    const container = document.getElementById("chatbot-container");
    const inputForm = document.getElementById("chatbot-input-form");
    const inputField = document.getElementById("chatbot-input");
    const messagesContainer = document.getElementById("chatbot-messages");
    const suggestionsContainer = document.getElementById("chatbot-suggestions");

    if (!triggerBtn) return;

    let activeTypingTimer = null;
    let activeTypingDiv = null;
    let activeTypingFullText = "";

    function clearActiveTyping() {
        if (activeTypingTimer) {
            clearInterval(activeTypingTimer);
            activeTypingTimer = null;
        }
        if (activeTypingDiv && activeTypingFullText) {
            activeTypingDiv.innerHTML = formatMarkdown(activeTypingFullText);
            activeTypingDiv = null;
            activeTypingFullText = "";
        }
    }

    // Toggle open/close
    triggerBtn.addEventListener("click", () => {
        const isHidden = container.classList.contains("hidden");
        if (isHidden) {
            container.classList.remove("hidden");
            triggerBtn.querySelector(".chat-icon").classList.add("hidden");
            triggerBtn.querySelector(".close-icon").classList.remove("hidden");

            // Generate welcome message if empty
            if (messagesContainer.children.length === 0) {
                sendWelcomeMessage();
            }
            // Focus input
            inputField.focus();
        } else {
            closeChatbot();
        }
    });

    closeBtn.addEventListener("click", closeChatbot);

    function closeChatbot() {
        container.classList.add("hidden");
        triggerBtn.querySelector(".chat-icon").classList.remove("hidden");
        triggerBtn.querySelector(".close-icon").classList.add("hidden");
    }

    // Handle suggestion chips click
    suggestionsContainer.addEventListener("click", (e) => {
        const chip = e.target.closest(".suggestion-chip");
        if (!chip) return;

        const query = chip.getAttribute("data-query");
        if (query) {
            handleUserMessage(query);
        }
    });

    // Handle form submit
    inputForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = inputField.value.trim();
        if (!text) return;

        inputField.value = "";
        handleUserMessage(text);
    });

    function addMessage(sender, text, isHtml = false) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `chat-message ${sender}`;

        if (isHtml) {
            msgDiv.innerHTML = text;
        } else {
            msgDiv.textContent = text;
        }

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function getFriendlyName(raw) {
        let name = (raw || 'bạn').trim();
        if (name.includes("@")) {
            name = name.split("@")[0];
        }
        
        // If it's a raw username (contains only lowercase alpha, numbers, dots, underscores, dashes)
        const isRawUsername = /^[a-z0-9._-]+$/i.test(name);
        if (isRawUsername) {
            // Strip trailing digits
            name = name.replace(/\d+$/, '');
            // Replace separators with spaces
            name = name.replace(/[._-]/g, ' ');
            // Capitalize words
            name = name.split(' ')
                .filter(w => w.length > 0)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        }
        
        // Fallback translation for main user
        if (name.toLowerCase() === "huynhbathanh" || name.toLowerCase() === "huynh bathanh") {
            return "Bá Thành";
        }
        return name;
    }

    function sendWelcomeMessage() {
        const displayName = document.getElementById("user-display-name")?.textContent || "";
        const cleanName = getFriendlyName(displayName);

        const welcomeHtml = `
            <div class="chatbot-welcome-intro" style="text-align: center; padding: 12px 8px;">
                <div style="display: inline-flex; justify-content: center; align-items: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); margin-bottom: 12px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.15);">
                    <img src="images/logoapp.png?v=20260911_v8" alt="SpendMindAI Logo" width="44" height="44" style="border-radius: 12px; object-fit: contain;">
                </div>
                <h2 style="margin: 0 0 6px 0;">Xin chào, ${cleanName}</h2>
                <p style="margin: 0; color: var(--text-secondary, #94a3b8);">Hỏi tôi về số dư, chi tiêu hoặc phân tích tài chính cá nhân của bạn.</p>
            </div>
        `;
        messagesContainer.innerHTML = welcomeHtml;
    }

    function showTypingIndicator() {
        const indicator = document.createElement("div");
        indicator.className = "chat-message bot typing-indicator-wrapper";
        indicator.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        messagesContainer.appendChild(indicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return indicator;
    }

    function formatMarkdown(text) {
        if (!text) return "";
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Convert bold: **text** -> <strong>text</strong>
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // Convert inline code: `code` -> <code>code</code>
        html = html.replace(/`(.*?)`/g, "<code>$1</code>");

        const lines = html.split('\n');
        let inList = false;
        let inTable = false;
        let resultLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Handle lists
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                if (inTable) {
                    resultLines.push('</tbody></table></div>');
                    inTable = false;
                }
                if (!inList) {
                    resultLines.push('<ul style="margin: 4px 0 4px 20px; padding-left: 0; list-style-type: disc;">');
                    inList = true;
                }
                resultLines.push(`<li style="margin-bottom: 2px;">${trimmed.substring(2)}</li>`);
                continue;
            } else {
                if (inList) {
                    resultLines.push('</ul>');
                    inList = false;
                }
            }

            // Handle markdown tables
            if (trimmed.startsWith('|')) {
                if (trimmed.replace(/[\s|:\-]/g, '') === '') {
                    // Skip separator row
                    continue;
                }

                const cells = trimmed.split('|').map(c => c.trim()).filter((c, idx, arr) => {
                    if (idx === 0 && c === '') return false;
                    if (idx === arr.length - 1 && c === '') return false;
                    return true;
                });

                if (!inTable) {
                    // Verify if it's a real table by checking if the next line is a separator
                    let isRealTable = false;
                    if (i + 1 < lines.length) {
                        const nextTrimmed = lines[i+1].trim();
                        if (nextTrimmed.startsWith('|') && nextTrimmed.replace(/[\s|:\-]/g, '') === '') {
                            isRealTable = true;
                        }
                    }

                    if (isRealTable) {
                        resultLines.push('<div style="overflow-x:auto; margin: 8px 0;"><table style="width:100%; border-collapse:collapse; font-size:0.75rem; text-align:left; background:var(--surface-raised, rgba(255,255,255,0.02)); border-radius:6px; overflow:hidden;"><thead><tr style="border-bottom:1px solid var(--calendar-border, rgba(255,255,255,0.08)); background:rgba(255,255,255,0.03);">');
                        cells.forEach(cell => {
                            resultLines.push(`<th style="padding: 6px 8px; font-weight: 600; color: var(--text-primary);">${cell}</th>`);
                        });
                        resultLines.push('</tr></thead><tbody>');
                        inTable = true;
                        continue;
                    }
                }

                if (inTable) {
                    resultLines.push('<tr style="border-bottom:1px solid var(--calendar-border, rgba(255,255,255,0.04));">');
                    cells.forEach(cell => {
                        resultLines.push(`<td style="padding: 6px 8px; color: var(--text-secondary);">${cell}</td>`);
                    });
                    resultLines.push('</tr>');
                    continue;
                }
            } else {
                if (inTable) {
                    resultLines.push('</tbody></table></div>');
                    inTable = false;
                }
            }

            resultLines.push(line);
        }

        if (inList) {
            resultLines.push('</ul>');
        }
        if (inTable) {
            resultLines.push('</tbody></table></div>');
        }

        // Output lines: append <br> selectively to non-block elements to prevent double blank spaces
        let processedLines = [];
        resultLines.forEach(line => {
            const trimmed = line.trim();
            const isHtmlBlock = trimmed.startsWith('<div') || trimmed.startsWith('<table') || 
                                trimmed.startsWith('<thead') || trimmed.startsWith('<tbody') || 
                                trimmed.startsWith('<tr') || trimmed.startsWith('<th') || 
                                trimmed.startsWith('<td') || trimmed.startsWith('<ul') || 
                                trimmed.startsWith('<li') || trimmed.startsWith('</') || 
                                trimmed === '';
            if (isHtmlBlock) {
                processedLines.push(line);
            } else {
                processedLines.push(line + '<br>');
            }
        });

        return processedLines.join('\n');
    }

    let activeChatAbortController = null;

    function handleUserMessage(text) {
        clearActiveTyping();
        const welcomeIntro = messagesContainer.querySelector(".chatbot-welcome-intro");
        if (welcomeIntro) {
            messagesContainer.innerHTML = "";
        }

        addMessage("user", text);

        const indicator = showTypingIndicator();
        const sendBtn = document.getElementById("chatbot-send-btn");
        if (sendBtn) sendBtn.disabled = true;
        if (inputField) inputField.disabled = true;

        if (activeChatAbortController) {
            activeChatAbortController.abort();
        }
        activeChatAbortController = new AbortController();

        fetch("api?action=chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
            signal: activeChatAbortController.signal
        })
        .then(async res => {
            let data;
            try {
                data = await res.json();
            } catch (e) {
                throw new Error(!res.ok ? `Lỗi kết nối máy chủ (${res.status})` : "Phản hồi không hợp lệ");
            }
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Lỗi xử lý câu trả lời từ AI");
            }
            return data;
        })
        .then(data => {
            indicator.remove();
            const replyText = data.reply;
            if (replyText) {
                clearActiveTyping();
                
                activeTypingFullText = replyText;
                const msgDiv = document.createElement("div");
                msgDiv.className = "chat-message bot";
                messagesContainer.appendChild(msgDiv);
                activeTypingDiv = msgDiv;
                
                let currentText = "";
                let index = 0;
                const totalLen = replyText.length;
                const charsPerTick = Math.max(1, Math.ceil(totalLen / 150));
                
                activeTypingTimer = setInterval(() => {
                    if (index >= totalLen) {
                        clearInterval(activeTypingTimer);
                        activeTypingTimer = null;
                        activeTypingDiv = null;
                        activeTypingFullText = "";
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        return;
                    }
                    
                    currentText += replyText.substring(index, index + charsPerTick);
                    index += charsPerTick;
                    
                    msgDiv.innerHTML = formatMarkdown(currentText);
                    
                    const threshold = 60;
                    const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
                    if (isNearBottom) {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                }, 12);
            } else {
                throw new Error("Không nhận được nội dung từ trợ lý AI.");
            }
        })
        .catch(err => {
            if (err.name === 'AbortError') return;
            indicator.remove();
            console.error("Chatbot API error:", err);
            const safeErr = String(err.message || err).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const errorMsg = `<p>🤖 <strong>Trợ lý AI tạm thời gián đoạn:</strong></p>
                <p style="color: #ef4444; font-size: 12.5px; background: rgba(239, 68, 68, 0.08); padding: 8px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2); margin: 6px 0;">${safeErr}</p>
                <p style="font-size: 12px; opacity: 0.85; margin-top: 6px;">Vui lòng thử lại sau giây lát hoặc kiểm tra cấu hình biến môi trường GEMINI_API_KEY.</p>`;
            addMessage("bot", errorMsg, true);
        })
        .finally(() => {
            if (sendBtn) sendBtn.disabled = false;
            if (inputField) {
                inputField.disabled = false;
                inputField.focus();
            }
        });
    }
}
