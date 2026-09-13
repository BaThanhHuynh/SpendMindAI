/* ==========================================================================
   SPENDMINDAI - IN-APP & DEVICE NOTIFICATION MANAGER (ANDROID & IOS PWA)
   Full Web Push Protocol (RFC 8292 VAPID) + Local In-App Notification Engine
   Enables automated background notifications when screen is locked or app is closed.
   ========================================================================== */

(function (window, document) {
    'use strict';

    const STORAGE_KEY_SETTINGS = 'spendmind_app_notif_settings';
    const STORAGE_KEY_LAST_SENT = 'spendmind_last_app_notif_date';
    const DEFAULT_VAPID_PUBLIC_KEY = 'BMQjBm-Q8HdsZtTjxqhCrRja2-vW0HG8D66eYM6eI8znAs3dWCzVzSBqUc8xlMEx2_ygHCc3ALNlO9virV5wzPo';

    // State cache
    const state = {
        enabled: true,
        time: '20:00',
        onlyIfNoExpenses: true,
        isStandalone: false,
        isIOS: false,
        isPushSubscribed: false,
        hasCheckedUrlAction: false
    };

    // Helper: Convert VAPID base64url public key to Uint8Array for PushManager
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // Initialize detection of device and environment
    function initDetection() {
        // Detect standalone PWA mode (added to home screen)
        state.isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                             window.navigator.standalone === true ||
                             document.referrer.includes('android-app://');

        // Detect iOS (iPhone / iPad / iPod)
        state.isIOS = (/iPad|iPhone|iPod/.test(navigator.userAgent || '') || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && 
                      !window.MSStream;

        // Load cached settings
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

    // Check system permission status
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

        // Check iOS Safari limitation: iOS requires "Add to Home Screen" for Web Push
        if (state.isIOS && !state.isStandalone) {
            if (typeof showToast === 'function') {
                showToast('Trên iPhone/iPad: Vui lòng nhấn nút Chia sẻ ⎋ -> "Thêm vào MH chính" để nhận thông báo khi tắt màn hình!', 'warning');
            }
        }

        try {
            const result = await Notification.requestPermission();
            updateUIStatus();

            if (result === 'granted') {
                await subscribeDevicePush();
            }
            return result;
        } catch (err) {
            console.warn('Error requesting notification permission:', err);
            return 'denied';
        }
    }

    // Fetch VAPID public key from backend
    async function getVapidPublicKey() {
        try {
            const res = await fetch('/api/?action=get_vapid_public_key');
            const data = await res.json();
            if (data.success && data.publicKey) {
                return data.publicKey;
            }
        } catch (err) {
            console.warn('Could not fetch VAPID key from API, using default:', err);
        }
        return DEFAULT_VAPID_PUBLIC_KEY;
    }

    // Subscribe this device to Web Push (RFC 8292)
    async function subscribeDevicePush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('PushManager is not supported in this browser context.');
            return null;
        }

        try {
            const reg = await navigator.serviceWorker.ready;
            if (!reg || !reg.pushManager) return null;

            let subscription = await reg.pushManager.getSubscription();

            if (!subscription) {
                const vapidKey = await getVapidPublicKey();
                const convertedKey = urlBase64ToUint8Array(vapidKey);
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedKey
                });
            }

            if (subscription) {
                const subJson = subscription.toJSON();
                await fetch('/api/?action=save_push_subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        endpoint: subscription.endpoint,
                        p256dh: (subJson.keys && subJson.keys.p256dh) ? subJson.keys.p256dh : '',
                        auth: (subJson.keys && subJson.keys.auth) ? subJson.keys.auth : ''
                    })
                });

                state.isPushSubscribed = true;
                updateUIStatus();
                return subscription;
            }
        } catch (err) {
            console.warn('Could not subscribe to device push notifications:', err);
        }
        return null;
    }

    // Unsubscribe this device from Web Push
    async function unsubscribeDevicePush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        try {
            const reg = await navigator.serviceWorker.ready;
            if (!reg || !reg.pushManager) return;

            const subscription = await reg.pushManager.getSubscription();
            if (subscription) {
                const endpoint = subscription.endpoint;
                await subscription.unsubscribe();

                await fetch('/api/?action=remove_push_subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint })
                });
            }
            state.isPushSubscribed = false;
            updateUIStatus();
        } catch (err) {
            console.warn('Error unsubscribing device push:', err);
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

    // Client-side scheduler check (for active foreground session)
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
            if (state.onlyIfNoExpenses && hasExpensesRecordedToday()) {
                localStorage.setItem(STORAGE_KEY_LAST_SENT, todayStr);
                return;
            }

            if (getPermissionStatus() === 'granted') {
                showNotification('SpendMindAI - Nhắc nhở chi tiêu 🔔', {
                    body: 'Bạn chưa ghi chép chi tiêu hôm nay. Hãy dành 30 giây ghi lại để không sót khoản nào nhé!',
                    tag: 'spendmind-daily-reminder-' + todayStr
                });
                localStorage.setItem(STORAGE_KEY_LAST_SENT, todayStr);
            }
        }
    }

    // Trigger immediate test notification (sends via real Server Web Push + immediate client display)
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

        // Ensure subscription exists before test
        await subscribeDevicePush();

        // 1. Show immediate local feedback notification
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        await showNotification('SpendMindAI - Thông báo thử nghiệm ✨', {
            body: `Đã kích hoạt lúc ${timeStr}! Khóa màn hình hoặc thoát app để kiểm tra thông báo đẩy tự động.`,
            tag: 'spendmind-test-reminder',
            data: { url: '/dashboard.html?action=add_transaction' }
        });

        // 2. Dispatch real server-side Web Push to verify background delivery
        try {
            const pushRes = await fetch('/api/?action=test_app_push_notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const pushData = await pushRes.json();
            if (pushData.success) {
                if (typeof showToast === 'function') {
                    showToast(pushData.message || 'Đã gửi thông báo đẩy thử nghiệm tới thiết bị của bạn thành công!', 'success');
                }
            } else {
                if (typeof showToast === 'function') {
                    showToast(pushData.message || 'Đã kích hoạt thông báo cục bộ.', 'info');
                }
            }
        } catch (err) {
            console.warn('Server test push dispatch notice:', err);
            if (typeof showToast === 'function') {
                showToast('Đã kích hoạt thông báo thử nghiệm trên thiết bị!', 'success');
            }
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
    async function updateSettings(newSettings) {
        if (typeof newSettings.enabled === 'boolean') {
            state.enabled = newSettings.enabled;
            if (newSettings.enabled) {
                localStorage.removeItem(STORAGE_KEY_LAST_SENT);
            }
        }
        if (newSettings.time) {
            if (state.time !== newSettings.time) {
                // Reset last sent date so newly scheduled time can trigger today
                localStorage.removeItem(STORAGE_KEY_LAST_SENT);
            }
            state.time = newSettings.time;
        }
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
                permBadge.textContent = state.isPushSubscribed ? 'Web Push & Thiết bị: Đã kích hoạt' : 'Đã cấp quyền hệ thống';
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

        // iOS Specific Home Screen Guidance in subpanel
        const iosNote = document.getElementById('ios-pwa-guidance-note');
        if (iosNote) {
            if (state.isIOS && !state.isStandalone) {
                iosNote.style.display = 'block';
            } else {
                iosNote.style.display = 'none';
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
        const onlyEmptyInput = document.getElementById('settings-app-notif-only-empty');
        if (onlyEmptyInput) {
            onlyEmptyInput.checked = state.onlyIfNoExpenses;
        }
    }

    // Bind event listeners on dashboard elements
    function bindDOMEvents() {
        const menuItem = document.getElementById('menu-item-app-notifications');
        if (menuItem) {
            menuItem.addEventListener('click', (e) => {
                if (e.target.closest('.switch') || e.target.id === 'settings-app-notif-toggle') {
                    return;
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

                if (willEnable) {
                    await subscribeDevicePush();
                } else {
                    await unsubscribeDevicePush();
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
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const subToggle = document.getElementById('settings-app-notif-active');
                const timeInput = document.getElementById('settings-app-notif-time');
                const onlyEmptyInput = document.getElementById('settings-app-notif-only-empty');

                const enabled = subToggle ? subToggle.checked : state.enabled;
                const time = timeInput && timeInput.value ? timeInput.value : state.time;
                const onlyIfNoExpenses = onlyEmptyInput ? onlyEmptyInput.checked : state.onlyIfNoExpenses;

                if (enabled && getPermissionStatus() !== 'granted') {
                    const res = await requestPermission();
                    if (res !== 'granted') {
                        if (subToggle) subToggle.checked = false;
                        return;
                    }
                }

                if (enabled) {
                    await subscribeDevicePush();
                } else {
                    await unsubscribeDevicePush();
                }

                updateSettings({ enabled, time, onlyIfNoExpenses });
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

    // Verify existing subscription on startup
    async function checkExistingSubscription() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.pushManager) {
                const sub = await reg.pushManager.getSubscription();
                state.isPushSubscribed = !!sub;
                updateUIStatus();

                // If user has notification enabled and permission is granted, ensure backend is synced
                if (state.enabled && Notification.permission === 'granted' && !sub) {
                    await subscribeDevicePush();
                }
            }
        } catch (e) {
            console.warn('Check existing push subscription notice:', e);
        }
    }

    // Initialize scheduler loops
    function startScheduler() {
        checkScheduledReminder();
        setInterval(checkScheduledReminder, 30000);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                checkScheduledReminder();
                checkExistingSubscription();
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
        checkExistingSubscription();
        startScheduler();
    });

    // Public API
    window.SpendMindAppNotification = {
        getState: () => ({ ...state }),
        getPermissionStatus,
        requestPermission,
        subscribeDevicePush,
        unsubscribeDevicePush,
        sendTestNotification,
        updateSettings,
        updateUIStatus,
        checkScheduledReminder
    };

})(window, document);
