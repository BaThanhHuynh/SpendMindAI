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
    theme: "dark"
};

// User Settings State (Global)
let userSettingsState = {
    email: '',
    googleId: null,
    reminderTime: '',
    emailNotifications: 0,
    zaloPhone: '',
    zaloUserId: '',
    zaloNotifications: 0
};

// Chart.js Instances
let categoryChartInstance = null;
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

// Calendar State
let currentCalendarDate = new Date();
let selectedCalendarDay = new Date();

// API Endpoint configuration
const API_URL = "api";

// --- 2. INITIALIZATION & ROUTING SECURITY ---
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    checkAuthSession(); // Session guard (Redirects to login.html if guest)
    populateCategorySelectors();
    initEventListeners();
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// Secure Session Guard Check
function checkAuthSession() {
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
                    updateUI();
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            updateUI(false);
                        });
                    });
                } else {
                    fetchStateFromServer(); // Fallback to secondary fetch if omitted
                }
                
                // Trigger Lazy Cron Check here
                triggerLazyCronReminderCheck();
            } else {
                // If not authenticated, kick back to login immediately
                window.location.href = "login";
            }
        })
        .catch(err => {
            console.error("Auth Guard error:", err);
            window.location.href = "login";
        });
}

// Update Logo Avatar UI with strict URL protocol verification
function updateAvatarUI(avatarUrl) {
    const logoIcon = document.querySelector(".logo-area .logo-icon");
    if (logoIcon) {
        logoIcon.innerHTML = "";
        const img = document.createElement("img");
        img.src = "images/logoapp.png?v=20260911_v8";
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
            btnSettings.innerHTML = `<img src="${avatarUrl}" class="user-avatar-img" alt="Avatar" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; display: block; border: 1.5px solid var(--accent-color);">`;
        }
    }
}

// Lazy Cron reminder checker
function triggerLazyCronReminderCheck() {
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
    fetch(API_URL)
        .then(response => {
            if (response.status === 401) {
                window.location.href = "login";
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
function openTransactionModal() {
    const modal = document.getElementById("transaction-modal");
    if (modal) {
        modal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    }
}

function closeTransactionModal() {
    const modal = document.getElementById("transaction-modal");
    if (modal) {
        modal.classList.add("hidden");
        document.body.classList.remove("modal-open");
        resetTransactionForm();
    }
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

    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.addEventListener("input", () => updateUI(false)); // Performance

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
    if (calendarGrid) {
        calendarGrid.addEventListener("click", (e) => {
            const quickAddBtn = e.target.closest(".btn-quick-add");
            if (quickAddBtn) {
                e.stopPropagation();
                const time = Number(quickAddBtn.dataset.time);
                if (time) {
                    openTransactionModalForDate(time, e);
                }
                return;
            }
            const cell = e.target.closest(".calendar-cell");
            if (cell && cell.dataset.time) {
                selectCalendarDay(Number(cell.dataset.time));
            }
        });
    }

    const dailyTransactionsList = document.getElementById("daily-transactions-list");
    if (dailyTransactionsList) {
        dailyTransactionsList.addEventListener("click", (e) => {
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

                    const subPanelCheckbox = document.getElementById("settings-zalo-notifications");
                    if (subPanelCheckbox) {
                        subPanelCheckbox.checked = isChecked;
                    }
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
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                } else {
                    openZaloBtn.style.display = "none";
                }
            }
        });
    }

    const menuItemTheme = document.getElementById("menu-item-theme");
    if (menuItemTheme) {
        menuItemTheme.addEventListener("click", (e) => {
            e.stopPropagation();
            openSubPanel("theme");
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
    const btnCloseReminderSub = document.getElementById("btn-close-reminder-sub");
    if (btnCloseReminderSub) btnCloseReminderSub.addEventListener("click", closeSettingsDropdown);

    const btnCloseThemeSub = document.getElementById("btn-close-theme-sub");
    if (btnCloseThemeSub) btnCloseThemeSub.addEventListener("click", closeSettingsDropdown);

    // Back buttons click in sub-panels (goes back to main menu panel)
    document.querySelectorAll(".btn-back-settings").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSubPanels();
        });
    });

    // Theme options list checkmark select triggers
    const optLight = document.getElementById("opt-theme-light");
    if (optLight) {
        optLight.addEventListener("click", () => {
            if (state.theme !== "light") {
                setTheme("light");
                showToast("Đã chuyển sang giao diện Sáng", "info");
            }
        });
    }
    const optDark = document.getElementById("opt-theme-dark");
    if (optDark) {
        optDark.addEventListener("click", () => {
            if (state.theme !== "dark") {
                setTheme("dark");
                showToast("Đã chuyển sang giao diện Tối", "info");
            }
        });
    }
    const optSystem = document.getElementById("opt-theme-system");
    if (optSystem) {
        optSystem.addEventListener("click", () => {
            if (state.theme !== "system") {
                setTheme("system");
                showToast("Đã chuyển sang giao diện Hệ thống", "info");
            }
        });
    }

    // Clear all data event listener
    const btnClear = document.getElementById("btn-clear-all-data");
    if (btnClear) btnClear.addEventListener("click", handleClearAllData);

    // Close dropdown on click outside
    document.addEventListener("click", (e) => {
        const dropdown = document.getElementById("settings-dropdown");
        const btnSettingsEl = document.getElementById("btn-settings");
        const navBtnSettingsEl = document.getElementById("nav-btn-settings");
        if (dropdown && !dropdown.classList.contains("hidden")) {
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
            const dropdown = document.getElementById("settings-dropdown");
            if (dropdown && !dropdown.classList.contains("hidden")) {
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

    if (navBtnAdd) {
        navBtnAdd.addEventListener("click", () => {
            openTransactionModal();
        });
    }

    if (navBtnChatbot) {
        navBtnChatbot.addEventListener("click", () => {
            const chatBtn = document.getElementById("chatbot-trigger-btn");
            if (chatBtn) chatBtn.click();
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

    // Calendar navigation
    const btnPrevMonth = document.getElementById("btn-prev-month");
    if (btnPrevMonth) {
        btnPrevMonth.addEventListener("click", () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            updateUI();
        });
    }
    const btnNextMonth = document.getElementById("btn-next-month");
    if (btnNextMonth) {
        btnNextMonth.addEventListener("click", () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            updateUI();
        });
    }
    const btnToggleSearch = document.getElementById("btn-toggle-search");
    if (btnToggleSearch) {
        btnToggleSearch.addEventListener("click", () => {
            const panel = document.getElementById("calendar-filter-panel");
            if (!panel) return;
            const isCollapsed = panel.classList.contains("collapsed");
            if (isCollapsed) {
                panel.classList.remove("collapsed");
                panel.style.maxHeight = "120px";
                panel.style.opacity = "1";
                panel.style.marginBottom = "16px";
            } else {
                panel.classList.add("collapsed");
                panel.style.maxHeight = "0";
                panel.style.opacity = "0";
                panel.style.marginBottom = "0";
            }
        });
    }

    setTodayInDateInput();
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

// Toggle budget settings collapsible panel
function toggleBudgetSettings() {
    const panel = document.getElementById("budget-settings-panel");
    const triggerBtn = document.getElementById("btn-toggle-budget-settings");
    
    const isCollapsed = panel.classList.contains("collapsed");
    if (isCollapsed) {
        renderBudgetSettingsInputs();
        panel.classList.remove("collapsed");
        triggerBtn.innerHTML = '<i data-lucide="chevron-up"></i> Đóng thiết lập hạn mức';
    } else {
        panel.classList.add("collapsed");
        triggerBtn.innerHTML = '<i data-lucide="settings"></i> Thiết lập hạn mức chi tiêu';
    }
    lucide.createIcons();
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
    });
}

// Cancel editing a transaction
function cancelEditMode() {
    resetTransactionForm();
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

    document.getElementById("btn-submit").innerHTML = '<i data-lucide="save"></i> <span>Thêm giao dịch</span>';
    document.getElementById("btn-cancel-edit").style.display = "none";
    document.getElementById("btn-delete-edit").style.display = "none";
    document.getElementById("form-title").textContent = "Giao dịch mới";
    lucide.createIcons();
}

// Edit transaction trigger (loads data into form)
function editTransaction(id) {
    const transaction = state.transactions.find(t => t.id === id);
    if (!transaction) return;

    // On mobile, scroll smoothly without layout disruption
    const formCard = document.querySelector(".form-card");
    if (formCard) {
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
    document.getElementById("btn-submit").innerHTML = '<i data-lucide="check-circle"></i> <span>Cập nhật</span>';
    document.getElementById("btn-cancel-edit").style.display = "inline-flex";
    document.getElementById("btn-delete-edit").style.display = "inline-flex";
    document.getElementById("btn-delete-edit").onclick = () => deleteTransaction(transaction.id);
    lucide.createIcons();
}

// Delete transaction trigger
function deleteTransaction(id) {
    if (confirm("Bạn có chắc chắn muốn xóa giao dịch này không?")) {
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
                fetchStateFromServer();
            }
        })
        .catch(err => {
            showToast(err.message, "error");
            console.error(err);
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
    });
}

// --- 4. RENDER & CALCULATE UI ---

function updateUI(redrawCharts = true) {
    const stats = calculateFinanceStats();
    
    document.getElementById("total-balance").textContent = formatVND(stats.balance);
    document.getElementById("summary-income").textContent = formatVND(stats.income);
    document.getElementById("summary-expense").textContent = formatVND(stats.expense);

    const balanceEl = document.getElementById("total-balance");
    if (stats.balance < 0) {
        balanceEl.style.backgroundImage = "linear-gradient(to right, var(--expense-color), var(--text-muted))";
    } else {
        balanceEl.style.backgroundImage = "linear-gradient(to right, var(--text-primary), var(--text-secondary))";
    }

    renderCalendarView(stats.filteredTransactions);
    renderBudgetsProgress(stats.categoryExpenses);

    if (redrawCharts) {
        renderCharts(stats.categoryExpenses);
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

function formatVND(val) {
    return formatNumberWithCommas(val) + 'đ';
}

function formatNumberWithCommas(n) {
    const parts = n.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
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

function renderCalendarView(filteredTransactions) {
    const gridCells = document.getElementById("calendar-grid-cells");
    const monthYearDisplay = document.getElementById("month-year-display");
    const dailyIncomeVal = document.getElementById("daily-income-val");
    const dailyExpenseVal = document.getElementById("daily-expense-val");
    const dailyNetVal = document.getElementById("daily-net-val");
    const selectedDateLabel = document.getElementById("selected-date-label");
    const selectedDateTotal = document.getElementById("selected-date-total");
    const dailyTransactionsList = document.getElementById("daily-transactions-list");
    const dailyEmptyState = document.getElementById("daily-transactions-empty");

    const currentMonth = currentCalendarDate.getMonth();
    const currentYear = currentCalendarDate.getFullYear();
    const formattedMonth = String(currentMonth + 1).padStart(2, '0');
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    monthYearDisplay.textContent = `${formattedMonth}/${currentYear} (01/${formattedMonth}-${lastDayOfMonth}/${formattedMonth})`;

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

        const cellDayOfWeek = cellDate.getDay();
        let dayClass = "";
        if (cellDayOfWeek === 0) dayClass = "sun-text";
        else if (cellDayOfWeek === 6) dayClass = "sat-text";

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
            <span class="day-num ${dayClass}">${cellDate.getDate()}</span>
            ${amountHTML}
            <button type="button" class="btn-quick-add" data-time="${cellDate.getTime()}" title="Thêm giao dịch mới"><i data-lucide="edit-2"></i></button>
        `;
        gridCells.appendChild(cellEl);
    }
    
    // Layout reflow workaround removed as DOM is no longer rebuilt on click

    updateDailyTransactionsView();
    
    // Create icons for the newly injected quick-add buttons
    lucide.createIcons();
}

function updateDailyTransactionsView() {
    const stats = calculateFinanceStats();
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
    const selectedDateLabel = document.getElementById("selected-date-label");
    const selectedDateTotal = document.getElementById("selected-date-total");
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

    selectedDateLabel.textContent = formatSelectedDateLabel(selectedCalendarDay);
    selectedDateTotal.textContent = (dailyNet < 0 ? '-' : '') + formatNumberWithCommas(Math.abs(dailyNet)) + 'đ';
    selectedDateTotal.className = dailyNet >= 0 ? 'val-net-income' : 'val-net-expense';

    dailyTransactionsList.innerHTML = "";
    dailyTransactionsList.scrollTop = 0;

    if (selectedDayTransactions.length === 0) {
        dailyEmptyState.style.display = "flex";
        dailyTransactionsList.style.display = "none";
    } else {
        dailyEmptyState.style.display = "none";
        dailyTransactionsList.style.display = "flex";

        selectedDayTransactions.forEach(t => {
            const cat = CATEGORIES[t.category] || { label: t.category, icon: "help-circle", colorClass: "badge-color-mint" };
            const item = document.createElement("div");
            item.className = "daily-item";
            item.dataset.id = t.id;

            item.innerHTML = `
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
                        <i data-lucide="chevron-right" class="chevron-arrow" style="width:15px; height:15px;"></i>
                    </div>
                </div>
            `;
            dailyTransactionsList.appendChild(item);
        });

        lucide.createIcons();
    }
}

function renderBudgetsProgress(categoryExpenses) {
    const container = document.getElementById("budget-progress-container");
    container.innerHTML = "";

    let hasBudgets = false;

    Object.keys(state.budgets).forEach(categoryKey => {
        const limit = state.budgets[categoryKey];
        if (limit > 0) {
            hasBudgets = true;
            const spent = categoryExpenses[categoryKey] || 0;
            const percentage = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
            
            const cat = CATEGORIES[categoryKey];
            const item = document.createElement("div");
            item.className = "budget-item";

            let progressClass = "progress-safe";
            if (percentage >= 100) {
                progressClass = "progress-danger";
            } else if (percentage >= 80) {
                progressClass = "progress-warning";
            }

            item.innerHTML = `
                <div class="budget-meta">
                    <span class="budget-name">
                        <i data-lucide="${cat.icon}" style="width: 14px; height:14px; color: var(--text-secondary)"></i>
                        ${cat.label}
                    </span>
                    <span class="budget-values">
                        <strong>${formatVND(spent)}</strong> / ${formatVND(limit)} (${Math.round(percentage)}%)
                    </span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill ${progressClass}" style="width: ${percentage}%"></div>
                </div>
            `;
            container.appendChild(item);
        }
    });

    if (!hasBudgets) {
        container.innerHTML = `
            <div class="text-center text-muted" style="font-size: 0.85rem; padding: 16px 0;">
                <p>Chưa thiết lập hạn mức nào.</p>
                <p style="font-size: 0.75rem; margin-top: 4px;">Click "Thiết lập hạn mức" ở trên để kiểm soát chi tiêu tốt hơn.</p>
            </div>
        `;
    }

    lucide.createIcons();
}

// --- 5. RENDER CHART JS VISUALIZATIONS ---
function renderCharts(categoryExpenses = null) {
    if (!categoryExpenses) {
        const stats = calculateFinanceStats();
        categoryExpenses = stats.categoryExpenses;
    }

    if (categoryChartInstance) categoryChartInstance.destroy();
    if (trendChartInstance) trendChartInstance.destroy();

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textThemeColor = isDark ? "#9bb0a5" : "#46594f";
    const gridThemeColor = isDark ? "rgba(160, 235, 200, 0.06)" : "rgba(6, 78, 59, 0.06)";

    // -- CHART 1: DONUT CATEGORY EXPENSES --
    const donutCanvas = document.getElementById("categoryChart");
    const chartNoData = document.getElementById("chart-no-data");
    
    const expenseLabels = [];
    const expenseAmounts = [];
    const bgColors = [];
    const borderColors = [];

    // Monochrome emerald scale (pale mint -> near-black green), widely spaced
    // so even 2-3 categories read as clearly distinct slices.
    const donutScale = [
        { bg: 'rgba(154, 240, 207, 0.92)', border: '#9af0cf' },
        { bg: 'rgba(52, 211, 153, 0.92)',  border: '#34d399' },
        { bg: 'rgba(13, 148, 99, 0.92)',   border: '#0d9463' },
        { bg: 'rgba(8, 107, 72, 0.92)',    border: '#086b48' },
        { bg: 'rgba(6, 72, 49, 0.92)',     border: '#064831' },
        { bg: 'rgba(4, 46, 31, 0.92)',     border: '#042e1f' }
    ];

    Object.keys(categoryExpenses)
        .filter(key => categoryExpenses[key] > 0)
        .sort((a, b) => categoryExpenses[b] - categoryExpenses[a])
        .forEach((key, i) => {
            const cat = CATEGORIES[key];
            const colors = donutScale[i % donutScale.length];
            expenseLabels.push(cat ? cat.label : key);
            expenseAmounts.push(categoryExpenses[key]);
            bgColors.push(colors.bg);
            borderColors.push(colors.border);
        });

    if (expenseAmounts.length === 0) {
        donutCanvas.style.display = "none";
        chartNoData.style.display = "block";
    } else {
        donutCanvas.style.display = "block";
        chartNoData.style.display = "none";

        categoryChartInstance = new Chart(donutCanvas, {
            type: 'doughnut',
            data: {
                labels: expenseLabels,
                datasets: [{
                    data: expenseAmounts,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: textThemeColor,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8,
                            boxHeight: 8,
                            padding: 16,
                            font: { family: "'Montserrat', sans-serif", size: 12.5 },
                            generateLabels: function(chart) {
                                const ds = chart.data.datasets[0];
                                const total = ds.data.reduce((a, b) => a + b, 0);
                                return chart.data.labels.map((label, i) => {
                                    const pct = total > 0 ? Math.round((ds.data[i] / total) * 100) : 0;
                                    return {
                                        text: `${label}  ${pct}%`,
                                        fillStyle: ds.backgroundColor[i],
                                        strokeStyle: ds.backgroundColor[i],
                                        lineWidth: 0,
                                        index: i,
                                        fontColor: textThemeColor
                                    };
                                });
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${formatVND(context.raw)}`;
                            }
                        }
                    }
                },
                cutout: '72%'
            }
        });
    }

    // -- CHART 2: DAILY/WEEKLY TRENDS --
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

    const datesArray = Object.keys(datesWithEntries);
    const displayDates = datesArray.slice(-7);
    const trendIncome = displayDates.map(d => datesWithEntries[d].income);
    const trendExpense = displayDates.map(d => datesWithEntries[d].expense);

    if (displayDates.length === 0) {
        trendCanvas.style.display = "none";
        trendNoData.style.display = "block";
    } else {
        trendCanvas.style.display = "block";
        trendNoData.style.display = "none";

        trendChartInstance = new Chart(trendCanvas, {
            type: 'bar',
            data: {
                labels: displayDates,
                datasets: [
                    {
                        label: 'Thu nhập',
                        data: trendIncome,
                        backgroundColor: '#10b981',
                        borderRadius: 6,
                        maxBarThickness: 32
                    },
                    {
                        label: 'Chi tiêu',
                        data: trendExpense,
                        backgroundColor: '#ef4444',
                        borderRadius: 6,
                        maxBarThickness: 32
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textThemeColor, font: { family: "'Montserrat', sans-serif", size: 10 } }
                    },
                    y: {
                        grid: { color: gridThemeColor },
                        ticks: {
                            color: textThemeColor,
                            font: { family: "'Montserrat', sans-serif", size: 10 },
                            callback: function(value) {
                                return value >= 1000000 ? (value / 1000000) + 'Mđ' : (value / 1000) + 'kđ';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textThemeColor,
                            font: { family: "'Montserrat', sans-serif", size: 11 },
                            padding: 14
                        }
                    },
                    tooltip: {
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
    lucide.createIcons();

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
    if (!dropdown || dropdown.classList.contains("hidden")) return;
    
    if (window.innerWidth > 768) {
        if (btnSettings) {
            const rect = btnSettings.getBoundingClientRect();
            dropdown.style.position = "fixed";
            dropdown.style.top = Math.round(rect.bottom + 8) + "px";
            dropdown.style.right = Math.max(16, Math.round(window.innerWidth - rect.right)) + "px";
            dropdown.style.left = "auto";
            dropdown.style.bottom = "auto";
            dropdown.style.transform = "none";
        }
    } else {
        dropdown.style.position = "";
        dropdown.style.top = "";
        dropdown.style.left = "";
        dropdown.style.right = "";
        dropdown.style.bottom = "";
        dropdown.style.transform = "";
    }
}

// Toggle Settings Dropdown & Load Data (Instant 0ms response like Chatbot AI)
function toggleSettingsDropdown() {
    const dropdown = document.getElementById("settings-dropdown");
    const backdrop = document.getElementById("settings-backdrop");
    const navBtnSettings = document.getElementById("nav-btn-settings");
    const btnSettings = document.getElementById("btn-settings");
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains("hidden");
    if (isHidden) {
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
        
        const notifCheck = document.getElementById("settings-zalo-notifications");
        if (notifCheck) notifCheck.checked = (userSettingsState.zaloNotifications === 1 || userSettingsState.emailNotifications === 1);
        
        // Populate main panel toggle switch
        const mainToggle = document.getElementById("settings-reminder-toggle");
        if (mainToggle) {
            mainToggle.checked = (userSettingsState.zaloNotifications === 1 || userSettingsState.emailNotifications === 1);
        }
        
        // Update sub UI checkmarks and main row status badges immediately
        updateThemeSubPanelUI();
        updateSettingsStatusBadges();
        
        if (window.innerWidth <= 768) {
            if (backdrop) backdrop.classList.remove("hidden");
            document.body.classList.add("settings-open");
        } else {
            if (backdrop) backdrop.classList.add("hidden");
        }
        
        // Display settings dropdown INSTANTLY (0ms latency, matching AI Chatbot)
        dropdown.classList.remove("hidden");
        if (btnSettings) btnSettings.classList.add("active");
        if (navBtnSettings) navBtnSettings.classList.add("active");
        
        positionSettingsDropdown();
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
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
    if (dropdown) {
        dropdown.classList.add("hidden");
        dropdown.style.position = "";
        dropdown.style.top = "";
        dropdown.style.left = "";
        dropdown.style.right = "";
        dropdown.style.bottom = "";
        dropdown.style.transform = "";
    }
    if (backdrop) {
        backdrop.classList.add("hidden");
    }
    document.body.classList.remove("settings-open");
    const btnSettings = document.getElementById("btn-settings");
    if (btnSettings) {
        btnSettings.classList.remove("active");
    }
    const navBtnSettings = document.getElementById("nav-btn-settings");
    if (navBtnSettings) {
        navBtnSettings.classList.remove("active");
    }
    closeSubPanels();
}

// Background sync of notification settings without blocking user interaction
function refreshNotificationSettingsFromServer() {
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
                
                const zaloPhoneInput = document.getElementById("settings-zalo-phone");
                if (zaloPhoneInput && !zaloPhoneInput.matches(':focus')) {
                    zaloPhoneInput.value = userSettingsState.zaloPhone;
                }
                const timeInput = document.getElementById("settings-reminder-time");
                if (timeInput && !timeInput.matches(':focus')) {
                    timeInput.value = userSettingsState.reminderTime ? userSettingsState.reminderTime.substring(0, 5) : '';
                }
                const notifCheck = document.getElementById("settings-zalo-notifications");
                if (notifCheck) {
                    notifCheck.checked = (userSettingsState.zaloNotifications === 1 || userSettingsState.emailNotifications === 1);
                }
                const mainToggle = document.getElementById("settings-reminder-toggle");
                if (mainToggle) {
                    mainToggle.checked = (userSettingsState.zaloNotifications === 1 || userSettingsState.emailNotifications === 1);
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

    const badgeTheme = document.getElementById("badge-theme-status");
    if (badgeTheme) {
        if (state.theme === "dark") badgeTheme.textContent = "Tối";
        else if (state.theme === "light") badgeTheme.textContent = "Sáng";
        else if (state.theme === "system") badgeTheme.textContent = "Hệ thống";
    }
}

// Update visual checkmarks inside theme sub-menu
function updateThemeSubPanelUI() {
    const optLight = document.getElementById("opt-theme-light");
    const optDark = document.getElementById("opt-theme-dark");
    const optSystem = document.getElementById("opt-theme-system");
    const badgeTheme = document.getElementById("badge-theme-status");
    
    if (optLight && optDark && optSystem) {
        optLight.classList.remove("active");
        optDark.classList.remove("active");
        optSystem.classList.remove("active");
        
        if (state.theme === "light") {
            optLight.classList.add("active");
            if (badgeTheme) badgeTheme.textContent = "Sáng";
        } else if (state.theme === "dark") {
            optDark.classList.add("active");
            if (badgeTheme) badgeTheme.textContent = "Tối";
        } else if (state.theme === "system") {
            optSystem.classList.add("active");
            if (badgeTheme) badgeTheme.textContent = "Hệ thống";
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
                if (typeof lucide !== 'undefined') lucide.createIcons();
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
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    });
}

// Handle notification settings form save
function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const zaloPhone = document.getElementById("settings-zalo-phone") ? document.getElementById("settings-zalo-phone").value.trim() : '';
    const reminderTime = document.getElementById("settings-reminder-time") ? document.getElementById("settings-reminder-time").value : '';
    const zaloNotifications = (document.getElementById("settings-zalo-notifications") && document.getElementById("settings-zalo-notifications").checked) ? 1 : 0;
    
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
window.closeSettingsDropdown = closeSettingsDropdown;
window.toggleSettingsDropdown = toggleSettingsDropdown;
window.positionSettingsDropdown = positionSettingsDropdown;
