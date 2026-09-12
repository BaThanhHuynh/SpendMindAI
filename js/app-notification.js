/* ==========================================================================
   SPENDMINDAI - IN-APP & DEVICE NOTIFICATION MANAGER (ANDROID & IOS PWA)
   Manages automated daily spending reminders from the app itself,
   permission negotiation, real-time scheduling engine and notification actions.
   ========================================================================== */

(function (window, document) {
    'use strict';

    const STORAGE_KEY_SETTINGS = 'spendmind_app_notif_settings';
    const STORAGE_KEY_LAST_SENT = 'spendmind_last_app_notif_date';

    // State cache
    const state = {
        enabled: true,
        time: '20:00',
        onlyIfNoExpenses: true,
        isStandalone: false,
        hasCheckedUrlAction: false
    };

    // Initialize detection
    function initDetection() {
        state.isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                             window.navigator.standalone === true ||
                             document.referrer.includes('android-app://');

        // Load local cache
        try {
            const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (typeof parsed.enabled === 'boolean') state.enabled = parsed.enabled;
                if (parsed.time) state.time = parsed.time;
                if (typeof parsed.onlyIfNoExpenses === 'boolean') state.onlyIfNoExpenses = parsed.onlyIfNoExpenses;
            }
        } catch (e) {
            console.warn('Could not read cached notification settings:', e);
        }
    }

    initDetection();

    // Check permission status
    function getPermissionStatus() {
        if (!('Notification' in window)) {
            return 'unsupported';
        }
        return Notification.permission; // 'default', 'granted', 'denied'
    }

    // Request system notification permission
    async function requestPermission() {
        if (!('Notification' in window)) {
            if (typeof showToast === 'function') {
                showToast('Trình duyệt hoặc thiết bị này không hỗ trợ Web Notification.', 'warning');
            }
            return 'unsupported';
        }

        try {
            const result = await Notification.requestPermission();
            updateUIStatus();
            return result;
        } catch (err) {
            console.warn('Error requesting notification permission:', err);
            return 'denied';
        }
    }

    // Display a notification natively via Service Worker registration
    async function showNotification(title, options = {}) {
        const defaultOptions = {
            body: 'Đừng quên ghi chép chi tiêu hôm nay để kiểm soát tài chính thông minh!',
            icon: '/images/logoapp-192.png',
            badge: '/images/logoapp-192.png',
            tag: 'spendmind-daily-reminder',
            renotify: true,
            vibrate: [200, 100, 200],
            data: { url: '/dashboard.html?action=add_transaction' },
            actions: [
                { action: 'open', title: 'Ghi chép ngay' },
                { action: 'dismiss', title: 'Để sau' }
            ]
        };

        const merged = Object.assign({}, defaultOptions, options);

        // Try Service Worker registration first (standard for Android & iOS PWA)
        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.showNotification) {
                    await reg.showNotification(title, merged);
                    return true;
                }
            } catch (swErr) {
                console.warn('Service worker showNotification fallback:', swErr);
            }
        }

        // Fallback to classic Notification constructor if available
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const notif = new Notification(title, merged);
                notif.onclick = () => {
                    window.focus();
                    notif.close();
                    handleNotificationActionRedirect();
                };
                return true;
            } catch (notifErr) {
                console.warn('Classic Notification constructor error:', notifErr);
            }
        }

        // In-app visual toast fallback if OS permission blocked
        if (typeof showToast === 'function') {
            showToast(`${title}: ${merged.body}`, 'info');
        }
        return false;
    }

    // Check if user has recorded any expense today
    function hasExpensesRecordedToday() {
        const todayStr = getTodayDateString();
        const txList = (window.state && Array.isArray(window.state.transactions))
            ? window.state.transactions
            : (Array.isArray(window.allTransactions) ? window.allTransactions : []);

        return txList.some(tx => {
            if (tx.type === 'expense' && tx.date) {
                const txDate = tx.date.split('T')[0];
                return txDate === todayStr;
            }
            return false;
        });
    }

    function getTodayDateString() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getCurrentTimeString() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }

    // Core scheduler checker: compares time and checks conditions
    function checkScheduledReminder() {
        if (!state.enabled) return;

        const targetTime = state.time || '20:00';
        const currentTime = getCurrentTimeString();
        const todayStr = getTodayDateString();
        const lastSent = localStorage.getItem(STORAGE_KEY_LAST_SENT);

        // Already sent today
        if (lastSent === todayStr) {
            return;
        }

        // Trigger condition: current time is at or after reminder time
        if (currentTime >= targetTime) {
            // If condition says "only if no expenses recorded today"
            if (state.onlyIfNoExpenses && hasExpensesRecordedToday()) {
                // User already recorded spending today! Mark as done so we don't bother them
                localStorage.setItem(STORAGE_KEY_LAST_SENT, todayStr);
                return;
            }

            // Dispatch notification
            if (getPermissionStatus() === 'granted') {
                showNotification('SpendMindAI - Nhắc nhở chi tiêu 🔔', {
                    body: 'Bạn chưa ghi chép chi tiêu hôm nay. Hãy dành 30 giây ghi lại để không sót khoản nào nhé!',
                    tag: 'spendmind-daily-reminder-' + todayStr
                });
                localStorage.setItem(STORAGE_KEY_LAST_SENT, todayStr);
            }
        }
    }

    // Trigger immediate test notification
    async function sendTestNotification() {
        const perm = getPermissionStatus();
        if (perm !== 'granted') {
            const requested = await requestPermission();
            if (requested !== 'granted') {
                if (typeof showToast === 'function') {
                    showToast('Vui lòng cho phép quyền thông báo trên thiết bị để nhận nhắc nhở.', 'warning');
                }
                return;
            }
        }

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        await showNotification('SpendMindAI - Thông báo thử nghiệm ✨', {
            body: `Đã kích hoạt thành công lúc ${timeStr}! Ứng dụng sẽ tự động nhắc nhở bạn theo giờ đã cài đặt.`,
            tag: 'spendmind-test-reminder',
            data: { url: '/dashboard.html?action=add_transaction' }
        });

        if (typeof showToast === 'function') {
            showToast('Đã gửi thông báo thử nghiệm thành công lên thiết bị của bạn!', 'success');
        }
    }

    // Handle incoming URL action (?action=add_transaction)
    function handleUrlActionCheck() {
        if (state.hasCheckedUrlAction) return;
        state.hasCheckedUrlAction = true;

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'add_transaction') {
            setTimeout(() => {
                const addBtn = document.getElementById('btn-open-add-modal') || 
                               document.querySelector('.btn-add-transaction') ||
                               document.getElementById('mobile-nav-add');
                if (addBtn) {
                    addBtn.click();
                } else if (typeof window.openAddModal === 'function') {
                    window.openAddModal('expense');
                }
                // Clean URL without refresh
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 600);
        }
    }

    function handleNotificationActionRedirect() {
        const addBtn = document.getElementById('btn-open-add-modal') || 
                       document.getElementById('mobile-nav-add');
        if (addBtn) addBtn.click();
    }

    // Synchronize settings with server & local storage
    function updateSettings(newSettings) {
        if (typeof newSettings.enabled === 'boolean') state.enabled = newSettings.enabled;
        if (newSettings.time) state.time = newSettings.time;
        if (typeof newSettings.onlyIfNoExpenses === 'boolean') state.onlyIfNoExpenses = newSettings.onlyIfNoExpenses;

        try {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({
                enabled: state.enabled,
                time: state.time,
                onlyIfNoExpenses: state.onlyIfNoExpenses
            }));
        } catch (e) {
            console.warn('Could not save notification settings to localStorage:', e);
        }

        updateUIStatus();
    }

    // Update UI elements in Dashboard Settings dropdown
    function updateUIStatus() {
        const perm = getPermissionStatus();

        // 1. Permission badge in subpanel
        const permBadge = document.getElementById('badge-app-notif-perm');
        const permReqBtn = document.getElementById('btn-request-app-notif-perm');
        if (permBadge) {
            if (perm === 'granted') {
                permBadge.textContent = 'Đã cấp quyền hệ thống';
                permBadge.className = 'notif-perm-badge granted';
                if (permReqBtn) permReqBtn.style.display = 'none';
            } else if (perm === 'denied') {
                permBadge.textContent = 'Đã bị từ chối';
                permBadge.className = 'notif-perm-badge denied';
                if (permReqBtn) {
                    permReqBtn.style.display = 'inline-flex';
                    permReqBtn.textContent = 'Mở cài đặt quyền';
                }
            } else {
                permBadge.textContent = 'Chưa cấp quyền';
                permBadge.className = 'notif-perm-badge default';
                if (permReqBtn) {
                    permReqBtn.style.display = 'inline-flex';
                    permReqBtn.textContent = 'Cấp quyền thông báo';
                }
            }
        }

        // 2. Settings main list item badge & switch
        const mainBadge = document.getElementById('badge-app-notif-status');
        const mainToggle = document.getElementById('settings-app-notif-toggle');
        const subToggle = document.getElementById('settings-app-notif-active');
        const timeInput = document.getElementById('settings-app-notif-time');

        if (mainBadge) {
            mainBadge.textContent = state.enabled ? (state.time ? state.time.substring(0, 5) : 'Bật') : 'Tắt';
            mainBadge.style.color = state.enabled ? 'var(--accent-color)' : 'var(--text-secondary)';
        }
        if (mainToggle) {
            mainToggle.checked = state.enabled;
        }
        if (subToggle) {
            subToggle.checked = state.enabled;
        }
        if (timeInput && !timeInput.matches(':focus')) {
            timeInput.value = state.time ? state.time.substring(0, 5) : '20:00';
        }
    }

    // Bind event listeners on dashboard elements
    function bindDOMEvents() {
        // Menu item click opens sub-panel
        const menuItem = document.getElementById('menu-item-app-notifications');
        if (menuItem) {
            menuItem.addEventListener('click', (e) => {
                if (e.target.closest('.switch') || e.target.id === 'settings-app-notif-toggle') {
                    return; // Let toggle handler process
                }
                if (typeof window.openSubPanel === 'function') {
                    window.openSubPanel('app-notifications');
                }
            });
        }

        // Quick toggle switch on main settings row
        const mainToggle = document.getElementById('settings-app-notif-toggle');
        if (mainToggle) {
            mainToggle.addEventListener('change', async (e) => {
                const willEnable = e.target.checked;
                if (willEnable && getPermissionStatus() !== 'granted') {
                    const res = await requestPermission();
                    if (res !== 'granted') {
                        e.target.checked = false;
                        return;
                    }
                }
                updateSettings({ enabled: willEnable });
                syncSettingsToServer();
            });
        }

        // Permission request button in sub-panel
        const permReqBtn = document.getElementById('btn-request-app-notif-perm');
        if (permReqBtn) {
            permReqBtn.addEventListener('click', async () => {
                await requestPermission();
            });
        }

        // Test notification button
        const testBtn = document.getElementById('btn-test-app-notification');
        if (testBtn) {
            testBtn.addEventListener('click', async () => {
                testBtn.disabled = true;
                const oldHtml = testBtn.innerHTML;
                testBtn.innerHTML = '<span class="spinner-inline"></span> Đang gửi...';
                try {
                    await sendTestNotification();
                } finally {
                    testBtn.disabled = false;
                    testBtn.innerHTML = oldHtml;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            });
        }

        // Sub-panel form submit
        const form = document.getElementById('form-app-notification-settings');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const subToggle = document.getElementById('settings-app-notif-active');
                const timeInput = document.getElementById('settings-app-notif-time');

                const enabled = subToggle ? subToggle.checked : state.enabled;
                const time = timeInput && timeInput.value ? timeInput.value : state.time;

                updateSettings({ enabled, time });
                syncSettingsToServer(true);
            });
        }

        // Close sub-panel button
        const btnClose = document.getElementById('btn-close-app-notif-sub');
        if (btnClose && typeof window.closeSettingsDropdown === 'function') {
            btnClose.addEventListener('click', window.closeSettingsDropdown);
        }
    }

    // Save notification settings to backend API
    async function syncSettingsToServer(showToastOnSuccess = false) {
        try {
            const payload = {
                app_notifications: state.enabled ? 1 : 0,
                reminder_time: state.time
            };

            const res = await fetch('/api/?action=save_notification_settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success && showToastOnSuccess && typeof showToast === 'function') {
                showToast('Đã lưu cài đặt thông báo ứng dụng thành công!', 'success');
            }
        } catch (err) {
            console.warn('Sync notification settings error:', err);
        }
    }

    // Initialize scheduler loops
    function startScheduler() {
        // Initial check
        checkScheduledReminder();

        // High precision interval (runs every 30 seconds)
        setInterval(checkScheduledReminder, 30000);

        // Resume triggers: when phone unlocks or user switches back to the app
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                checkScheduledReminder();
            }
        });
        window.addEventListener('focus', checkScheduledReminder);
        window.addEventListener('pageshow', checkScheduledReminder);
    }

    // DOM Ready bootstrap
    document.addEventListener('DOMContentLoaded', () => {
        bindDOMEvents();
        updateUIStatus();
        handleUrlActionCheck();
        startScheduler();
    });

    // Public API
    window.SpendMindAppNotification = {
        getState: () => ({ ...state }),
        getPermissionStatus,
        requestPermission,
        sendTestNotification,
        updateSettings,
        updateUIStatus,
        checkScheduledReminder
    };

})(window, document);
