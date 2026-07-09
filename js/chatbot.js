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
        const displayName = document.getElementById("user-display-name").textContent;
        const cleanName = getFriendlyName(displayName);

        const welcomeHtml = `
            <div class="chatbot-welcome-intro">
                <h2>Xin chào, ${cleanName}</h2>
                <p>Hỏi tôi về số dư, chi tiêu hoặc phân tích tài chính cá nhân của bạn.</p>
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

    let cachedGeminiKey = null;

    function handleUserMessage(text) {
        clearActiveTyping();
        const welcomeIntro = messagesContainer.querySelector(".chatbot-welcome-intro");
        if (welcomeIntro) {
            messagesContainer.innerHTML = "";
        }

        addMessage("user", text);

        const indicator = showTypingIndicator();

        function callGeminiDirectly(apiKey) {
            const categoryLabels = {
                "food": "Ăn uống",
                "transport": "Di chuyển",
                "shopping": "Mua sắm",
                "entertainment": "Giải trí",
                "home": "Nhà cửa",
                "other_expense": "Khác (Chi)",
                "salary": "Lương",
                "freelance": "Freelance",
                "investment": "Đầu tư",
                "gift": "Được tặng / Khác"
            };

            // Format budgets context
            let budgetsText = "";
            const budgetsKeys = Object.keys(state.budgets);
            if (budgetsKeys.length === 0) {
                budgetsText = "- Chưa thiết lập hạn mức ngân sách nào.\n";
            } else {
                budgetsKeys.forEach(k => {
                    const limit = state.budgets[k];
                    if (limit > 0) {
                        const label = categoryLabels[k] || k;
                        budgetsText += `- Hạng mục ${label}: ${Number(limit).toLocaleString('vi-VN')}đ\n`;
                    }
                });
            }

            // Format recent transactions (last 60)
            let transactionsText = "";
            const recentTx = state.transactions.slice(0, 60);
            if (recentTx.length === 0) {
                transactionsText = "- Chưa ghi nhận giao dịch nào.\n";
            } else {
                recentTx.forEach(t => {
                    const typeLabel = (t.type === 'income') ? 'Thu nhập (+)' : 'Chi tiêu (-)';
                    const label = categoryLabels[t.category] || t.category;
                    const desc = t.description ? ` - Ghi chú: ${t.description}` : "";
                    transactionsText += `- Ngày ${t.date}: ${typeLabel} | ${Number(t.amount).toLocaleString('vi-VN')}đ | Danh mục: ${label}${desc}\n`;
                });
            }

            const rawUsername = document.getElementById("user-display-name").textContent;
            const friendlyName = getFriendlyName(rawUsername);
            const now = new Date();
            const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

            let systemPrompt = `Bạn là trợ lý tài chính ảo SpendMindAI thông thái, thân thiện và nhiệt tình của người dùng tên là '${friendlyName}'.\n\n`;
            systemPrompt += "Dưới đây là thông tin tài chính hiện tại của họ lấy từ cơ sở dữ liệu hệ thống:\n\n";
            systemPrompt += "### [DANH SÁCH NGÂN SÁCH/HẠN MỨC CHI TIÊU HÀNG THÁNG]\n" + budgetsText + "\n";
            systemPrompt += "### [LỊCH SỬ 60 GIAO DỊCH GẦN NHẤT]\n" + transactionsText + "\n";
            systemPrompt += "### [CẤU HÌNH THỜI GIAN]\n";
            systemPrompt += `- Thời gian hiện tại trên hệ thống: ${dateStr}\n\n`;
            systemPrompt += "Nhiệm vụ của bạn:\n";
            systemPrompt += "1. Trả lời câu hỏi của người dùng thật ngắn gọn, súc tích, đi thẳng vào trọng tâm, hỏi gì đáp nấy (không trả lời lan man dài dòng, không giải thích vòng vo).\n";
            systemPrompt += "2. CHỈ trả lời và tư vấn các câu hỏi trong phạm vi thông tin tài chính cá nhân được cung cấp ở trên (thu nhập, chi tiêu, số dư, ngân sách, phân tích tài chính). Đối với các câu hỏi ngoài lề hoặc ngoài phạm vi hệ thống (như lập trình, thơ ca, kiến thức xã hội, giải toán, câu hỏi chung...), bạn phải lịch sự từ chối trả lời và hướng người dùng hỏi về tài chính cá nhân.\n";
            systemPrompt += "3. Tuyệt đối không bịa đặt số liệu hay tự tạo ra thông tin không có trong danh sách giao dịch hay ngân sách được cung cấp. Luôn nói đúng sự thật khách quan của dữ liệu.\n";
            systemPrompt += "4. Sử dụng tiếng Việt chuẩn, định dạng markdown gọn đẹp (bảng, danh sách gạch đầu dòng, chữ in đậm) khi trình bày dữ liệu.\n\n";
            systemPrompt += `Câu hỏi của người dùng: "${text}"\n\n`;
            systemPrompt += "Trả lời:";

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

            fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: systemPrompt }
                            ]
                        }
                    ]
                })
            })
                .then(res => {
                    if (!res.ok) {
                        return res.json().then(errData => {
                            throw new Error(errData.error?.message || `Lỗi HTTP ${res.status}`);
                        });
                    }
                    return res.json();
                })
                .then(data => {
                    indicator.remove();
                    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
                        throw new Error("Không có phản hồi từ Gemini.");
                    }
                })
                .catch(err => {
                    indicator.remove();
                    console.error("Gemini Direct API error:", err);
                    const errorMsg = `<p>🤖 <strong>Lỗi gọi trực tiếp Gemini API từ trình duyệt:</strong></p>
                <p style="color: #ef4444; font-size: 12.5px; background: rgba(239, 68, 68, 0.08); padding: 8px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2); margin: 6px 0;">${err.message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
                <p style="font-size: 12px; opacity: 0.85; margin-top: 6px;">Vui lòng kiểm tra lại tính hợp lệ hoặc giới hạn địa lý của API Key của bạn.</p>`;
                    addMessage("bot", errorMsg, true);
                });
        }

        // Get or fetch the Gemini API key, then execute query
        if (cachedGeminiKey) {
            callGeminiDirectly(cachedGeminiKey);
        } else {
            fetch("api.php?action=get_gemini_key")
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.key) {
                        cachedGeminiKey = data.key;
                        callGeminiDirectly(cachedGeminiKey);
                    } else {
                        indicator.remove();
                        const errorMsg = `<p>🤖 <strong>Trợ lý AI chưa hoạt động.</strong></p>
                    <p>Vui lòng cấu hình khóa <code>GEMINI_API_KEY</code> trong tệp <code>.env</code> trên máy tính rồi chạy deploy lại nhé!</p>`;
                        addMessage("bot", errorMsg, true);
                    }
                })
                .catch(err => {
                    indicator.remove();
                    console.error("Failed to fetch API key from backend:", err);
                    const errorMsg = `<p>🤖 <strong>Trợ lý AI gặp lỗi kết nối với máy chủ.</strong></p>
                <p>Không thể lấy khóa cấu hình từ backend.</p>`;
                    addMessage("bot", errorMsg, true);
                });
        }
    }
}
