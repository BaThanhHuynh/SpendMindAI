/* ==========================================================================
   DASHBOARD SCRIPT - TRANSACTION CRUD, BUDGETS & CHART.JS (QUAN LY CHI TIEU)
   ========================================================================== */

// --- 1. CATEGORY CONFIGURATIONS ---
const CATEGORIES = {
    food: { label: "Ăn uống", icon: "utensils", colorClass: "badge-color-mint", type: "expense" },
    transport: { label: "Di chuyển", icon: "car", colorClass: "badge-color-sage", type: "expense" },
    shopping: { label: "Mua sắm", icon: "shopping-bag", colorClass: "badge-color-sprout", type: "expense" },
    entertainment: { label: "Giải trí", icon: "gamepad-2", colorClass: "badge-color-pistachio", type: "expense" },
    home: { label: "Nhà cửa", icon: "home", colorClass: "badge-color-teal", type: "expense" },
    other_expense: { label: "Khác (Chi)", icon: "help-circle", colorClass: "badge-color-forest", type: "expense" },

    salary: { label: "Lương", icon: "banknote", colorClass: "badge-color-emerald", type: "income" },
    freelance: { label: "Freelance / Thêm", icon: "briefcase", colorClass: "badge-color-pine", type: "income" },
    investment: { label: "Đầu tư", icon: "trending-up", colorClass: "badge-color-lime", type: "income" },
    gift: { label: "Được tặng / Khác", icon: "gift", colorClass: "badge-color-moss", type: "income" }
};

const DEFAULT_BUDGETS = {
    food: 0,
    transport: 0,
    shopping: 0,
    entertainment: 0,
    home: 0,
    other_expense: 0
};

// Initial State
let state = {
    transactions: [],
    budgets: { ...DEFAULT_BUDGETS },
    theme: "dark",
    isLoading: true
};

// User Settings State (Global)
let userSettingsState = {
    email: '',
    googleId: null,
    reminderTime: '',
    emailNotifications: 0,
    zaloPhone: '',
    zaloUserId: '',
    zaloNotifications: 0,
    appNotifications: 1
};
window.state = state;
window.userSettingsState = userSettingsState;

// Chart.js Instances
let trendChartInstance = null;

// Utility function to escape HTML
function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

// Scoped icon helper to prevent scanning the entire document on every minor DOM update
function renderScopedIcons(rootElement) {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        if (rootElement && (rootElement instanceof Element || rootElement instanceof DocumentFragment)) {
            lucide.createIcons({ root: rootElement });
        } else {
            lucide.createIcons();
        }
    }
}

// Calendar State
let currentCalendarDate = new Date();
let selectedCalendarDay = new Date();
let zaloEnableRequested = false; // bật Zalo khi chưa có số điện thoại → chờ lưu ở trang con
let currentDayEditTime = null;

// API Endpoint configuration
const API_URL = "api";

// --- 2. INITIALIZATION & ROUTING SECURITY ---
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initInitialSkeletons();
    checkAuthSession(); // Session guard (Redirects to login.html if guest)
    populateCategorySelectors();
    initEventListeners();
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

function initInitialSkeletons() {
    if (state.isLoading && window.SkeletonRenderer) {
        const gridCells = document.getElementById("calendar-grid-cells");
        if (gridCells && (!gridCells.children || gridCells.children.length === 0)) {
            gridCells.innerHTML = window.SkeletonRenderer.renderCalendarGridSkeleton(35);
        }
        const dailyTransactionsList = document.getElementById("daily-transactions-list");
        if (dailyTransactionsList && (!dailyTransactionsList.children || dailyTransactionsList.children.length === 0)) {
            dailyTransactionsList.innerHTML = window.SkeletonRenderer.renderFeedListSkeleton(5);
        }
    }
}

// Re-verify session on back/forward browser cache navigation (bfcache)
window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
        checkAuthSession();
    }
});

// Secure Session Guard Check
function checkAuthSession() {
    if (!navigator.onLine) {
        console.warn("Offline mode: retaining cached dashboard view, suppressing redirect.");
        const appDashboard = document.getElementById("app-dashboard");
        if (appDashboard) appDashboard.classList.remove("hidden");
        return;
    }
    fetch(`${API_URL}?action=check_session&include_state=1`)
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                // Remove hidden class and display dashboard
                document.getElementById("app-dashboard").classList.remove("hidden");
                let friendlyName = (data.username || 'bạn').trim();
                if (friendlyName.includes("@")) {
                    friendlyName = friendlyName.split("@")[0];
                }
                
                const isRawUsername = /^[a-z0-9._-]+$/i.test(friendlyName);
                if (isRawUsername) {
                    friendlyName = friendlyName.replace(/\d+$/, '');
                    friendlyName = friendlyName.replace(/[._-]/g, ' ');
                    friendlyName = friendlyName.split(' ')
                        .filter(w => w.length > 0)
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ');
                }
                
                if (friendlyName.toLowerCase() === "huynhbathanh" || friendlyName.toLowerCase() === "huynh bathanh") {
                    friendlyName = "Bá Thành";
                }
                
                document.getElementById("user-display-name").textContent = friendlyName;
                
                // Update avatar image safely
                updateAvatarUI(data.avatar_url);
                
                // Pre-populate userSettingsState immediately from initial session response
                if (data.email) userSettingsState.email = data.email;
                if (data.google_id) userSettingsState.googleId = data.google_id;
                if (data.reminder_time) userSettingsState.reminderTime = data.reminder_time;
                if (data.email_notifications !== undefined) userSettingsState.emailNotifications = Number(data.email_notifications);
                if (data.zalo_phone) userSettingsState.zaloPhone = data.zalo_phone;
                if (data.zalo_user_id) userSettingsState.zaloUserId = data.zalo_user_id;
                if (data.zalo_notifications !== undefined) userSettingsState.zaloNotifications = Number(data.zalo_notifications);
                updateSettingsStatusBadges();
                
                // If combined state returned in 1 round-trip, initialize directly
                if (Array.isArray(data.transactions)) {
                    state.transactions = data.transactions;
                    state.budgets = (data.budgets && Object.keys(data.budgets).length > 0)
                        ? data.budgets
                        : { ...DEFAULT_BUDGETS };
                    updateUI(true);
                } else {
                    fetchStateFromServer(); // Fallback to secondary fetch if omitted
                }
                
                // Trigger Lazy Cron Check here
                triggerLazyCronReminderCheck();
            } else {
                // If not authenticated and online, kick back to login immediately
                if (navigator.onLine) {
                    window.location.href = "login";
                }
            }
        })

        .catch(err => {
            console.error("Auth Guard error:", err);
            // DO NOT redirect to login if user is offline or fetch failed due to network disconnection
            if (!navigator.onLine || err.name === 'TypeError' || String(err.message || '').includes('Failed to fetch')) {
                console.warn("Network offline error. Retaining dashboard UI without redirect.");
                const appDashboard = document.getElementById("app-dashboard");
                if (appDashboard) appDashboard.classList.remove("hidden");
                return;
            }
            window.location.href = "login";
        });
}

// Update Logo Avatar UI with strict URL protocol verification
function updateAvatarUI(avatarUrl) {
    const logoIcon = document.querySelector(".logo-area .logo-icon");
    if (logoIcon) {
        logoIcon.innerHTML = "";
        const img = document.createElement("img");
        img.src = "images/logoapp.webp?v=20260911_v8";
        img.alt = "SpendMindAI Logo";
        img.width = 38;
        img.height = 38;
        img.loading = "lazy";
        logoIcon.appendChild(img);
        logoIcon.classList.add("has-image");
    }

    // Display user profile avatar cleanly on the settings button if available
    if (avatarUrl && (avatarUrl.startsWith("https://") || avatarUrl.startsWith("http://"))) {
        const btnSettings = document.getElementById("btn-settings");
        if (btnSettings && !btnSettings.querySelector(".user-avatar-img")) {
            btnSettings.innerHTML = `<img src="${avatarUrl}" class="user-avatar-img" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; border: none;">`;
        }
    }
}

// Lazy Cron reminder checker
function triggerLazyCronReminderCheck() {
    if (!navigator.onLine) return;
    fetch(`${API_URL}?action=check_and_send_reminder`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.sent) {
                if (data.simulated) {
                    showToast(`⏰ [Nhắc nhở] Đã gửi thư nhắc nhập thu chi đến Gmail của bạn! (Chi tiết ở email_outbox.log)`, "success");
                } else {
                    showToast(`⏰ [Nhắc nhở] Đã gửi thư nhắc nhở nhập thu chi đến Gmail của bạn!`, "success");
                }
            }
        })
        .catch(err => {
            console.error("Lazy Cron error:", err);
        });
}

// Fetch all transactions and budgets from server API
function fetchStateFromServer() {
    if (!navigator.onLine) {
        console.warn("Offline mode: skipping fetchStateFromServer to prevent network errors.");
        return;
    }
    fetch(API_URL)
        .then(response => {
            if (response.status === 401) {
                if (navigator.onLine) {
                    window.location.href = "login";
                }
                throw new Error("Phiên làm việc đã hết hạn");
            }
            if (!response.ok) {
                throw new Error("Lỗi kết nối máy chủ API");
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                state.transactions = data.transactions || [];
                
                if (data.budgets && Object.keys(data.budgets).length > 0) {
                    state.budgets = data.budgets;
                } else {
                    state.budgets = { ...DEFAULT_BUDGETS };
                }
                
                updateUI();
                // Use double-rAF to ensure the browser has fully painted before forcing
                // a reflow. This is more reliable than setTimeout for fixing the calendar
                // grid aspect-ratio glitch on mobile browsers.
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        updateUI(false);
                    });
                });
            } else {
                showToast("Lỗi tải dữ liệu: " + data.message, "error");
            }
        })
        .catch(error => {
            console.error("Fetch API error:", error);
        });
}

// Set initial date in form to match the active selected calendar day
function setTodayInDateInput() {
    const day = String(selectedCalendarDay.getDate()).padStart(2, '0');
    const month = String(selectedCalendarDay.getMonth() + 1).padStart(2, '0');
    const year = selectedCalendarDay.getFullYear();
    document.getElementById("date").value = `${year}-${month}-${day}`;
}

// Set specific theme
function setTheme(themeName) {
    state.theme = themeName;
    localStorage.setItem("quan_ly_chi_tieu_theme", themeName);
    
    if (themeName === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    } else {
        document.documentElement.setAttribute("data-theme", themeName);
    }
    
    // Update checkmarks in theme sub-panel
    updateThemeSubPanelUI();
    
    renderCharts();
}

// Initialize layout theme
function initTheme() {
    // One-time migration (2026-06): make dark the default look for everyone.
    if (!localStorage.getItem("qlct_theme_migrated_v3")) {
        localStorage.setItem("quan_ly_chi_tieu_theme", "system");
        localStorage.setItem("qlct_theme_migrated_v3", "1");
    }
    const storedTheme = localStorage.getItem("quan_ly_chi_tieu_theme") || "system";
    setTheme(storedTheme);

    // Listen for system theme changes
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        if (state.theme === "system") {
            document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
            renderCharts();
        }
    });
}

// Populate Categories inside form and filter dropdowns
function populateCategorySelectors() {
    const categorySelect = document.getElementById("category");
    const filterCategorySelect = document.getElementById("filter-category");
    
    categorySelect.innerHTML = '<option value="" disabled selected>Chọn danh mục...</option>';
    const transactionType = document.querySelector('input[name="type"]:checked').value;
    
    Object.keys(CATEGORIES).forEach(key => {
        const cat = CATEGORIES[key];
        if (cat.type === transactionType && key !== 'other_expense' && key !== 'gift') {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = cat.label;
            categorySelect.appendChild(option);
        }
    });

    const customCategories = new Set();
    state.transactions.forEach(t => {
        if (t.type === transactionType && !CATEGORIES[t.category]) {
            customCategories.add(t.category);
        }
    });

    customCategories.forEach(customCat => {
        const option = document.createElement("option");
        option.value = customCat;
        option.textContent = customCat;
        categorySelect.appendChild(option);
    });

    const otherKey = transactionType === 'expense' ? 'other_expense' : 'gift';
    if (CATEGORIES[otherKey]) {
        const option = document.createElement("option");
        option.value = otherKey;
        option.textContent = "Khác (Tùy chỉnh...)";
        categorySelect.appendChild(option);
    }

    filterCategorySelect.innerHTML = '<option value="all">Tất cả danh mục</option>';
    Object.keys(CATEGORIES).forEach(key => {
        const cat = CATEGORIES[key];
        const option = document.createElement("option");
        option.value = key;
        option.textContent = `${cat.type === 'income' ? '[Thu]' : '[Chi]'} ${cat.label}`;
        filterCategorySelect.appendChild(option);
    });

    const allCustomCategories = new Set();
    state.transactions.forEach(t => {
        if (!CATEGORIES[t.category]) {
            allCustomCategories.add({ cat: t.category, type: t.type });
        }
    });
    const uniqueCustomCats = new Map();
    allCustomCategories.forEach(item => { uniqueCustomCats.set(item.cat, item.type); });
    uniqueCustomCats.forEach((type, cat) => {
        const option = document.createElement("option");
        option.value = cat;
        option.textContent = `${type === 'income' ? '[Thu]' : '[Chi]'} ${cat}`;
        filterCategorySelect.appendChild(option);
    });
}

// --- MODAL FUNCTIONS ---
// Đóng kiểu Apple (như closeChatbot): thêm .closing cho CSS chạy hiệu ứng đóng, đợi animationend
// của chính phần tử (có hẹn giờ dự phòng) rồi mới .hidden và gọi onHidden.
function closeWithAnimation(el, onHidden) {
    if (!el || el._finishClose) return;
    if (el.classList.contains("hidden")) {
        if (onHidden) onHidden();
        return;
    }
    // Apple fluid haptic feedback on close
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(6); } catch (e) {}
    }
    const finish = (e) => {
        if (e && e.target !== el && !e.target.classList.contains("modal-content") && !e.target.classList.contains("day-edit-card")) return;
        el.removeEventListener("animationend", finish);
        clearTimeout(timer);
        el._finishClose = null;
        el.classList.remove("closing");
        el.classList.add("hidden");
        if (onHidden) onHidden();
    };
    const timer = setTimeout(() => finish(), 220);
    el._finishClose = finish;
    el.addEventListener("animationend", finish);
    el.classList.add("closing");
}

// Mở lại khi đang đóng dở: kết thúc ngay lần đóng đó để phần dọn dẹp chạy trước khi mở
function finishClosing(el) {
    if (el && el._finishClose) el._finishClose();
}

function openTransactionModal() {
    const modal = document.getElementById("transaction-modal");
    if (modal) {
        finishClosing(modal);
        // Apple fluid haptic feedback on open
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(8); } catch (e) {}
        }
        modal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    }
}

function closeTransactionModal() {
    const modal = document.getElementById("transaction-modal");
    closeWithAnimation(modal, () => {
        // Only remove modal-open if day-edit-modal is also closed
        const dayModal = document.getElementById("day-edit-modal");
        if (!dayModal || dayModal.classList.contains("hidden")) {
            document.body.classList.remove("modal-open");
        }
        resetTransactionForm();
    });
}

// --- DAY EDIT MODAL FUNCTIONS (HỘP CỬA SỔ NHỎ "CHỈNH SỬA" TRÊN MOBILE & TABLET) ---
function openDayEditModal(time) {
    currentDayEditTime = time;
    renderDayEditModalContent(time);
    const modal = document.getElementById("day-edit-modal");
    if (modal) {
        finishClosing(modal);
        // Apple fluid haptic feedback on open
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(8); } catch (e) {}
        }
        modal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    }
}

function closeDayEditModal() {
    const modal = document.getElementById("day-edit-modal");
    closeWithAnimation(modal, () => {
        const txModal = document.getElementById("transaction-modal");
        if (!txModal || txModal.classList.contains("hidden")) {
            document.body.classList.remove("modal-open");
        }
    });
    currentDayEditTime = null;
}

function renderDayEditModalContent(time) {
    if (!time) return;
    const targetDate = new Date(time);
    const dayTransactions = state.transactions.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === targetDate.getFullYear() &&
               d.getMonth() === targetDate.getMonth() &&
               d.getDate() === targetDate.getDate();
    });

    const dateLabelEl = document.getElementById("day-edit-date-label");
    if (dateLabelEl) {
        dateLabelEl.textContent = formatSelectedDateLabel(targetDate);
    }

    let income = 0;
    let expense = 0;
    dayTransactions.forEach(t => {
        if (t.type === 'income') income += t.amount;
        else expense += t.amount;
    });
    const net = income - expense;

    const incomeEl = document.getElementById("day-edit-income");
    const expenseEl = document.getElementById("day-edit-expense");
    const netEl = document.getElementById("day-edit-net");
    const countEl = document.getElementById("day-edit-tx-count");
    const listEl = document.getElementById("day-edit-tx-list");
    const emptyEl = document.getElementById("day-edit-empty");

    if (incomeEl) incomeEl.textContent = '+' + formatNumberWithCommas(income) + 'đ';
    if (expenseEl) expenseEl.textContent = '-' + formatNumberWithCommas(expense) + 'đ';
    if (netEl) {
        netEl.textContent = (net < 0 ? '-' : (net > 0 ? '+' : '')) + formatNumberWithCommas(Math.abs(net)) + 'đ';
        netEl.className = 'stat-net ' + (net >= 0 ? 'stat-income' : 'stat-expense');
    }
    if (countEl) countEl.textContent = `${dayTransactions.length} mục`;

    if (!listEl) return;
    listEl.innerHTML = "";

    if (dayTransactions.length === 0) {
        if (emptyEl) emptyEl.style.display = "flex";
        listEl.style.display = "none";
    } else {
        if (emptyEl) emptyEl.style.display = "none";
        listEl.style.display = "flex";

        const fragment = document.createDocumentFragment();
        dayTransactions.forEach(t => {
            const cat = CATEGORIES[t.category] || { label: t.category, icon: "help-circle", colorClass: "badge-color-mint" };
            const isIncome = t.type === 'income';

            const itemEl = document.createElement("div");
            itemEl.className = "day-edit-item";
            itemEl.dataset.id = t.id;

            itemEl.innerHTML = `
                <div class="day-edit-item-left">
                    <div class="day-edit-item-icon ${cat.colorClass}">
                        <i data-lucide="${cat.icon}"></i>
                    </div>
                    <div class="day-edit-item-info">
                        <span class="day-edit-item-cat">${escapeHTML(cat.label)}</span>
                        ${t.description ? `<span class="day-edit-item-desc">${escapeHTML(t.description)}</span>` : ''}
                    </div>
                </div>
                <div class="day-edit-item-right">
                    <span class="day-edit-item-amount ${isIncome ? 'income' : 'expense'}">
                        ${isIncome ? '+' : '-'}${formatNumberWithCommas(t.amount)}đ
                    </span>
                    <div class="day-edit-item-actions">
                        <button type="button" class="btn-action-edit" data-id="${t.id}" title="Chỉnh sửa số liệu" aria-label="Chỉnh sửa">
                            <i data-lucide="pencil"></i>
                            <span>Sửa</span>
                        </button>
                        <button type="button" class="btn-action-delete" data-id="${t.id}" title="Xóa giao dịch" aria-label="Xóa">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
            `;
            fragment.appendChild(itemEl);
        });

        listEl.appendChild(fragment);
    }

    const modal = document.getElementById("day-edit-modal");
    if (modal) {
        renderScopedIcons(modal);
    }
}

// Controller nhận diện cử chỉ nhấn giữ (Long-press) trên ô lịch cho Mobile & Tablet
function initCalendarLongPress(calendarGrid) {
    if (!calendarGrid) return null;

    let longPressTimer = null;
    let longPressTriggered = false;
    let startX = 0;
    let startY = 0;
    let currentCell = null;

    function isTouchOrMobileDevice() {
        return window.innerWidth <= 1024 || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    function cancelTimer() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (currentCell) {
            currentCell.classList.remove("cell-pressing");
            currentCell = null;
        }
    }

    function fireLongPress(cell) {
        longPressTriggered = true;
        cell.classList.remove("cell-pressing");
        cell.classList.add("cell-pressed");
        setTimeout(() => cell.classList.remove("cell-pressed"), 300);

        if (navigator.vibrate) {
            try { navigator.vibrate(40); } catch (_) {}
        }

        const time = Number(cell.dataset.time);
        if (time) {
            selectCalendarDay(time);
            togglePopover("month-popover", false);
            openDayEditModal(time);
        }
    }

    // Touch listeners
    calendarGrid.addEventListener("touchstart", (e) => {
        if (!isTouchOrMobileDevice()) return;

        const cell = e.target.closest(".calendar-cell");
        if (!cell || !cell.dataset.time) return;

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        currentCell = cell;
        longPressTriggered = false;

        currentCell.classList.add("cell-pressing");

        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            if (currentCell) {
                fireLongPress(currentCell);
            }
        }, 450);
    }, { passive: true });

    calendarGrid.addEventListener("touchmove", (e) => {
        if (!longPressTimer) return;
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);
        if (dx > 8 || dy > 8) {
            cancelTimer();
        }
    }, { passive: true });

    calendarGrid.addEventListener("touchend", (e) => {
        if (currentCell) {
            currentCell.classList.remove("cell-pressing");
        }
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (longPressTriggered) {
            e.preventDefault();
            setTimeout(() => {
                longPressTriggered = false;
            }, 180);
        }
        currentCell = null;
    });

    calendarGrid.addEventListener("touchcancel", () => {
        cancelTimer();
        longPressTriggered = false;
    });

    // Mouse listeners for tablet with trackpad / browser DevTools responsive testing
    calendarGrid.addEventListener("mousedown", (e) => {
        if (window.innerWidth > 1024) return; // Desktop mouse behavior stays untouched
        if (e.button !== 0) return;

        const cell = e.target.closest(".calendar-cell");
        if (!cell || !cell.dataset.time) return;

        startX = e.clientX;
        startY = e.clientY;
        currentCell = cell;
        longPressTriggered = false;

        currentCell.classList.add("cell-pressing");

        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            if (currentCell) {
                fireLongPress(currentCell);
            }
        }, 450);
    });

    calendarGrid.addEventListener("mousemove", (e) => {
        if (!longPressTimer) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > 8 || dy > 8) {
            cancelTimer();
        }
    });

    calendarGrid.addEventListener("mouseup", () => {
        if (currentCell) {
            currentCell.classList.remove("cell-pressing");
        }
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (longPressTriggered) {
            setTimeout(() => {
                longPressTriggered = false;
            }, 180);
        }
        currentCell = null;
    });

    calendarGrid.addEventListener("contextmenu", (e) => {
        if (isTouchOrMobileDevice()) {
            const cell = e.target.closest(".calendar-cell");
            if (cell) {
                e.preventDefault();
            }
        }
    });

    return {
        wasLongPressed: () => longPressTriggered
    };
}

// Setup Event Listeners
function initEventListeners() {
    
    const typeRadios = document.querySelectorAll('input[name="type"]');
    typeRadios.forEach(radio => {
        radio.addEventListener("change", () => {
            populateCategorySelectors();
            const customCat = document.getElementById("custom-category");
            if (customCat) {
                customCat.classList.add("hidden");
                customCat.removeAttribute("required");
            }
        });
    });

    const categoryEl = document.getElementById("category");
    if (categoryEl) {
        categoryEl.addEventListener("change", function() {
            const customInput = document.getElementById("custom-category");
            if (!customInput) return;
            if (this.value === "other_expense" || this.value === "gift") {
                customInput.classList.remove("hidden");
                customInput.setAttribute("required", "required");
                customInput.focus();
            } else {
                customInput.classList.add("hidden");
                customInput.removeAttribute("required");
                customInput.value = "";
            }
        });
    }

    const txForm = document.getElementById("transaction-form");
    if (txForm) txForm.addEventListener("submit", handleFormSubmit);

    const btnCancelEdit = document.getElementById("btn-cancel-edit");
    if (btnCancelEdit) btnCancelEdit.addEventListener("click", cancelEditMode);

    const btnToggleBudget = document.getElementById("btn-toggle-budget-settings");
    if (btnToggleBudget) btnToggleBudget.addEventListener("click", toggleBudgetSettings);

    const budgetForm = document.getElementById("budget-form");
    if (budgetForm) budgetForm.addEventListener("submit", handleBudgetSubmit);

    // Phần trăm hạn mức: máy tính rê chuột (CSS :hover), điện thoại chạm vào thanh để bật/tắt
    const budgetProgress = document.getElementById("budget-progress-container");
    if (budgetProgress) {
        budgetProgress.addEventListener("click", (e) => {
            const bar = e.target.closest(".progress-bar-bg[data-pct]");
            budgetProgress.querySelectorAll(".show-pct").forEach(el => { if (el !== bar) el.classList.remove("show-pct"); });
            if (bar) bar.classList.toggle("show-pct");
        });
    }

    let searchDebounceTimer = null;
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                updateUI(false);
            }, 120);
        });
    }

    const filterType = document.getElementById("filter-type");
    if (filterType) filterType.addEventListener("change", () => updateUI());

    const filterCat = document.getElementById("filter-category");
    if (filterCat) filterCat.addEventListener("change", () => updateUI());

    const btnExport = document.getElementById("btn-export");
    if (btnExport) btnExport.addEventListener("click", exportData);
    
    const importTrigger = document.getElementById("btn-import-trigger");
    const fileInput = document.getElementById("import-file");
    if (importTrigger && fileInput) {
        importTrigger.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", importData);
    }

    // Event delegation for calendar grid and daily transactions list
    const calendarGrid = document.getElementById("calendar-grid-cells");
    let calendarLongPress = null;
    if (calendarGrid) {
        calendarLongPress = initCalendarLongPress(calendarGrid);

        calendarGrid.addEventListener("click", (e) => {
            if (calendarLongPress && calendarLongPress.wasLongPressed()) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            const cell = e.target.closest(".calendar-cell");
            if (cell && cell.dataset.time) {
                selectCalendarDay(Number(cell.dataset.time));
                togglePopover("month-popover", false);
            }
        });
    }

    // Day Edit Modal Event Listeners
    const dayEditTxList = document.getElementById("day-edit-tx-list");
    if (dayEditTxList) {
        dayEditTxList.addEventListener("click", (e) => {
            const btnDelete = e.target.closest(".btn-action-delete");
            if (btnDelete && btnDelete.dataset.id) {
                e.stopPropagation();
                deleteTransaction(btnDelete.dataset.id);
                return;
            }

            const btnEdit = e.target.closest(".btn-action-edit");
            if (btnEdit && btnEdit.dataset.id) {
                e.stopPropagation();
                const id = btnEdit.dataset.id;
                closeDayEditModal();
                editTransaction(id);
                return;
            }

            const item = e.target.closest(".day-edit-item");
            if (item && item.dataset.id) {
                e.stopPropagation();
                const id = item.dataset.id;
                closeDayEditModal();
                editTransaction(id);
                return;
            }
        });
    }

    const btnCloseDayEdit = document.getElementById("btn-close-day-edit");
    if (btnCloseDayEdit) {
        btnCloseDayEdit.addEventListener("click", closeDayEditModal);
    }

    const dayEditModal = document.getElementById("day-edit-modal");
    if (dayEditModal) {
        dayEditModal.addEventListener("click", (e) => {
            if (e.target === dayEditModal) {
                closeDayEditModal();
            }
        });
    }

    const btnDayEditAdd = document.getElementById("btn-day-edit-add");
    if (btnDayEditAdd) {
        btnDayEditAdd.addEventListener("click", () => {
            const time = currentDayEditTime || selectedCalendarDay.getTime();
            closeDayEditModal();
            openTransactionModalForDate(time);
        });
    }

    const dailyTransactionsList = document.getElementById("daily-transactions-list");
    if (dailyTransactionsList) {
        initDailySwipeToDelete(dailyTransactionsList);

        dailyTransactionsList.addEventListener("click", (e) => {
            // 1. Click on revealed swipe delete button
            const btnSwipe = e.target.closest(".btn-swipe-delete");
            if (btnSwipe && btnSwipe.dataset.id) {
                e.stopPropagation();
                deleteTransaction(btnSwipe.dataset.id);
                return;
            }

            // 2. Click on desktop/inline trash button
            const btnDelete = e.target.closest(".btn-daily-delete");
            if (btnDelete && btnDelete.dataset.id) {
                e.stopPropagation();
                deleteTransaction(btnDelete.dataset.id);
                return;
            }

            // 3. Click on swiped wrapper/item -> close swipe instead of opening edit
            const wrapper = e.target.closest(".daily-item-swipe-wrapper");
            if (wrapper && wrapper.classList.contains("is-swiped")) {
                e.stopPropagation();
                wrapper.classList.remove("is-swiped");
                const item = wrapper.querySelector(".daily-item");
                if (item) item.style.transform = "translate3d(0, 0, 0)";
                return;
            }

            // 4. Click on normal item -> open edit modal
            const item = e.target.closest(".daily-item");
            if (item && item.dataset.id) {
                editTransaction(item.dataset.id);
            }
        });
    }

    // Logout Click Handler
    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) btnLogout.addEventListener("click", handleLogout);

    // Settings Dropdown Event Listeners
    const btnSettings = document.getElementById("btn-settings");
    if (btnSettings) {
        btnSettings.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSettingsDropdown();
        });
    }

    const btnCloseSettings = document.getElementById("btn-close-settings-dropdown");
    if (btnCloseSettings) {
        btnCloseSettings.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSettingsDropdown();
        });
    }

    const settingsBackdrop = document.getElementById("settings-backdrop");
    if (settingsBackdrop) {
        settingsBackdrop.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSettingsDropdown();
        });
    }

    const settingsForm = document.getElementById("settings-notification-form");
    if (settingsForm) settingsForm.addEventListener("submit", handleSettingsSubmit);
    
    // Click on settings rows to open corresponding sub-panels
    const menuItemReminder = document.getElementById("menu-item-reminder");
    if (menuItemReminder) {
        menuItemReminder.addEventListener("click", (e) => {
            e.stopPropagation();
            openSubPanel("reminder");
        });
    }
    
    // Stop propagation on the switch label/slider to prevent opening subpanel
    const labelSwitch = document.querySelector("#menu-item-reminder .switch");
    if (labelSwitch) {
        labelSwitch.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    }

    const reminderToggle = document.getElementById("settings-reminder-toggle");
    if (reminderToggle) {
        reminderToggle.addEventListener("click", (e) => {
            e.stopPropagation();
        });
        reminderToggle.addEventListener("change", (e) => {
            const isChecked = e.target.checked;
            const zaloNotifications = isChecked ? 1 : 0;
            const zaloPhone = userSettingsState.zaloPhone || "";
            const reminderTime = userSettingsState.reminderTime || "20:00";

            if (isChecked && !zaloPhone) {
                showToast("Vui lòng nhập Số điện thoại Zalo của bạn trước khi kích hoạt.", "info");
                e.target.checked = false;
                openSubPanel("reminder");
                zaloEnableRequested = true; // lưu xong số điện thoại thì bật luôn
                const phoneInput = document.getElementById("settings-zalo-phone");
                if (phoneInput) phoneInput.focus();
                return;
            }

            fetch(`${API_URL}?action=save_notification_settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    zalo_phone: zaloPhone,
                    reminder_time: reminderTime,
                    zalo_notifications: zaloNotifications,
                    email: userSettingsState.email || ""
                })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.message || "Lưu cài đặt thất bại"); });
                }
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    showToast(data.message, "success");
                    userSettingsState.zaloNotifications = zaloNotifications;
                    userSettingsState.reminderTime = reminderTime;

                    updateSettingsStatusBadges();
                    triggerLazyCronReminderCheck();
                } else {
                    showToast("Lỗi: " + data.message, "error");
                    e.target.checked = !isChecked;
                }
            })
            .catch(err => {
                showToast(err.message, "error");
                e.target.checked = !isChecked;
            });
        });
    }

    const btnTestZalo = document.getElementById("btn-test-zalo");
    if (btnTestZalo) {
        btnTestZalo.addEventListener("click", handleTestZaloClick);
    }

    const zaloPhoneInput = document.getElementById("settings-zalo-phone");
    if (zaloPhoneInput) {
        zaloPhoneInput.addEventListener("input", (e) => {
            const openZaloBtn = document.getElementById("btn-open-zalo-direct");
            if (openZaloBtn) {
                const clean = e.target.value.replace(/\D/g, '');
                if (clean.length >= 10) {
                    openZaloBtn.href = `https://zalo.me/${clean}`;
                    openZaloBtn.style.display = "flex";
                    renderScopedIcons(openZaloBtn);
                } else {
                    openZaloBtn.style.display = "none";
                }
            }
        });
    }

    
    // Modal Event Listeners
    const btnCloseModal = document.getElementById("btn-close-transaction-modal");
    if (btnCloseModal) {
        btnCloseModal.addEventListener("click", closeTransactionModal);
    }
    const transactionModal = document.getElementById("transaction-modal");
    if (transactionModal) {
        transactionModal.addEventListener("click", (e) => {
            if (e.target === transactionModal) {
                closeTransactionModal();
            }
        });
    }

    // Format amount inputs with commas
    const amountInputs = document.querySelectorAll('input[id="amount"], input[id^="budget-limit-"]');
    amountInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            let value = e.target.value.replace(/[^\d]/g, '');
            if (value !== '') {
                e.target.value = parseInt(value, 10).toLocaleString('en-US');
            }
        });
    });

    // Sub-panels close buttons (closes the entire dropdown menu)
    ["btn-close-reminder-sub", "btn-close-app-notif-sub"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", closeSettingsDropdown);
    });

    // Back buttons click in sub-panels (goes back to main menu panel)
    document.querySelectorAll(".btn-back-settings").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSubPanels();
        });
    });

    // Theme options list checkmark select triggers
    const themeLabels = { light: "Sáng", dark: "Tối", system: "Hệ thống" };
    Object.entries(themeLabels).forEach(([thm, label]) => {
        const opt = document.getElementById(`opt-theme-${thm}`);
        if (opt) {
            opt.addEventListener("click", () => {
                if (state.theme !== thm) {
                    setTheme(thm);
                    showToast(`Đã chuyển sang giao diện ${label}`, "info");
                }
            });
        }
    });

    // Clear all data event listener
    const btnClear = document.getElementById("btn-clear-all-data");
    if (btnClear) btnClear.addEventListener("click", handleClearAllData);

    // Close dropdown on click outside
    document.addEventListener("click", (e) => {
        const dropdown = document.getElementById("settings-dropdown");
        const btnSettingsEl = document.getElementById("btn-settings");
        const navBtnSettingsEl = document.getElementById("nav-btn-settings");
        if (dropdown && dropdown.classList.contains("active")) {
            const isInside = dropdown.contains(e.target);
            const isTopBtn = btnSettingsEl && btnSettingsEl.contains(e.target);
            const isNavBtn = navBtnSettingsEl && navBtnSettingsEl.contains(e.target);
            if (!isInside && !isTopBtn && !isNavBtn) {
                closeSettingsDropdown();
            }
        }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const dayModal = document.getElementById("day-edit-modal");
            if (dayModal && !dayModal.classList.contains("hidden")) {
                closeDayEditModal();
                return;
            }
            const txModal = document.getElementById("transaction-modal");
            if (txModal && !txModal.classList.contains("hidden")) {
                closeTransactionModal();
                return;
            }
            const dropdown = document.getElementById("settings-dropdown");
            if (dropdown && dropdown.classList.contains("active")) {
                closeSettingsDropdown();
            }
        }
    });

    // Dynamic repositioning on window resize and scroll
    window.addEventListener("resize", () => {
        positionSettingsDropdown();
    });
    window.addEventListener("scroll", () => {
        if (window.innerWidth > 768) {
            positionSettingsDropdown();
        }
    }, { passive: true });

    // Mobile Bottom Navigation Handlers (Touch-Optimized)
    const navBtnOverview = document.getElementById("nav-btn-overview") || document.getElementById("nav-btn-home");
    const navBtnCalendar = document.getElementById("nav-btn-calendar") || document.getElementById("nav-btn-transactions");
    const navBtnAdd = document.getElementById("nav-btn-add");
    const navBtnChatbot = document.getElementById("nav-btn-chatbot");
    const navBtnSettings = document.getElementById("nav-btn-settings");

    if (navBtnOverview) {
        navBtnOverview.addEventListener("click", () => {
            document.querySelectorAll(".mobile-nav-item").forEach(b => b.classList.remove("active"));
            navBtnOverview.classList.add("active");
            closeSettingsDropdown();
            const target = document.querySelector(".dashboard-section");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    if (navBtnCalendar) {
        navBtnCalendar.addEventListener("click", () => {
            document.querySelectorAll(".mobile-nav-item").forEach(b => b.classList.remove("active"));
            navBtnCalendar.classList.add("active");
            closeSettingsDropdown();
            const target = document.querySelector(".calendar-section");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    const btnHeaderAdd = document.getElementById("btn-header-add");
    if (btnHeaderAdd) {
        btnHeaderAdd.addEventListener("click", () => openTransactionModalForDate(selectedCalendarDay.getTime()));
    }

    if (navBtnAdd) {
        navBtnAdd.addEventListener("click", () => {
            openTransactionModal();
        });
    }

    if (navBtnChatbot) {
        navBtnChatbot.addEventListener("click", () => {
            if (typeof window.toggleChatbot === "function") {
                window.toggleChatbot();
            } else {
                const chatBtn = document.getElementById("chatbot-trigger-btn");
                if (chatBtn) chatBtn.click();
            }
        });
    }

    if (navBtnSettings) {
        navBtnSettings.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSettingsDropdown();
        });
    }

    // Amount input formatting (vietnamese thousands separator with caret preservation)
    const amountInput = document.getElementById("amount");
    if (amountInput) {
        amountInput.addEventListener("input", function(e) {
            const cursorPosition = this.selectionStart;
            const originalLength = this.value.length;
            
            let val = this.value.replace(/,/g, '');
            val = val.replace(/[^\d]/g, '');
            if (val) {
                const formatted = formatNumberWithCommas(val);
                this.value = formatted;
                
                const newLength = formatted.length;
                let newCursorPosition = cursorPosition + (newLength - originalLength);
                newCursorPosition = Math.max(0, Math.min(newCursorPosition, newLength));
                this.setSelectionRange(newCursorPosition, newCursorPosition);
            } else {
                this.value = '';
            }
        });
    }

    function showMonthSkeletonLoading() {
        if (window.SkeletonRenderer) {
            const gridCells = document.getElementById("calendar-grid-cells");
            const dailyList = document.getElementById("daily-transactions-list");
            const dailyEmptyState = document.getElementById("daily-transactions-empty");
            if (dailyEmptyState) dailyEmptyState.style.display = "none";
            if (gridCells) gridCells.innerHTML = window.SkeletonRenderer.renderCalendarGridSkeleton(35);
            if (dailyList) {
                dailyList.style.display = "flex";
                dailyList.innerHTML = window.SkeletonRenderer.renderFeedListSkeleton(4);
            }
        }
        // Daily Summary Bar skeleton (Photo 1)
        const dailyIncomeVal = document.getElementById("daily-income-val");
        const dailyExpenseVal = document.getElementById("daily-expense-val");
        const dailyNetVal = document.getElementById("daily-net-val");
        if (dailyIncomeVal) dailyIncomeVal.innerHTML = '<span class="skeleton-bone skeleton-summary-val"></span>';
        if (dailyExpenseVal) dailyExpenseVal.innerHTML = '<span class="skeleton-bone skeleton-summary-val"></span>';
        if (dailyNetVal) dailyNetVal.innerHTML = '<span class="skeleton-bone skeleton-summary-val"></span>';

        // Charts Skeletons (Photo 2)
        const trendSkeleton = document.getElementById("trend-chart-skeleton");
        const trendCanvas = document.getElementById("trendChart");
        const trendNoData = document.getElementById("trend-no-data");
        if (trendSkeleton) trendSkeleton.style.display = "flex";
        if (trendCanvas) trendCanvas.style.display = "none";
        if (trendNoData) trendNoData.style.display = "none";
    }

    // Calendar navigation
    const btnPrevMonth = document.getElementById("btn-prev-month");
    if (btnPrevMonth) {
        btnPrevMonth.addEventListener("click", () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            showMonthSkeletonLoading();
            setTimeout(() => {
                updateUI();
            }, 80);
        });
    }
    const btnNextMonth = document.getElementById("btn-next-month");
    if (btnNextMonth) {
        btnNextMonth.addEventListener("click", () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            showMonthSkeletonLoading();
            setTimeout(() => {
                updateUI();
            }, 80);
        });
    }
    // Lùi/tiến một ngày; sang tháng khác thì vẽ lại lịch tháng đó
    [["btn-prev-day", -1], ["btn-next-day", 1]].forEach(([id, delta]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener("click", () => {
            turnTearoffPage(delta);
            const d = new Date(selectedCalendarDay);
            d.setDate(d.getDate() + delta);
            const monthChanged = d.getMonth() !== currentCalendarDate.getMonth() || d.getFullYear() !== currentCalendarDate.getFullYear();
            selectCalendarDay(d.getTime());
            if (monthChanged) {
                currentCalendarDate = new Date(d.getFullYear(), d.getMonth(), 1);
                updateUI();
            }
        });
    });

    // Cửa sổ nổi: nút mở (aria-controls); nền mờ và nút ✕ để đóng
    ["month-popover", "balance-popover"].forEach(popId => {
        const btn = document.querySelector(`[aria-controls="${popId}"]`);
        if (btn) btn.addEventListener("click", () => togglePopover(popId));
        [popId.replace("-popover", "-backdrop"), "btn-close-" + popId].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("click", () => togglePopover(popId, false));
        });
    });


    setTodayInDateInput();
    renderTearoffPage(selectedCalendarDay);
}

// Logout Action
function handleLogout() {
    if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?")) {
        fetch(`${API_URL}?action=logout`, { method: "POST" })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, "success");
                    setTimeout(() => {
                        window.location.href = "index.html";
                    }, 500);
                }
            })
            .catch(err => {
                console.error("Logout error:", err);
                window.location.href = "index.html";
            });
    }
}

// --- 3. CRUD LOGIC HANDLERS (AJAX OPERATIONS) ---

// Mở/đóng cửa sổ nổi (lịch tháng, số dư) ở giữa màn hình, cùng hiệu ứng với menu Cài đặt
function togglePopover(popId, open) {
    const pop = document.getElementById(popId);
    const backdrop = document.getElementById(popId.replace("-popover", "-backdrop"));
    const btn = document.querySelector(`[aria-controls="${popId}"]`);
    if (!pop || pop.classList.contains("closing")) return;
    const isOpen = pop.classList.contains("active");
    const shouldOpen = open === undefined ? !isOpen : open;
    if (shouldOpen === isOpen) return;
    if (btn) btn.setAttribute("aria-expanded", String(shouldOpen));
    if (navigator.vibrate) {
        try { navigator.vibrate(shouldOpen ? 8 : 6); } catch (e) {}
    }
    if (shouldOpen) {
        pop.classList.add("active", "is-opening");
        setTimeout(() => pop.classList.remove("is-opening"), 700); // hết nhịp hiện lần lượt; vẽ lại lưới sau đó không chạy lại
        if (backdrop) backdrop.classList.add("active");
        document.body.classList.add("popover-open");
        return;
    }
    pop.classList.add("closing");
    if (backdrop) backdrop.classList.add("closing");
    setTimeout(() => {
        pop.classList.remove("active", "closing");
        if (backdrop) backdrop.classList.remove("active", "closing");
        if (!document.querySelector(".center-popover.active")) document.body.classList.remove("popover-open");
    }, 220); // bằng thời lượng hiệu ứng đóng của menu Cài đặt
}

// Toggle budget settings collapsible panel
function toggleBudgetSettings() {
    const panel = document.getElementById("budget-settings-panel");
    const triggerBtn = document.getElementById("btn-toggle-budget-settings");
    
    const isCollapsed = panel.classList.contains("collapsed");
    if (isCollapsed) {
        renderBudgetSettingsInputs();
        panel.classList.remove("collapsed");
        triggerBtn.innerHTML = '<i data-lucide="chevron-up"></i> Đóng';
    } else {
        panel.classList.add("collapsed");
        triggerBtn.innerHTML = '<i data-lucide="settings"></i> Thiết lập';
    }
    renderScopedIcons(triggerBtn);
}

// Render inputs inside budget settings form
function renderBudgetSettingsInputs() {
    const container = document.getElementById("budget-inputs-container");
    container.innerHTML = "";
    
    Object.keys(CATEGORIES).forEach(key => {
        const cat = CATEGORIES[key];
        if (cat.type === "expense") {
            const currentLimit = state.budgets[key] || 0;
            
            const row = document.createElement("div");
            row.className = "budget-input-row";
            row.innerHTML = `
                <label for="budget-input-${key}">
                    <i data-lucide="${cat.icon}"></i>
                    <span>${cat.label} (đ)</span>
                </label>
                <input type="number" id="budget-input-${key}" name="${key}" min="0" step="10000" value="${currentLimit}">
            `;
            container.appendChild(row);
        }
    });
}

// Handle Add/Edit Form submission
function handleFormSubmit(e) {
    e.preventDefault();
    
    const transactionId = document.getElementById("transaction-id").value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const amount = parseFloat(document.getElementById("amount").value.replace(/,/g, ''));
    let category = document.getElementById("category").value;
    const customCategoryInput = document.getElementById("custom-category").value.trim();
    const date = document.getElementById("date").value;
    const description = document.getElementById("description").value.trim();

    if (category === "other_expense" || category === "gift") {
        if (customCategoryInput) {
            category = customCategoryInput;
        } else {
            showToast("Vui lòng nhập tên danh mục tùy chỉnh", "error");
            return;
        }
    }

    if (isNaN(amount) || amount <= 0) {
        showToast("Vui lòng nhập số tiền hợp lệ lớn hơn 0đ", "error");
        return;
    }
    if (!category) {
        showToast("Vui lòng chọn danh mục", "error");
        return;
    }
    if (!date) {
        showToast("Vui lòng chọn ngày giao dịch", "error");
        return;
    }

    const payload = {
        id: transactionId || Date.now().toString(),
        type,
        amount,
        category,
        date,
        description: description || (CATEGORIES[category] ? CATEGORIES[category].label : category)
    };

    const btnSubmit = document.getElementById("btn-submit");
    const oldBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="spinner-inline"></span> <span>${transactionId ? 'Đang cập nhật...' : 'Đang lưu...'}</span>`;
    }
    const restoreSubmitBtn = () => {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = oldBtnHtml;
            renderScopedIcons(btnSubmit);
        }
    };

    fetch(`${API_URL}?action=save_transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.message || "Lưu giao dịch thất bại"); });
        }
        return res.json();
    })
    .then(data => {
        if (data.success) {
            showToast(transactionId ? "Đã cập nhật giao dịch!" : "Đã thêm giao dịch mới!", "success");
            resetTransactionForm();
            closeTransactionModal();
            fetchStateFromServer();
        }
    })
    .catch(err => {
        showToast(err.message, "error");
        console.error(err);
        restoreSubmitBtn();
    })
    .finally(() => {
        const modal = document.getElementById("transaction-modal");
        if (modal && !modal.classList.contains("hidden")) {
            restoreSubmitBtn();
        }
    });
}

// Cancel editing a transaction
function cancelEditMode() {
    closeTransactionModal();
}

// Reset transaction form back to default
function resetTransactionForm() {
    document.getElementById("transaction-id").value = "";
    document.getElementById("amount").value = "";
    document.getElementById("category").value = "";
    document.getElementById("description").value = "";
    document.getElementById("custom-category").value = "";
    document.getElementById("custom-category").classList.add("hidden");
    document.getElementById("custom-category").removeAttribute("required");
    setTodayInDateInput();
    
    document.getElementById("type-expense").checked = true;
    populateCategorySelectors();

    document.getElementById("btn-submit").disabled = false;
    document.getElementById("btn-submit").innerHTML = '<i data-lucide="save"></i> <span>Thêm giao dịch</span>';
    document.getElementById("btn-cancel-edit").style.display = "none";
    document.getElementById("btn-delete-edit").style.display = "none";
    document.getElementById("btn-delete-edit").disabled = false;
    document.getElementById("form-title").textContent = "Giao dịch mới";
    
    const formCard = document.querySelector(".form-card");
    if (formCard) formCard.classList.remove("is-editing");
    
    renderScopedIcons(document.getElementById("btn-submit"));
}

// Edit transaction trigger (loads data into form)
function editTransaction(id) {
    const transaction = state.transactions.find(t => t.id === id);
    if (!transaction) return;

    // Tactile confirmation for entering edit mode
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([10, 30, 10]); } catch (e) {}
    }

    openTransactionModal();

    // On mobile, scroll smoothly without layout disruption
    const formCard = document.querySelector(".form-card");
    if (formCard) {
        formCard.classList.add("is-editing");
        formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    document.getElementById("transaction-id").value = transaction.id;
    if (transaction.type === "income") {
        document.getElementById("type-income").checked = true;
    } else {
        document.getElementById("type-expense").checked = true;
    }
    populateCategorySelectors();

    document.getElementById("amount").value = formatNumberWithCommas(transaction.amount);
    document.getElementById("category").value = transaction.category;
    document.getElementById("date").value = transaction.date;
    document.getElementById("description").value = transaction.description;

    document.getElementById("form-title").textContent = "Sửa giao dịch";
    document.getElementById("btn-submit").disabled = false;
    document.getElementById("btn-submit").innerHTML = '<i data-lucide="check-circle"></i> <span>Cập nhật</span>';
    document.getElementById("btn-cancel-edit").style.display = "inline-flex";
    document.getElementById("btn-delete-edit").style.display = "inline-flex";
    document.getElementById("btn-delete-edit").disabled = false;
    document.getElementById("btn-delete-edit").innerHTML = 'Xóa';
    document.getElementById("btn-delete-edit").onclick = () => deleteTransaction(transaction.id);
    renderScopedIcons(document.getElementById("btn-submit"));
}

// Delete transaction trigger
function deleteTransaction(id) {
    if (confirm("Bạn có chắc chắn muốn xóa giao dịch này không?")) {
        const btnDelete = document.getElementById("btn-delete-edit");
        const oldDeleteHtml = btnDelete ? btnDelete.innerHTML : '';
        if (btnDelete) {
            btnDelete.disabled = true;
            btnDelete.innerHTML = `<span class="spinner-inline"></span> <span>Đang xóa...</span>`;
        }
        const restoreDeleteBtn = () => {
            if (btnDelete) {
                btnDelete.disabled = false;
                btnDelete.innerHTML = oldDeleteHtml;
            }
        };

        fetch(`${API_URL}?action=delete_transaction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.message || "Xóa thất bại"); });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                showToast("Đã xóa giao dịch thành công", "success");
                resetTransactionForm();
                closeTransactionModal();
                fetchStateFromServer();
                if (currentDayEditTime) {
                    renderDayEditModalContent(currentDayEditTime);
                }
            }
        })
        .catch(err => {
            showToast(err.message, "error");
            console.error(err);
            restoreDeleteBtn();
        })
        .finally(() => {
            const modal = document.getElementById("transaction-modal");
            if (modal && !modal.classList.contains("hidden")) {
                restoreDeleteBtn();
            }
        });
    }
}

// Save budget updates
function handleBudgetSubmit(e) {
    e.preventDefault();
    
    const updatedBudgets = {};
    const inputs = document.querySelectorAll("#budget-inputs-container input");
    inputs.forEach(input => {
        updatedBudgets[input.name] = parseFloat(input.value) || 0;
    });

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const oldSubmitHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-inline"></span> <span>Đang lưu hạn mức...</span>`;
    }
    const restoreBudgetBtn = () => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = oldSubmitHtml;
            renderScopedIcons(submitBtn);
        }
    };

    fetch(`${API_URL}?action=save_budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedBudgets)
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.message || "Lưu hạn mức thất bại"); });
        }
        return res.json();
    })
    .then(data => {
        if (data.success) {
            showToast("Đã lưu hạn mức ngân sách mới", "success");
            toggleBudgetSettings();
            fetchStateFromServer();
        }
    })
    .catch(err => {
        showToast(err.message, "error");
        console.error(err);
    })
    .finally(() => {
        restoreBudgetBtn();
    });
}

// --- 4. RENDER & CALCULATE UI ---

function updateUI(redrawCharts = true) {
    state.isLoading = false;
    const stats = calculateFinanceStats();
    
    const balanceEl = document.getElementById("total-balance");
    const incomeEl = document.getElementById("summary-income");
    const expenseEl = document.getElementById("summary-expense");

    if (balanceEl) animateValueRoll(balanceEl, stats.balance);
    if (incomeEl) animateValueRoll(incomeEl, stats.income);
    if (expenseEl) animateValueRoll(expenseEl, stats.expense);

    if (balanceEl) {
        balanceEl.style.backgroundImage = "none";
        balanceEl.style.color = stats.balance < 0 ? "var(--expense-color)" : "var(--text-primary)";
    }

    renderCalendarView(stats.filteredTransactions);
    renderBudgetsProgress(stats.categoryExpenses);

    if (currentDayEditTime) {
        renderDayEditModalContent(currentDayEditTime);
    }

    if (redrawCharts) {
        renderCharts();
    }
}

function calculateFinanceStats() {
    let allTimeIncome = 0;
    let allTimeExpense = 0;
    let income = 0;
    let expense = 0;
    const categoryExpenses = {};

    Object.keys(CATEGORIES).forEach(key => {
        if (CATEGORIES[key].type === "expense") {
            categoryExpenses[key] = 0;
        }
    });

    const activeYear = currentCalendarDate.getFullYear();
    const activeMonth = currentCalendarDate.getMonth();

    state.transactions.forEach(t => {
        const amt = t.amount;
        
        // 1. Calculate all-time totals for net balance
        if (t.type === "income") {
            allTimeIncome += amt;
        } else {
            allTimeExpense += amt;
        }

        // 2. Parse transaction date to check if it matches the currently viewed calendar month
        const tDate = new Date(t.date);
        const isValidDate = !isNaN(tDate.getTime());
        const isCurrentMonth = isValidDate && (tDate.getFullYear() === activeYear && tDate.getMonth() === activeMonth);

        if (isCurrentMonth) {
            if (t.type === "income") {
                income += amt;
            } else {
                expense += amt;
                if (categoryExpenses[t.category] !== undefined) {
                    categoryExpenses[t.category] += amt;
                } else {
                    // For custom categories (defined by users)
                    if (!categoryExpenses[t.category]) {
                        categoryExpenses[t.category] = 0;
                    }
                    categoryExpenses[t.category] += amt;
                }
            }
        }
    });

    const filterType = document.getElementById("filter-type").value;
    const filterCategory = document.getElementById("filter-category").value;
    const searchQuery = document.getElementById("search-input").value.toLowerCase().trim();

    const filtered = state.transactions.filter(t => {
        const matchesType = filterType === "all" || t.type === filterType;
        const matchesCategory = filterCategory === "all" || t.category === filterCategory;
        const matchesSearch = searchQuery === "" || 
            t.description.toLowerCase().includes(searchQuery) ||
            (CATEGORIES[t.category] && CATEGORIES[t.category].label.toLowerCase().includes(searchQuery));
            
        return matchesType && matchesCategory && matchesSearch;
    });

    return {
        income,
        expense,
        balance: income - expense,
        filteredTransactions: filtered,
        categoryExpenses
    };
}

// Apple Kinetic Rolling Number Animation (fluid 60/120fps easeOutQuart)
function animateValueRoll(el, targetVal, duration = 650) {
    if (!el) return;
    const target = Math.round(Number(targetVal) || 0);
    
    // Fallback if reduced motion is preferred
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = formatVND(target);
        el._currentVal = target;
        return;
    }
    
    const hasCurrent = typeof el._currentVal === 'number' && !isNaN(el._currentVal);
    const rawText = String(el.textContent || '').replace(/[^0-9.-]/g, '');
    const startVal = hasCurrent ? el._currentVal : (parseFloat(rawText) || 0);
    
    if (startVal === target && hasCurrent) {
        el.textContent = formatVND(target);
        return;
    }
    
    if (el._animationFrame) {
        cancelAnimationFrame(el._animationFrame);
        el._animationFrame = null;
    }
    
    const startTime = performance.now();
    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Apple quartic ease-out deceleration curve
        const ease = 1 - Math.pow(1 - progress, 4);
        const current = startVal + (target - startVal) * ease;
        el.textContent = formatVND(Math.round(current));
        
        if (progress < 1) {
            el._animationFrame = requestAnimationFrame(step);
        } else {
            el._currentVal = target;
            el.textContent = formatVND(target);
            el._animationFrame = null;
        }
    }
    el._animationFrame = requestAnimationFrame(step);
}

function formatVND(val) {
    return formatNumberWithCommas(val) + 'đ';
}

function formatNumberWithCommas(n) {
    const parts = n.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

// Nhãn trục tiền của biểu đồ: 1.5Mđ, 250kđ (giữ dấu âm)
function formatAxisMoney(value) {
    return Math.abs(value) >= 1000000 ? (value / 1000000) + 'Mđ' : (value / 1000) + 'kđ';
}

function formatCompactAmount(value) {
    if (value >= 1000000) {
        const formatted = (value / 1000000);
        return (Number.isInteger(formatted) ? formatted : formatted.toFixed(1)) + 'M';
    } else if (value >= 1000) {
        return (value / 1000) + 'k';
    }
    return value;
}

// Trang lịch xé: ngày dương, thứ, ngày âm, can chi, giờ hoàng đạo.
// ponytail: âm lịch lấy từ lịch Trung Hoa có sẵn trong trình duyệt (Intl, giờ UTC+8) nên vài tháng hiếm có thể lệch
// 1 ngày so với âm lịch Việt Nam (UTC+7); cần chính xác tuyệt đối thì thay bằng thuật toán Hồ Ngọc Đức.
const LUNAR_FORMAT = new Intl.DateTimeFormat("vi-VN-u-ca-chinese", { day: "numeric", month: "numeric", year: "numeric" });
const LUNAR_CAN = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
const LUNAR_CHI = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"];
// Theo chi của ngày (Tý/Ngọ, Sửu/Mùi... dùng chung dòng); ký tự thứ i = '1' nếu giờ LUNAR_CHI[i] là giờ hoàng đạo
const GIO_HOANG_DAO = ["110100101100", "001101001011", "110011010010", "101100110100", "001011001101", "010010110011"];
const WEEKDAYS_VI = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

function getLunarInfo(date) {
    const p = {};
    LUNAR_FORMAT.formatToParts(date).forEach(part => { p[part.type] = part.value; });
    const month = parseInt(p.month, 10);
    const year = parseInt(p.relatedYear, 10);
    const jd = Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) + 2440588;
    const dayChi = (jd + 1) % 12;
    const hours = [];
    for (let i = 0; i < 12; i++) {
        if (GIO_HOANG_DAO[dayChi % 6][i] === "1") hours.push(`${LUNAR_CHI[i]}\u00a0(${(i * 2 + 23) % 24}\u2011${(i * 2 + 1) % 24})`); // không ngắt dòng giữa một khung giờ
    }
    return {
        day: parseInt(p.day, 10),
        month,
        leap: /\D/.test(p.month),
        dayName: `${LUNAR_CAN[(jd + 9) % 10]} ${LUNAR_CHI[dayChi]}`,
        monthName: `${LUNAR_CAN[(year * 12 + month + 3) % 10]} ${LUNAR_CHI[(month + 1) % 12]}`,
        yearName: `${LUNAR_CAN[(year + 6) % 10]} ${LUNAR_CHI[(year + 8) % 12]}`,
        hours
    };
}

function renderTearoffPage(date) {
    const page = document.getElementById("tearoff-page");
    if (!page) return;
    const lunar = getLunarInfo(date);
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const lunarMonth = lunar.month === 1 ? "Giêng" : lunar.month === 12 ? "Chạp" : lunar.month;
    set("tearoff-month", `Tháng ${date.getMonth() + 1} · ${date.getFullYear()}`);
    set("tearoff-month-en", date.toLocaleString("en-US", { month: "long" }));
    set("tearoff-day", date.getDate());
    set("tearoff-weekday", WEEKDAYS_VI[date.getDay()]);
    set("tearoff-weekday-en", date.toLocaleString("en-US", { weekday: "long" }));
    set("tearoff-lunar-day", lunar.day);
    set("tearoff-lunar-month", `Tháng ${lunarMonth}${lunar.leap ? " nhuận" : ""}`);
    set("tearoff-canchi-day", `Ngày ${lunar.dayName}`);
    set("tearoff-canchi-month", `Tháng ${lunar.monthName}`);
    set("tearoff-canchi-year", `Năm ${lunar.yearName}`);
    set("tearoff-hours", lunar.hours.join(", "));
    page.classList.toggle("is-sunday", date.getDay() === 0);
    page.classList.toggle("is-today", date.toDateString() === new Date().toDateString());
}

// Hiệu ứng xé lịch: sang ngày sau thì tờ cũ bay lên, về ngày trước thì tờ mới rơi xuống
function turnTearoffPage(delta) {
    const page = document.getElementById("tearoff-page");
    if (!page || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (delta > 0) {
        const ghost = page.cloneNode(true);
        ghost.querySelectorAll(".tearoff-ghost").forEach(el => el.remove());
        ghost.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
        ghost.removeAttribute("id");
        ghost.classList.remove("drop-in");
        ghost.classList.add("tearoff-ghost");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        ghost.addEventListener("animationend", () => ghost.remove());
        page.appendChild(ghost);
    } else {
        page.classList.remove("drop-in");
        void page.offsetWidth; // restart animation
        page.classList.add("drop-in");
    }
}

function formatSelectedDateLabel(date) {
    const days = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const dayOfWeek = days[date.getDay()];
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year} (${dayOfWeek})`;
}

function selectCalendarDay(time) {
    selectedCalendarDay = new Date(time);
    
    // Set date input in the form
    const day = String(selectedCalendarDay.getDate()).padStart(2, '0');
    const month = String(selectedCalendarDay.getMonth() + 1).padStart(2, '0');
    const year = selectedCalendarDay.getFullYear();
    document.getElementById("date").value = `${year}-${month}-${day}`;
    
    // Update visual selected class without rebuilding DOM
    const cells = document.querySelectorAll(".calendar-cell");
    cells.forEach(cell => {
        cell.classList.remove("selected");
        if (cell.dataset.time === String(time)) {
            cell.classList.add("selected");
        }
    });

    updateDailyTransactionsView();
    // Open the transaction modal for input (removed, now triggered by specific button)
}

function openTransactionModalForDate(time, event) {
    if (event) {
        event.stopPropagation();
    }
    selectCalendarDay(time);
    openTransactionModal();
}

function renderCalendarView(filteredTransactions = null) {
    if (!filteredTransactions) {
        filteredTransactions = calculateFinanceStats().filteredTransactions;
    }
    const gridCells = document.getElementById("calendar-grid-cells");
    const monthYearDisplay = document.getElementById("month-year-display");
    const dailyIncomeVal = document.getElementById("daily-income-val");
    const dailyExpenseVal = document.getElementById("daily-expense-val");
    const dailyNetVal = document.getElementById("daily-net-val");
    const dailyTransactionsList = document.getElementById("daily-transactions-list");
    const dailyEmptyState = document.getElementById("daily-transactions-empty");

    const currentMonth = currentCalendarDate.getMonth();
    const currentYear = currentCalendarDate.getFullYear();
    const formattedMonth = String(currentMonth + 1).padStart(2, '0');
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    monthYearDisplay.textContent = `Tháng ${formattedMonth}/${currentYear}`;

    gridCells.innerHTML = "";

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const adjustedFirstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    const totalDays = lastDayOfMonth;

    const totalCells = (adjustedFirstDayIndex + totalDays > 35) ? 42 : 35;

    const transactionsByDate = {};
    filteredTransactions.forEach(t => {
        const d = new Date(t.date);
        if (!isNaN(d.getTime())) {
            const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (!transactionsByDate[dateKey]) {
                transactionsByDate[dateKey] = [];
            }
            transactionsByDate[dateKey].push(t);
        }
    });

    const calendarFragment = document.createDocumentFragment();

    for (let i = 1; i <= totalCells; i++) {
        let cellDay, cellMonth, cellYear;

        if (i <= adjustedFirstDayIndex) {
            cellDay = prevMonthLastDay - adjustedFirstDayIndex + i;
            cellMonth = currentMonth - 1;
            cellYear = currentYear;
        } else if (i <= adjustedFirstDayIndex + totalDays) {
            cellDay = i - adjustedFirstDayIndex;
            cellMonth = currentMonth;
            cellYear = currentYear;
        } else {
            cellDay = i - adjustedFirstDayIndex - totalDays;
            cellMonth = currentMonth + 1;
            cellYear = currentYear;
        }

        const cellDate = new Date(cellYear, cellMonth, cellDay);
        const dateKey = `${cellDate.getFullYear()}-${cellDate.getMonth()}-${cellDate.getDate()}`;
        const dayTransactions = transactionsByDate[dateKey] || [];

        let cellIncome = 0;
        let cellExpense = 0;
        dayTransactions.forEach(t => {
            if (t.type === 'income') cellIncome += t.amount;
            else cellExpense += t.amount;
        });

        const isSelected = cellDate.getDate() === selectedCalendarDay.getDate() &&
                           cellDate.getMonth() === selectedCalendarDay.getMonth() &&
                           cellDate.getFullYear() === selectedCalendarDay.getFullYear();

        const isCurrentMonth = cellDate.getMonth() === currentMonth && cellDate.getFullYear() === currentYear;

        const cellEl = document.createElement("div");
        cellEl.className = `calendar-cell ${isCurrentMonth ? 'current-month' : 'other-month'} ${isSelected ? 'selected' : ''}`;
        cellEl.dataset.time = cellDate.getTime();
        cellEl.style.setProperty("--r", Math.floor((i - 1) / 7)); // hàng tuần, cho hiệu ứng hiện lần lượt

        let amountHTML = "";
        if (cellIncome > 0 || cellExpense > 0) {
            amountHTML = `
                <div class="day-amounts-wrapper">
                    ${cellIncome > 0 ? `<span class="day-amount income">${formatCompactAmount(cellIncome)}</span>` : ''}
                    ${cellExpense > 0 ? `<span class="day-amount expense">${formatCompactAmount(cellExpense)}</span>` : ''}
                </div>
            `;
        }

        cellEl.innerHTML = `
            <span class="day-num">${cellDate.getDate()}</span>
            ${amountHTML}
        `;
        calendarFragment.appendChild(cellEl);
    }
    
    // Batch DOM insertion in a single operation
    gridCells.appendChild(calendarFragment);

    updateDailyTransactionsView({ filteredTransactions });
}

// Mobile Swipe-To-Delete Gesture Controller (Apple iOS List Item Style)
function initDailySwipeToDelete(container) {
    let activeWrapper = null;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;
    let isHorizontal = null;
    const maxSwipe = 80;

    function closeAllSwiped(exceptWrapper = null) {
        container.querySelectorAll(".daily-item-swipe-wrapper.is-swiped").forEach(w => {
            if (w !== exceptWrapper) {
                w.classList.remove("is-swiped");
                const item = w.querySelector(".daily-item");
                if (item) {
                    item.style.transition = "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)";
                    item.style.transform = "translate3d(0, 0, 0)";
                }
            }
        });
    }

    container.addEventListener("touchstart", (e) => {
        const wrapper = e.target.closest(".daily-item-swipe-wrapper");
        if (!wrapper) {
            closeAllSwiped();
            return;
        }

        closeAllSwiped(wrapper);

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        currentX = startX;
        activeWrapper = wrapper;
        isSwiping = false;
        isHorizontal = null;

        const item = wrapper.querySelector(".daily-item");
        if (item) {
            item.style.transition = "none";
        }
    }, { passive: true });

    container.addEventListener("touchmove", (e) => {
        if (!activeWrapper) return;
        const touch = e.touches[0];
        currentX = touch.clientX;
        const diffX = currentX - startX;
        const diffY = touch.clientY - startY;

        if (isHorizontal === null) {
            if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
                isHorizontal = Math.abs(diffX) > Math.abs(diffY);
            }
        }

        if (!isHorizontal) return;

        isSwiping = true;
        activeWrapper.classList.add("is-swiping");
        const item = activeWrapper.querySelector(".daily-item");
        if (!item) return;

        const isCurrentlySwiped = activeWrapper.classList.contains("is-swiped");
        let offset;
        if (isCurrentlySwiped) {
            offset = -maxSwipe + diffX;
            if (offset > 0) offset = 0;
            if (offset < -maxSwipe) offset = -maxSwipe + (offset + maxSwipe) * 0.25;
        } else {
            offset = diffX;
            if (offset > 0) offset = 0;
            if (offset < -maxSwipe) offset = -maxSwipe + (offset + maxSwipe) * 0.25;
        }

        item.style.transform = `translate3d(${offset}px, 0, 0)`;
    }, { passive: true });

    container.addEventListener("touchend", () => {
        if (!activeWrapper) return;
        activeWrapper.classList.remove("is-swiping");
        const item = activeWrapper.querySelector(".daily-item");
        const diffX = currentX - startX;
        const isCurrentlySwiped = activeWrapper.classList.contains("is-swiped");

        if (item) {
            item.style.transition = "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)";
        }

        if (isSwiping) {
            if (isCurrentlySwiped) {
                if (diffX > 25) {
                    activeWrapper.classList.remove("is-swiped");
                    if (item) item.style.transform = "translate3d(0, 0, 0)";
                } else {
                    activeWrapper.classList.add("is-swiped");
                    if (item) item.style.transform = `translate3d(-${maxSwipe}px, 0, 0)`;
                }
            } else {
                if (diffX < -30) {
                    activeWrapper.classList.add("is-swiped");
                    if (item) item.style.transform = `translate3d(-${maxSwipe}px, 0, 0)`;
                } else {
                    activeWrapper.classList.remove("is-swiped");
                    if (item) item.style.transform = "translate3d(0, 0, 0)";
                }
            }
        }

        activeWrapper = null;
        isSwiping = false;
        isHorizontal = null;
    }, { passive: true });

    document.addEventListener("click", (e) => {
        if (!e.target.closest("#daily-transactions-list")) {
            closeAllSwiped();
        }
    });
}

function updateDailyTransactionsView(cachedStats = null) {
    const stats = cachedStats || calculateFinanceStats();
    const filteredTransactions = stats.filteredTransactions;
    
    const selectedDayTransactions = filteredTransactions.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === selectedCalendarDay.getFullYear() && 
               d.getMonth() === selectedCalendarDay.getMonth() && 
               d.getDate() === selectedCalendarDay.getDate();
    });

    const dailyIncomeVal = document.getElementById("daily-income-val");
    const dailyExpenseVal = document.getElementById("daily-expense-val");
    const dailyNetVal = document.getElementById("daily-net-val");
    const dailyTransactionsList = document.getElementById("daily-transactions-list");
    const dailyEmptyState = document.getElementById("daily-transactions-empty");

    let dailyIncome = 0;
    let dailyExpense = 0;
    selectedDayTransactions.forEach(t => {
        if (t.type === 'income') dailyIncome += t.amount;
        else dailyExpense += t.amount;
    });
    const dailyNet = dailyIncome - dailyExpense;

    dailyIncomeVal.textContent = formatVND(dailyIncome);
    dailyExpenseVal.textContent = formatVND(dailyExpense);
    dailyNetVal.textContent = (dailyNet < 0 ? '-' : '') + formatNumberWithCommas(Math.abs(dailyNet)) + 'đ';
    dailyNetVal.className = dailyNet >= 0 ? 'val-net-income' : 'val-net-expense';

    renderTearoffPage(selectedCalendarDay);

    dailyTransactionsList.innerHTML = "";
    dailyTransactionsList.scrollTop = 0;

    if (selectedDayTransactions.length === 0) {
        dailyEmptyState.style.display = "flex";
        dailyTransactionsList.style.display = "none";
    } else {
        dailyEmptyState.style.display = "none";
        dailyTransactionsList.style.display = "flex";

        const trashIconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
        const swipeDeleteIconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

        const dailyFragment = document.createDocumentFragment();
        selectedDayTransactions.forEach(t => {
            const cat = CATEGORIES[t.category] || { label: t.category, icon: "help-circle", colorClass: "badge-color-mint" };
            const wrapper = document.createElement("div");
            wrapper.className = "daily-item-swipe-wrapper";
            wrapper.dataset.id = t.id;

            wrapper.innerHTML = `
                <div class="daily-item-swipe-action">
                    <button type="button" class="btn-swipe-delete" data-id="${t.id}" aria-label="Xóa giao dịch" title="Xóa giao dịch">
                        ${swipeDeleteIconSvg}
                        <span>Xóa</span>
                    </button>
                </div>
                <div class="daily-item" data-id="${t.id}">
                    <div class="daily-item-left">
                        <div class="daily-icon-wrapper ${cat.colorClass}">
                            <i data-lucide="${cat.icon}"></i>
                        </div>
                        <div class="daily-item-info">
                            <span class="daily-item-title">${cat.label}</span>
                            ${t.description ? `<span class="daily-item-desc">${escapeHTML(t.description)}</span>` : ''}
                        </div>
                    </div>
                    <div class="daily-item-right">
                        <span class="daily-item-amount">${formatNumberWithCommas(t.amount)}đ</span>
                        <div class="daily-actions">
                            <button type="button" class="btn-daily-delete" data-id="${t.id}" title="Xóa giao dịch" aria-label="Xóa giao dịch">
                                ${trashIconSvg}
                            </button>
                        </div>
                    </div>
                </div>
            `;
            dailyFragment.appendChild(wrapper);
        });

        dailyTransactionsList.appendChild(dailyFragment);
        renderScopedIcons(dailyTransactionsList);
    }
}

function renderBudgetsProgress(categoryExpenses) {
    const container = document.getElementById("budget-progress-container");
    container.innerHTML = "";

    let hasBudgets = false;
    let totalBudgetLimit = 0;
    let totalBudgetSpent = 0;

    const budgetItemsHtml = [];

    Object.keys(state.budgets).forEach(categoryKey => {
        const limit = state.budgets[categoryKey];
        if (limit > 0) {
            hasBudgets = true;
            const spent = categoryExpenses[categoryKey] || 0;
            totalBudgetLimit += limit;
            totalBudgetSpent += spent;
            const percentage = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
            
            const cat = CATEGORIES[categoryKey] || { label: categoryKey, icon: "tag" };

            // 4 Mức độ màu ngân sách: Xanh (<70%), Vàng (70-85%), Cam (85-100%), Đỏ (>=100%)
            let progressClass = "progress-level-green";
            if (percentage >= 100) progressClass = "progress-level-red";
            else if (percentage >= 85) progressClass = "progress-level-orange";
            else if (percentage >= 70) progressClass = "progress-level-yellow";

            budgetItemsHtml.push(`
                <div class="budget-item">
                    <div class="budget-meta">
                        <span class="budget-name">
                            <i data-lucide="${cat.icon}" style="width: 14px; height: 14px; color: var(--text-secondary)"></i>
                            ${cat.label}
                        </span>
                        <div class="budget-meta-right">
                            <span class="budget-values">
                                <strong>${formatVND(spent)}</strong> / ${formatVND(limit)}
                            </span>
                        </div>
                    </div>
                    <div class="progress-bar-bg" data-pct="${Math.round(percentage)}%" style="--pct: ${percentage}%" role="progressbar" aria-valuenow="${Math.round(percentage)}" aria-valuemin="0" aria-valuemax="100">
                        <div class="progress-bar-fill ${progressClass}" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `);
        }
    });

    if (hasBudgets) {
        // Thẻ tổng quan ngân sách chi tiêu tháng
        const totalPct = totalBudgetLimit > 0 ? Math.min((totalBudgetSpent / totalBudgetLimit) * 100, 100) : 0;
        let totalProgClass = "progress-level-green";
        let totalColor = "#0ea5e9";
        if (totalPct >= 100) {
            totalProgClass = "progress-level-red";
            totalColor = "#ef4444";
        } else if (totalPct >= 85) {
            totalProgClass = "progress-level-orange";
            totalColor = "#f97316";
        } else if (totalPct >= 70) {
            totalProgClass = "progress-level-yellow";
            totalColor = "#eab308";
        }

        const totalCardHtml = `
            <div class="budget-total-card">
                <div class="budget-total-header">
                    <div class="budget-total-title">
                        <i data-lucide="pie-chart" style="width: 15px; height: 15px; color: ${totalColor};"></i>
                        <span>Tổng ngân sách tháng</span>
                    </div>
                </div>
                <div class="budget-total-values">
                    <strong>${formatVND(totalBudgetSpent)}</strong>
                    <span class="budget-total-limit"> / ${formatVND(totalBudgetLimit)}</span>
                </div>
                <div class="progress-bar-bg" data-pct="${Math.round(totalPct)}%" style="--pct: ${totalPct}%" role="progressbar" aria-valuenow="${Math.round(totalPct)}" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-bar-fill ${totalProgClass}" style="width: ${totalPct}%"></div>
                </div>
            </div>
        `;

        container.innerHTML = totalCardHtml + budgetItemsHtml.join("");
    } else {
        container.innerHTML = `
            <div class="text-center text-muted" style="font-size: 0.85rem; padding: 16px 0;">
                <p>Chưa thiết lập hạn mức nào.</p>
                <p style="font-size: 0.75rem; margin-top: 4px;">Click "Thiết lập hạn mức" ở trên để kiểm soát chi tiêu tốt hơn.</p>
            </div>
        `;
    }

    renderScopedIcons(container);
}

// --- 5. RENDER CHART JS VISUALIZATIONS ---
function renderCharts() {

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textThemeColor = isDark ? "#86868b" : "#6e6e73";
    const gridThemeColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)";
    const appleFontStack = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro', 'Inter', sans-serif";

    // -- TREND CHART: thu/chi theo ngày (cột) + số dư lũy kế trong tháng (đường) --
    const trendCanvas = document.getElementById("trendChart");
    const trendNoData = document.getElementById("trend-no-data");

    const datesWithEntries = {};
    const activeYear = currentCalendarDate.getFullYear();
    const activeMonth = currentCalendarDate.getMonth();

    state.transactions.slice().reverse().forEach(t => {
        const d = new Date(t.date);
        if (!isNaN(d.getTime())) {
            // Only process transactions matching active viewed month
            if (d.getFullYear() === activeYear && d.getMonth() === activeMonth) {
                const dateStr = `${d.getDate()}/${d.getMonth()+1}`;
                if (!datesWithEntries[dateStr]) {
                    datesWithEntries[dateStr] = { income: 0, expense: 0 };
                }
                if (t.type === "income") {
                    datesWithEntries[dateStr].income += t.amount;
                } else {
                    datesWithEntries[dateStr].expense += t.amount;
                }
            }
        }
    });

    const datesArray = Object.keys(datesWithEntries).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    // Số dư lũy kế từ đầu tháng đến hết mỗi ngày có giao dịch
    let runningBalance = 0;
    const balanceByDate = {};
    datesArray.forEach(d => {
        runningBalance += datesWithEntries[d].income - datesWithEntries[d].expense;
        balanceByDate[d] = runningBalance;
    });
    const displayDates = datesArray.slice(-7);
    const trendIncome = displayDates.map(d => datesWithEntries[d].income);
    const trendExpense = displayDates.map(d => datesWithEntries[d].expense);
    const trendBalance = displayDates.map(d => balanceByDate[d]);

    const trendSkeleton = document.getElementById("trend-chart-skeleton");
    if (trendSkeleton) trendSkeleton.style.display = "none";

    if (displayDates.length === 0) {
        trendCanvas.style.display = "none";
        trendNoData.style.display = "block";
        if (trendChartInstance) {
            trendChartInstance.destroy();
            trendChartInstance = null;
        }
    } else {
        trendCanvas.style.display = "block";
        trendNoData.style.display = "none";

        const isMobileScreen = window.innerWidth <= 640;

        // In-place update if instance exists and valid (0ms re-render)
        if (trendChartInstance && trendChartInstance.ctx) {
            trendChartInstance.data.labels = displayDates;
            trendChartInstance.data.datasets[0].data = trendIncome;
            trendChartInstance.data.datasets[1].data = trendExpense;
            trendChartInstance.data.datasets[2].data = trendBalance;
            trendChartInstance.data.datasets[0].maxBarThickness = isMobileScreen ? 18 : 28;
            trendChartInstance.data.datasets[1].maxBarThickness = isMobileScreen ? 18 : 28;
            trendChartInstance.options.scales.x.ticks.color = textThemeColor;
            trendChartInstance.options.scales.x.ticks.font.size = isMobileScreen ? 9.5 : 11;
            trendChartInstance.options.scales.y.ticks.color = textThemeColor;
            trendChartInstance.options.scales.y.ticks.font.size = isMobileScreen ? 9.5 : 10;
            trendChartInstance.options.scales.y1.ticks.font.size = isMobileScreen ? 9.5 : 10;
            trendChartInstance.options.scales.y.grid.color = gridThemeColor;
            trendChartInstance.options.scales.y1.ticks.color = textThemeColor;
            trendChartInstance.options.plugins.legend.labels.color = textThemeColor;
            trendChartInstance.options.plugins.legend.labels.padding = isMobileScreen ? 8 : 14;
            trendChartInstance.options.plugins.legend.labels.font.size = isMobileScreen ? 10.5 : 11;
            trendChartInstance.update('none');
        } else {
            if (trendChartInstance) trendChartInstance.destroy();
            trendChartInstance = new Chart(trendCanvas, {
                type: 'bar',
                data: {
                    labels: displayDates,
                    datasets: [
                        {
                            label: 'Thu nhập',
                            data: trendIncome,
                            backgroundColor: '#0ea5e9',
                            borderRadius: 6,
                            maxBarThickness: isMobileScreen ? 18 : 28
                        },
                        {
                            label: 'Chi tiêu',
                            data: trendExpense,
                            backgroundColor: '#ef4444',
                            borderRadius: 6,
                            maxBarThickness: isMobileScreen ? 18 : 28
                        },
                        {
                            type: 'line',
                            label: 'Số dư lũy kế',
                            data: trendBalance,
                            yAxisID: 'y1',
                            order: -1,
                            borderColor: '#8b5cf6',
                            backgroundColor: '#8b5cf6',
                            borderWidth: 2.5,
                            tension: 0.35,
                            pointRadius: 3.5,
                            pointHoverRadius: 5
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250 },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: textThemeColor, font: { family: appleFontStack, size: isMobileScreen ? 9.5 : 11 } }
                        },
                        y: {
                            grid: { color: gridThemeColor },
                            ticks: {
                                color: textThemeColor,
                                font: { family: appleFontStack, size: isMobileScreen ? 9.5 : 10 },
                                callback: formatAxisMoney
                            }
                        },
                        y1: {
                            position: 'right',
                            grid: { display: false },
                            ticks: {
                                color: textThemeColor,
                                font: { family: appleFontStack, size: isMobileScreen ? 9.5 : 10 },
                                callback: formatAxisMoney
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: textThemeColor,
                                font: { family: appleFontStack, size: isMobileScreen ? 10.5 : 11 },
                                padding: isMobileScreen ? 8 : 14,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                boxWidth: 7
                            }
                        },
                        tooltip: {
                            backgroundColor: isDark ? 'rgba(28, 28, 30, 0.94)' : 'rgba(255, 255, 255, 0.96)',
                            titleColor: isDark ? '#f5f5f7' : '#1d1d1f',
                            bodyColor: isDark ? '#a1a1a6' : '#6e6e73',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                            borderWidth: 1,
                            cornerRadius: 10,
                            padding: 10,
                            titleFont: { family: appleFontStack, weight: '600' },
                            bodyFont: { family: appleFontStack },
                            callbacks: {
                                label: function(context) {
                                    return ` ${context.dataset.label}: ${formatVND(context.raw)}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }
}


// --- 6. TOAST NOTIFICATIONS ---
function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toast-message");
    const toastIcon = document.getElementById("toast-icon");

    toast.className = "toast";
    toast.classList.add(`toast-${type}`);
    toastMessage.textContent = message;

    const icons = {
        success: "check-circle",
        error: "alert-triangle",
        info: "info"
    };
    toastIcon.setAttribute("data-lucide", icons[type] || "info");
    renderScopedIcons(toast);

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// --- 7. BACKUP IMPORT & EXPORT (JSON) ---

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    
    const d = new Date();
    const dateStamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    
    downloadAnchor.setAttribute("download", `quanlychitieu_mysql_backup_${dateStamp}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Đã tạo tệp sao lưu dữ liệu!", "success");
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const parsed = JSON.parse(event.target.result);
            
            if (parsed && Array.isArray(parsed.transactions)) {
                showToast("Đang đồng bộ hóa tệp sao lưu với MySQL...", "info");
                
                const budgetsToSave = parsed.budgets || {};
                
                fetch(`${API_URL}?action=save_budgets`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(budgetsToSave)
                })
                .then(res => res.json())
                .then(budgetRes => {
                    const promises = parsed.transactions.map(t => {
                        return fetch(`${API_URL}?action=save_transaction`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(t)
                        }).then(r => r.json());
                    });
                    
                    return Promise.all(promises);
                })
                .then(results => {
                    showToast("Đã khôi phục và đồng bộ thành công tất cả dữ liệu vào MySQL!", "success");
                    fetchStateFromServer(); // Sync state
                })
                .catch(err => {
                    showToast("Lỗi đồng bộ hóa dữ liệu vào CSDL", "error");
                    console.error(err);
                });
                
            } else {
                showToast("Tệp sao lưu không đúng cấu trúc hợp lệ", "error");
            }
        } catch (err) {
            showToast("Lỗi giải mã tệp dữ liệu JSON", "error");
            console.error(err);
        }
    };
    reader.readAsText(file);
    e.target.value = "";
}

// --- 7. SETTINGS MODAL & GOOGLE LINK LOGIC ---
// userSettingsState is initialized at top state

// Function to dynamically position settings dropdown on desktop
function positionSettingsDropdown() {
    const dropdown = document.getElementById("settings-dropdown");
    const btnSettings = document.getElementById("btn-settings");
    if (!dropdown) return;
    
    if (window.innerWidth > 768) {
        if (btnSettings) {
            const rect = btnSettings.getBoundingClientRect();
            dropdown.style.position = "fixed";
            dropdown.style.top = Math.round(rect.bottom + 8) + "px";
            dropdown.style.right = Math.max(16, Math.round(window.innerWidth - rect.right)) + "px";
            dropdown.style.left = "auto";
            dropdown.style.bottom = "auto";
        }
    } else {
        dropdown.style.position = "";
        dropdown.style.top = "";
        dropdown.style.left = "";
        dropdown.style.right = "";
        dropdown.style.bottom = "";
    }
}

// Toggle Settings Dropdown & Load Data (Apple-style Popover & Modal Sheet)
function toggleSettingsDropdown(forceOpen) {
    const dropdown = document.getElementById("settings-dropdown");
    const backdrop = document.getElementById("settings-backdrop");
    const navBtnSettings = document.getElementById("nav-btn-settings");
    const btnSettings = document.getElementById("btn-settings");
    if (!dropdown) return;

    if (dropdown.classList.contains("closing")) return;

    const isCurrentlyActive = dropdown.classList.contains("active");
    const shouldOpen = forceOpen !== undefined ? forceOpen : !isCurrentlyActive;

    if (shouldOpen) {
        // Haptic feedback
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(8); } catch (e) {}
        }

        dropdown.classList.remove("closing");
        if (backdrop) backdrop.classList.remove("closing");

        // Close any open sub panels first
        closeSubPanels();
        
        // Instant sync of form inputs from in-memory userSettingsState
        const zaloPhoneInput = document.getElementById("settings-zalo-phone");
        if (zaloPhoneInput) {
            zaloPhoneInput.value = userSettingsState.zaloPhone || '';
            const openZaloBtn = document.getElementById("btn-open-zalo-direct");
            if (openZaloBtn) {
                if (userSettingsState.zaloPhone) {
                    openZaloBtn.href = `https://zalo.me/${userSettingsState.zaloPhone.replace(/\D/g, '')}`;
                    openZaloBtn.style.display = "flex";
                } else {
                    openZaloBtn.style.display = "none";
                }
            }
        }
        
        const timeInput = document.getElementById("settings-reminder-time");
        if (timeInput) timeInput.value = userSettingsState.reminderTime ? userSettingsState.reminderTime.substring(0, 5) : '';
        
        
        // Populate main panel toggle switch
        const mainToggle = document.getElementById("settings-reminder-toggle");
        if (mainToggle) {
            mainToggle.checked = (userSettingsState.zaloNotifications === 1 || userSettingsState.emailNotifications === 1);
        }

        // Populate app notification inputs
        const appNotifTimeInput = document.getElementById("settings-app-notif-time");
        if (appNotifTimeInput) appNotifTimeInput.value = userSettingsState.reminderTime ? userSettingsState.reminderTime.substring(0, 5) : '20:00';
        
        const appNotifToggle = document.getElementById("settings-app-notif-toggle");
        if (appNotifToggle) appNotifToggle.checked = (userSettingsState.appNotifications === 1);

        
        // Update sub UI checkmarks and main row status badges immediately
        updateThemeSubPanelUI();
        updateSettingsStatusBadges();
        
        // Calculate coordinate position before starting Apple spring transition
        positionSettingsDropdown();
        
        // Trigger Apple transition
        dropdown.classList.add("active");
        if (backdrop) backdrop.classList.add("active");
        if (btnSettings) btnSettings.classList.add("active");
        if (navBtnSettings) navBtnSettings.classList.add("active");
        document.body.classList.add("settings-open");
        
        renderScopedIcons(dropdown);
        
        // Asynchronously refresh in background without blocking UI
        refreshNotificationSettingsFromServer();
    } else {
        closeSettingsDropdown();
    }
}

// Close Settings Dropdown
function closeSettingsDropdown() {
    const dropdown = document.getElementById("settings-dropdown");
    const backdrop = document.getElementById("settings-backdrop");
    const btnSettings = document.getElementById("btn-settings");
    const navBtnSettings = document.getElementById("nav-btn-settings");

    if (!dropdown || dropdown.classList.contains("closing") || !dropdown.classList.contains("active")) return;

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(6); } catch (e) {}
    }

    dropdown.classList.add("closing");
    if (backdrop) backdrop.classList.add("closing");
    if (btnSettings) btnSettings.classList.remove("active");
    if (navBtnSettings) navBtnSettings.classList.remove("active");

    setTimeout(() => {
        dropdown.classList.remove("active", "closing");
        if (backdrop) backdrop.classList.remove("active", "closing");
        document.body.classList.remove("settings-open");
        closeSubPanels();
    }, 220);
}

// Background sync of notification settings without blocking user interaction
function refreshNotificationSettingsFromServer() {
    if (!navigator.onLine) return;
    fetch(`${API_URL}?action=get_notification_settings`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                userSettingsState.email = data.email || '';
                userSettingsState.googleId = data.google_id || null;
                userSettingsState.reminderTime = data.reminder_time || '';
                userSettingsState.emailNotifications = data.email_notifications || 0;
                userSettingsState.zaloPhone = data.zalo_phone || '';
                userSettingsState.zaloUserId = data.zalo_user_id || '';
                userSettingsState.zaloNotifications = data.zalo_notifications !== undefined ? Number(data.zalo_notifications) : 0;
                userSettingsState.appNotifications = data.app_notifications !== undefined ? Number(data.app_notifications) : 1;
                
                const zaloPhoneInput = document.getElementById("settings-zalo-phone");
                if (zaloPhoneInput && !zaloPhoneInput.matches(':focus')) {
                    zaloPhoneInput.value = userSettingsState.zaloPhone;
                }
                const timeInput = document.getElementById("settings-reminder-time");
                if (timeInput && !timeInput.matches(':focus')) {
                    timeInput.value = userSettingsState.reminderTime ? userSettingsState.reminderTime.substring(0, 5) : '';
                }
                const mainToggle = document.getElementById("settings-reminder-toggle");
                if (mainToggle) {
                    mainToggle.checked = (userSettingsState.zaloNotifications === 1 || userSettingsState.emailNotifications === 1);
                }

                // Sync app notification inputs
                const appNotifTimeInput = document.getElementById("settings-app-notif-time");
                if (appNotifTimeInput && !appNotifTimeInput.matches(':focus')) {
                    appNotifTimeInput.value = userSettingsState.reminderTime ? userSettingsState.reminderTime.substring(0, 5) : '20:00';
                }
                const appNotifToggle = document.getElementById("settings-app-notif-toggle");
                if (appNotifToggle) {
                    appNotifToggle.checked = (userSettingsState.appNotifications === 1);
                }
                if (window.SpendMindAppNotification) {
                    window.SpendMindAppNotification.updateSettings({
                        enabled: userSettingsState.appNotifications === 1,
                        time: userSettingsState.reminderTime ? userSettingsState.reminderTime.substring(0, 5) : '20:00'
                    });
                }
                
                updateThemeSubPanelUI();
                updateSettingsStatusBadges();
            }
        })
        .catch(err => {
            console.warn("Background notification settings sync notice:", err);
        });
}

// Open specific Sub Panel in Settings
function openSubPanel(panelName) {
    // Hide all sub panels and deactivate all list items first
    closeSubPanels();
    
    const targetPanel = document.getElementById(`settings-${panelName}-panel`);
    const targetMenuItem = document.getElementById(`menu-item-${panelName}`);
    
    if (targetPanel) {
        targetPanel.classList.remove("hidden");
    }
    if (targetMenuItem) {
        targetMenuItem.classList.add("active");
    }
}

// Close all settings sub panels
function closeSubPanels() {
    zaloEnableRequested = false;
    document.querySelectorAll(".settings-panel.sub-panel").forEach(panel => {
        panel.classList.add("hidden");
    });
    document.querySelectorAll(".settings-list-item").forEach(item => {
        item.classList.remove("active");
    });
}

// Update settings parent items status text values
function updateSettingsStatusBadges() {
    const badgeReminder = document.getElementById("badge-reminder-status");
    if (badgeReminder) {
        const isActive = (userSettingsState.zaloNotifications === 1 || userSettingsState.emailNotifications === 1);
        badgeReminder.textContent = isActive ? (userSettingsState.reminderTime ? userSettingsState.reminderTime.substring(0, 5) : "Bật") : "Tắt";
    }

    const badgeAppNotif = document.getElementById("badge-app-notif-status");
    if (badgeAppNotif) {
        const isAppActive = (userSettingsState.appNotifications === 1);
        badgeAppNotif.textContent = isAppActive ? (userSettingsState.reminderTime ? userSettingsState.reminderTime.substring(0, 5) : "20:00") : "Tắt";
        badgeAppNotif.style.color = isAppActive ? "var(--accent-color)" : "var(--text-secondary)";
    }

}

// Update visual checkmarks inside theme sub-menu
function updateThemeSubPanelUI() {
    const optLight = document.getElementById("opt-theme-light");
    const optDark = document.getElementById("opt-theme-dark");
    const optSystem = document.getElementById("opt-theme-system");
    
    if (optLight && optDark && optSystem) {
        optLight.classList.remove("active");
        optDark.classList.remove("active");
        optSystem.classList.remove("active");
        
        if (state.theme === "light") {
            optLight.classList.add("active");
        } else if (state.theme === "dark") {
            optDark.classList.add("active");
        } else if (state.theme === "system") {
            optSystem.classList.add("active");
        }
    }
}



// Handle test Zalo reminder click
function handleTestZaloClick() {
    const btn = document.getElementById("btn-test-zalo");
    const phoneInput = document.getElementById("settings-zalo-phone");
    const phoneVal = phoneInput ? phoneInput.value.trim() : (userSettingsState.zaloPhone || "");

    if (!phoneVal) {
        showToast("Vui lòng nhập Số điện thoại Zalo trước khi gửi thử.", "error");
        if (phoneInput) phoneInput.focus();
        return;
    }

    const originalContent = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite;">⏳</span> Đang gửi tin...`;
    }

    fetch(`${API_URL}?action=test_zalo_reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zalo_phone: phoneVal })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(data.message || "Đã tạo tin nhắn Zalo thành công!", "success");
            const openZaloBtn = document.getElementById("btn-open-zalo-direct");
            if (openZaloBtn) {
                const link = data.zalo_link || `https://zalo.me/${phoneVal.replace(/\D/g, '')}`;
                openZaloBtn.href = link;
                openZaloBtn.style.display = "flex";
                renderScopedIcons(openZaloBtn);
            }
        } else {
            showToast("Lỗi gửi tin: " + (data.message || "Thất bại"), "error");
        }
    })
    .catch(err => {
        showToast("Lỗi kết nối máy chủ: " + err.message, "error");
    })
    .finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            renderScopedIcons(btn);
        }
    });
}

// Handle notification settings form save
function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const zaloPhone = document.getElementById("settings-zalo-phone") ? document.getElementById("settings-zalo-phone").value.trim() : '';
    const reminderTime = document.getElementById("settings-reminder-time") ? document.getElementById("settings-reminder-time").value : '';
    const reminderToggle = document.getElementById("settings-reminder-toggle");
    const zaloNotifications = ((reminderToggle && reminderToggle.checked) || zaloEnableRequested) ? 1 : 0;
    
    if (zaloNotifications === 1 && !zaloPhone) {
        showToast("Vui lòng nhập Số điện thoại Zalo để nhận nhắc nhở", "error");
        const phoneInput = document.getElementById("settings-zalo-phone");
        if (phoneInput) phoneInput.focus();
        return;
    }

    if (zaloPhone && !/^(\+84|0)(3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/.test(zaloPhone.replace(/\s+/g, ''))) {
        showToast("Số điện thoại Zalo không hợp lệ (Vui lòng nhập 10 số, VD: 0912345678)", "error");
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const oldSubmitHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-inline"></span> <span>Đang lưu cài đặt...</span>`;
    }
    const restoreSettingsBtn = () => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = oldSubmitHtml;
            renderScopedIcons(submitBtn);
        }
    };

    fetch(`${API_URL}?action=save_notification_settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            zalo_phone: zaloPhone.replace(/\s+/g, ''),
            reminder_time: reminderTime,
            zalo_notifications: zaloNotifications,
            email: userSettingsState.email || ''
        })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.message || "Lưu cài đặt thất bại"); });
        }
        return res.json();
    })
    .then(data => {
        if (data.success) {
            showToast(data.message, "success");
            
            // Update values and status text on main list
            userSettingsState.zaloNotifications = zaloNotifications;
            userSettingsState.zaloPhone = zaloPhone.replace(/\s+/g, '');
            userSettingsState.reminderTime = reminderTime;
            
            // Sync main panel toggle switch
            const mainToggle = document.getElementById("settings-reminder-toggle");
            if (mainToggle) {
                mainToggle.checked = (zaloNotifications === 1);
            }
            
            updateSettingsStatusBadges();
            closeSubPanels();
            triggerLazyCronReminderCheck();
        }
    })
    .catch(err => {
        showToast(err.message, "error");
    })
    .finally(() => {
        restoreSettingsBtn();
    });
}

// Clear all data (Transactions & Budgets)
function handleClearAllData() {
    if (confirm("CẢNH BÁO NGUY HIỂM!\n\nBạn có chắc chắn muốn xóa toàn bộ lịch sử giao dịch và hạn mức chi tiêu không?\nThao tác này KHÔNG THỂ HOÀN TÁC.")) {
        if (confirm("XÁC NHẬN CUỐI CÙNG:\n\nMọi dữ liệu tài chính của bạn sẽ bị xóa vĩnh viễn khỏi máy chủ. Bạn vẫn muốn tiếp tục?")) {
            fetch(`${API_URL}?action=clear_all_data`, {
                method: "POST"
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.message || "Xóa dữ liệu thất bại"); });
                }
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    showToast(data.message, "success");
                    // Clear state
                    state.transactions = [];
                    state.budgets = { ...DEFAULT_BUDGETS };
                    
                    // Reset form and UI
                    resetTransactionForm();
                    updateUI();
                    
                    // Close settings dropdown
                    closeSettingsDropdown();
                } else {
                    showToast("Xóa thất bại: " + data.message, "error");
                }
            })
            .catch(err => {
                showToast("Lỗi máy chủ: " + err.message, "error");
                console.error(err);
            });
        }
    }
}

// Global window exposure for compatibility
window.editTransaction = editTransaction;
window.selectCalendarDay = selectCalendarDay;
window.openTransactionModalForDate = openTransactionModalForDate;
window.openTransactionModal = openTransactionModal;
window.closeTransactionModal = closeTransactionModal;
window.openDayEditModal = openDayEditModal;
window.closeDayEditModal = closeDayEditModal;
window.closeSettingsDropdown = closeSettingsDropdown;
window.toggleSettingsDropdown = toggleSettingsDropdown;
window.positionSettingsDropdown = positionSettingsDropdown;

// Auto-scale layout & charts on viewport change (Mobile <-> Tablet <-> Desktop)
let resizeDebounceTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
        const isMobileScreen = window.innerWidth <= 640;
        if (trendChartInstance && trendChartInstance.ctx) {
            trendChartInstance.data.datasets[0].maxBarThickness = isMobileScreen ? 18 : 28;
            trendChartInstance.data.datasets[1].maxBarThickness = isMobileScreen ? 18 : 28;
            trendChartInstance.options.scales.x.ticks.font.size = isMobileScreen ? 9.5 : 11;
            trendChartInstance.options.scales.y.ticks.font.size = isMobileScreen ? 9.5 : 10;
            trendChartInstance.options.scales.y1.ticks.font.size = isMobileScreen ? 9.5 : 10;
            trendChartInstance.options.plugins.legend.labels.padding = isMobileScreen ? 8 : 14;
            trendChartInstance.options.plugins.legend.labels.font.size = isMobileScreen ? 10.5 : 11;
            trendChartInstance.resize();
            trendChartInstance.update('none');
        }
    }, 150);
});
