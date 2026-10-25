/* ==========================================================================
   CHATBOT ASSISTANT LOGIC (GOOGLE GEMINI AI INTEGRATION ONLY)
   ========================================================================== */

// Capture the full-screen height ONCE before any keyboard events
// window.screen.height is the device's physical screen height (never changes)
const SCREEN_FULL_HEIGHT = window.screen.height;

document.addEventListener("DOMContentLoaded", () => {
    initChatbot();
});

function initChatbot() {
    const triggerBtn = document.getElementById("chatbot-trigger-btn");
    const closeBtn = document.getElementById("chatbot-close-btn");
    const backBtn = document.getElementById("chatbot-back-btn");
    const newChatBtn = document.getElementById("chatbot-new-btn");
    const container = document.getElementById("chatbot-container");
    const backdrop = document.getElementById("chatbot-backdrop");
    const inputForm = document.getElementById("chatbot-input-form");
    const inputField = document.getElementById("chatbot-input");
    const messagesContainer = document.getElementById("chatbot-messages");

    if (!container) return;

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

    function openChatbot() {
        container.classList.remove("hidden");
        container.classList.remove("closing");
        if (backdrop && window.innerWidth > 1024) {
            backdrop.classList.remove("hidden");
        }
        document.body.classList.add("chatbot-open");

        // Subtle tactile haptic on mobile
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(8); } catch (e) {}
        }

        // Mobile / Tablet full page: hide app-dashboard after morph transition completes (smooth overlap)
        if (window.innerWidth <= 1024) {
            setTimeout(() => {
                if (document.body.classList.contains("chatbot-open")) {
                    const dashboard = document.getElementById("app-dashboard");
                    if (dashboard) {
                        dashboard.style.setProperty("visibility", "hidden", "important");
                    }
                }
            }, 280);
        }

        // Clean up any stale inline styles
        container.style.removeProperty("height");
        container.style.removeProperty("top");
        container.style.removeProperty("bottom");
        container.style.removeProperty("--keyboard-inset");
        const inputBar = container.querySelector(".chatbot-input-bar");
        if (inputBar) inputBar.classList.remove("keyboard-open");

        // Mobile / Tablet full page: push history state so native back button returns to dashboard
        if (window.innerWidth <= 1024 && (!history.state || !history.state.chatOpen)) {
            history.pushState({ chatOpen: true }, "");
        }

        if (triggerBtn) {
            const chatIcon = triggerBtn.querySelector(".chat-icon");
            const closeIcon = triggerBtn.querySelector(".close-icon");
            if (chatIcon) chatIcon.classList.add("hidden");
            if (closeIcon) closeIcon.classList.remove("hidden");
        }

        // Generate welcome message if empty
        if (messagesContainer && messagesContainer.children.length === 0) {
            sendWelcomeMessage();
        }

        // Render any new icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: container });
        }

        // Scroll messages to bottom smoothly
        if (messagesContainer) {
            requestAnimationFrame(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            });
        }

        // Focus input on every device. Must stay synchronous inside the tap handler:
        // iOS only opens the keyboard for focus() called within a user gesture.
        if (inputField) {
            inputField.focus();
        }
    }

    function closeChatbot(fromPopState = false) {
        if (container.classList.contains("closing")) return;

        // Apple fluid morph-out transition
        container.classList.add("closing");

        // Restore dashboard visibility immediately so it smoothly appears behind the shrinking morph
        const dashboard = document.getElementById("app-dashboard");
        if (dashboard) {
            dashboard.style.removeProperty("visibility");
        }

        // Haptic feedback
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(6); } catch (e) {}
        }

        setTimeout(() => {
            container.classList.remove("closing");
            container.classList.add("hidden");
            if (backdrop) backdrop.classList.add("hidden");
            document.body.classList.remove("chatbot-open");

            // Clean up inline styles from visualViewport resize
            container.style.removeProperty("--keyboard-inset");
            container.style.removeProperty("height");
            container.style.removeProperty("top");
            container.style.removeProperty("bottom");
            const inputBar = container.querySelector(".chatbot-input-bar");
            if (inputBar) inputBar.classList.remove("keyboard-open");

            if (triggerBtn) {
                const chatIcon = triggerBtn.querySelector(".chat-icon");
                const closeIcon = triggerBtn.querySelector(".close-icon");
                if (chatIcon) chatIcon.classList.remove("hidden");
                if (closeIcon) closeIcon.classList.add("hidden");
            }

            // Clean up history state if closed via button
            if (!fromPopState && history.state && history.state.chatOpen) {
                history.back();
            }

            // Update mobile bottom nav active state if needed
            document.querySelectorAll(".mobile-nav-item").forEach(b => b.classList.remove("active"));
            const navOverview = document.getElementById("nav-btn-overview") || document.getElementById("nav-btn-home");
            if (navOverview) navOverview.classList.add("active");

            clearActiveTyping();
        }, 220);
    }

    function toggleChatbot() {
        if (container.classList.contains("hidden")) {
            openChatbot();
        } else {
            closeChatbot();
        }
    }

    // Toggle open/close via trigger button
    if (triggerBtn) {
        triggerBtn.addEventListener("click", toggleChatbot);
    }

    // Close via close button (X)
    if (closeBtn) {
        closeBtn.addEventListener("click", () => closeChatbot(false));
    }

    // Close via back button (←) on mobile/tablet dedicated page
    if (backBtn) {
        backBtn.addEventListener("click", () => closeChatbot(false));
    }

    if (backdrop) {
        backdrop.addEventListener("click", () => closeChatbot(false));
        backdrop.addEventListener("touchstart", (e) => {
            e.preventDefault();
            closeChatbot(false);
        }, { passive: false });
    }

    // Listen to native browser back button (swipe back / Android back)
    window.addEventListener("popstate", () => {
        if (document.body.classList.contains("chatbot-open")) {
            closeChatbot(true);
        }
    });

    // New Chat Action (Gemini / Claude style fresh conversation)
    if (newChatBtn) {
        newChatBtn.addEventListener("click", () => {
            clearActiveTyping();
            if (activeChatAbortController) {
                activeChatAbortController.abort();
                activeChatAbortController = null;
            }
            messagesContainer.innerHTML = "";
            chatHistory = [];
            chatState = null;
            sendWelcomeMessage();
            if (inputField) {
                inputField.value = "";
                inputField.disabled = false;
            }
            const sendBtn = document.getElementById("chatbot-send-btn");
            if (sendBtn) sendBtn.disabled = false;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons({ root: container });
            }
        });
    }


    // Rock-solid visualViewport handler for iOS / Android virtual keyboards
    function handleVisualViewport() {
        if (!document.body.classList.contains("chatbot-open") || window.innerWidth > 1024) {
            container.style.removeProperty("height");
            container.style.removeProperty("top");
            container.style.removeProperty("bottom");
            container.style.removeProperty("--keyboard-inset");
            const inputBar = container.querySelector(".chatbot-input-bar");
            if (inputBar) inputBar.classList.remove("keyboard-open");
            return;
        }

        const inputBar = container.querySelector(".chatbot-input-bar");
        const vv = window.visualViewport;
        if (!vv) return;

        if (window.scrollY !== 0) {
            window.scrollTo(0, 0);
        }

        const visibleHeight = Math.round(vv.height);
        const offsetTop = Math.round(vv.offsetTop || 0);
        const isInputFocused = (document.activeElement === inputField);

        // Use SCREEN_FULL_HEIGHT (never changes) as a baseline to detect keyboard.
        // Keyboard is open when: input is focused AND visibleHeight has shrunk
        // significantly compared to the full screen height.
        // The threshold 0.75 covers all common keyboard sizes (iOS compact/full, Android Gboard).
        const baselineHeight = SCREEN_FULL_HEIGHT || window.innerHeight;
        const isKeyboardOpen = isInputFocused && (visibleHeight < baselineHeight * 0.75);

        if (isKeyboardOpen) {
            container.style.setProperty("top", `${offsetTop}px`, "important");
            container.style.setProperty("height", `${visibleHeight}px`, "important");
            container.style.setProperty("bottom", "auto", "important");
            if (inputBar) inputBar.classList.add("keyboard-open");
        } else {
            container.style.removeProperty("top");
            container.style.removeProperty("height");
            container.style.removeProperty("bottom");
            container.style.removeProperty("--keyboard-inset");
            if (inputBar) inputBar.classList.remove("keyboard-open");
        }

        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", handleVisualViewport);
        window.visualViewport.addEventListener("scroll", handleVisualViewport);
    }

    if (inputField) {
        // Auto-expand textarea & Enter to send like Claude
        inputField.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                inputForm.dispatchEvent(new Event("submit", { cancelable: true }));
            }
        });
        inputField.addEventListener("input", () => {
            inputField.style.height = "auto";
            inputField.style.height = `${Math.min(inputField.scrollHeight, 120)}px`;
        });

        inputField.addEventListener("focus", () => {
            if (window.innerWidth <= 1024) {
                // iOS Safari does not pan the page to reveal an input that is transparent at focus time
                // (gist kiding/72721a0553fa93198ae2bb6eefaa3299). Without that pan, the container simply
                // shrinks to the keyboard top in handleVisualViewport (no header jump, no black frame).
                // ponytail: undocumented WebKit behaviour; if a future iOS drops it we fall back to the pan.
                inputField.style.opacity = "0";
                setTimeout(() => inputField.style.removeProperty("opacity"));
                handleVisualViewport();
                setTimeout(handleVisualViewport, 80);
                setTimeout(handleVisualViewport, 200);
                setTimeout(handleVisualViewport, 400);
            }
        });
        inputField.addEventListener("blur", () => {
            if (window.innerWidth <= 1024) {
                handleVisualViewport();
                setTimeout(handleVisualViewport, 60);
                setTimeout(handleVisualViewport, 200);
                setTimeout(handleVisualViewport, 350);
            }
        });
    }

    // Voice dictation using SpeechRecognition on mic button
    const micBtn = document.getElementById("btn-input-mic");
    if (micBtn) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            let recognition = new SpeechRecognition();
            recognition.lang = 'vi-VN';
            recognition.continuous = false;
            recognition.interimResults = false;
            let isListening = false;

            micBtn.addEventListener("click", () => {
                if (isListening) {
                    recognition.stop();
                    return;
                }
                try {
                    recognition.start();
                    isListening = true;
                    micBtn.classList.add("listening");
                } catch (err) {
                    console.error("Mic error:", err);
                }
            });

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                if (transcript && inputField) {
                    inputField.value = transcript;
                    inputField.style.height = "auto";
                    inputField.style.height = `${Math.min(inputField.scrollHeight, 120)}px`;
                    inputField.focus();
                }
            };
            recognition.onend = () => {
                isListening = false;
                micBtn.classList.remove("listening");
            };
            recognition.onerror = () => {
                isListening = false;
                micBtn.classList.remove("listening");
            };
        } else {
            micBtn.addEventListener("click", () => {
                if (inputField) inputField.focus();
            });
        }
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && container && !container.classList.contains("hidden")) {
            closeChatbot(false);
        }
    });

    // Expose globally for mobile bottom navigation item
    window.openChatbot = openChatbot;
    window.closeChatbot = closeChatbot;
    window.toggleChatbot = toggleChatbot;

    // Handle suggestion chips and 2x2 quick cards click
    container.addEventListener("click", (e) => {
        const chip = e.target.closest(".suggestion-chip, .gemini-prompt-pill, .quick-prompt-card");
        if (!chip) return;

        const query = chip.getAttribute("data-query");
        if (query) {
            handleUserMessage(query);
            if (suggestionsContainer) suggestionsContainer.classList.add("hidden");
        }
    });

    // Handle form submit
    inputForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = inputField.value.trim();
        if (!text) return;

        inputField.value = "";
        inputField.style.height = "auto";
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

        const hour = new Date().getHours();
        let timeGreeting = "Chào buổi sáng";
        if (hour >= 12 && hour < 18) {
            timeGreeting = "Chào buổi chiều";
        } else if (hour >= 18 || hour < 4) {
            timeGreeting = "Chào buổi tối";
        }

        const welcomeHtml = `
            <div class="claude-welcome-hero">
                <div class="welcome-logo-badge">
                    <img src="images/logoapp.webp?v=20260911_v8" alt="SpendMindAI Logo" class="chatbot-welcome-logo" width="52" height="52">
                </div>
                <h1 class="claude-welcome-heading">${timeGreeting}, ${cleanName}</h1>
                <div class="chatbot-quick-grid">
                    <button type="button" class="quick-prompt-card" data-query="số dư">
                        <span class="card-title">Số dư khả dụng</span>
                    </button>
                    <button type="button" class="quick-prompt-card" data-query="tổng quan chi tiêu">
                        <span class="card-title">Tổng quan tháng</span>
                    </button>
                    <button type="button" class="quick-prompt-card" data-query="ngân sách còn lại">
                        <span class="card-title">Ngân sách còn lại</span>
                    </button>
                    <button type="button" class="quick-prompt-card" data-query="lời khuyên tiết kiệm">
                        <span class="card-title">Lời khuyên tài chính</span>
                    </button>
                </div>
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
    let chatHistory = []; // 6 tin gần nhất gửi kèm để chatbot hiểu câu nối tiếp như «chi tiết», «làm lại»
    let chatState = null;

    // Allow user to click to immediately finish/skip typing effect
    messagesContainer.addEventListener("click", () => {
        if (activeTypingTimer) {
            clearActiveTyping();
        }
    });

    function handleUserMessage(text) {
        clearActiveTyping();
        const welcomeHero = messagesContainer.querySelector(".claude-welcome-hero, .welcome-hero-container, .gemini-welcome-hero, .chatbot-welcome-intro");
        if (welcomeHero) {
            messagesContainer.innerHTML = "";
        }

        const trimmedText = text.trim();
        addMessage("user", trimmedText);

        const indicator = showTypingIndicator();
        const sendBtn = document.getElementById("chatbot-send-btn");
        if (sendBtn) sendBtn.disabled = true;
        if (inputField) inputField.disabled = true;

        function renderBotReply(replyText) {
            indicator.remove();
            clearActiveTyping();
            
            activeTypingFullText = replyText;
            const msgDiv = document.createElement("div");
            msgDiv.className = "chat-message bot";
            messagesContainer.appendChild(msgDiv);
            activeTypingDiv = msgDiv;
            
            let currentText = "";
            let index = 0;
            const totalLen = replyText.length;
            // Snappy typing animation: renders smoothly in ~250ms
            const charsPerTick = Math.max(3, Math.ceil(totalLen / 35));
            
            activeTypingTimer = setInterval(() => {
                if (index >= totalLen) {
                    clearActiveTyping();
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
            }, 8);
        }

        if (activeChatAbortController) {
            activeChatAbortController.abort();
        }
        activeChatAbortController = new AbortController();

        fetch("api?action=chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmedText, history: chatHistory, state: chatState }),
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
            const replyText = data.reply;
            if (replyText) {
                chatHistory = chatHistory.concat(
                    { role: "user", text: trimmedText },
                    { role: "bot", text: replyText }
                ).slice(-6);
                chatState = data.state || null;

                renderBotReply(replyText);
            } else {
                throw new Error("Không nhận được nội dung từ trợ lý AI.");
            }
        })
        .catch(err => {
            if (err.name === 'AbortError') return;
            indicator.remove();
            console.error("Chatbot API error:", err);
            const safeErr = String(err.message || err).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const errorMsg = `<p><strong>Trợ lý tài chính phản hồi:</strong></p>
                <p style="color: #ef4444; font-size: 12.5px; background: rgba(239, 68, 68, 0.08); padding: 8px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2); margin: 6px 0;">${safeErr}</p>
                <p style="font-size: 12px; opacity: 0.85; margin-top: 6px;">Vui lòng thử lại sau giây lát hoặc làm mới trang.</p>`;
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

