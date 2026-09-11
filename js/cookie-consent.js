/**
 * ==============================================================================
 * SPENDMINDAI - COOKIE CONSENT & PRIVACY PREFERENCES MODULE
 * ==============================================================================
 * Provides transparent user consent management (Essential, Functional, Analytics)
 * with zero third-party dependencies, accessible modal toggles, and reactive events.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'spendmind_cookie_consent';
    const CONSENT_VERSION = '1.0';

    const DEFAULT_CONSENT = {
        essential: true,    // Always true (Security, Session, CSRF)
        functional: true,   // UI Themes, quick accounts, filters
        analytics: false,   // Anonymous performance & error diagnostics
        version: CONSENT_VERSION,
        timestamp: new Date().toISOString()
    };

    function getStoredConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' && parsed !== null && parsed.version === CONSENT_VERSION) {
                return parsed;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function saveConsent(consentData) {
        const payload = {
            essential: true,
            functional: Boolean(consentData.functional),
            analytics: Boolean(consentData.analytics),
            version: CONSENT_VERSION,
            timestamp: new Date().toISOString()
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('SpendMindAI Cookie: Unable to save to localStorage', e);
        }

        // If user disabled functional cookies, clear optional saved account list
        if (!payload.functional) {
            try {
                localStorage.removeItem('google_accounts_list');
            } catch (e) {}
        }

        // Dispatch reactive event for application listeners
        window.dispatchEvent(new CustomEvent('spendmind:cookie-consent-updated', { detail: payload }));

        hideBanner();
        closeModal();

        showToastNotification('Đã lưu tùy chọn cookie thành công!');
        return payload;
    }

    function showToastNotification(msg) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, 'success');
            return;
        }

        const existingToast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-message');
        if (existingToast && toastMsg) {
            toastMsg.textContent = msg;
            existingToast.classList.add('show');
            setTimeout(() => existingToast.classList.remove('show'), 3000);
        }
    }

    // DOM Template Injection
    function injectCookieUI() {
        if (document.getElementById('spendmind-cookie-banner')) return;

        // 1. Consent Banner
        const banner = document.createElement('aside');
        banner.id = 'spendmind-cookie-banner';
        banner.className = 'spendmind-cookie-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Thông báo cookie');
        banner.innerHTML = `
            <div class="cookie-banner-content">
                <div class="cookie-banner-header">
                    <div class="cookie-banner-icon">
                        <i data-lucide="cookie"></i>
                    </div>
                    <h3 class="cookie-banner-title">Tùy chọn Cookie & Quyền riêng tư</h3>
                </div>
                <p class="cookie-banner-text">
                    SpendMindAI sử dụng cookie và bộ nhớ cục bộ cần thiết để duy trì phiên làm việc an toàn, lưu chủ đề hiển thị và nâng cao trải nghiệm quản lý tài chính của bạn.
                </p>
                <div class="cookie-banner-actions">
                    <button type="button" class="btn-cookie-customize" id="btn-cookie-open-modal">Tùy chỉnh</button>
                    <button type="button" class="btn-cookie-essential" id="btn-cookie-essential-only">Chỉ cần thiết</button>
                    <button type="button" class="btn-cookie-accept" id="btn-cookie-accept-all">Chấp nhận tất cả</button>
                </div>
            </div>
        `;
        document.body.appendChild(banner);

        // 2. Preferences Modal
        const overlay = document.createElement('div');
        overlay.id = 'spendmind-cookie-modal-overlay';
        overlay.className = 'spendmind-cookie-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'cookie-modal-title');
        overlay.innerHTML = `
            <div class="spendmind-cookie-modal card">
                <div class="cookie-modal-header">
                    <div class="cookie-modal-title-group">
                        <h3 id="cookie-modal-title">Cài đặt & Tùy chọn Cookie</h3>
                        <p>Kiểm soát cách SpendMindAI lưu trữ dữ liệu trên trình duyệt của bạn</p>
                    </div>
                    <button type="button" class="cookie-modal-close-btn" id="btn-close-cookie-modal" title="Đóng" aria-label="Đóng bảng tùy chọn">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="cookie-modal-body">
                    <!-- Category 1: Essential -->
                    <div class="cookie-category-card">
                        <div class="cookie-category-top">
                            <div class="cookie-category-info">
                                <div class="cookie-category-icon">
                                    <i data-lucide="shield-check"></i>
                                </div>
                                <span class="cookie-category-name">
                                    Cookie Bắt buộc
                                    <span class="cookie-badge-required">Luôn bật</span>
                                </span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" checked disabled aria-label="Cookie bắt buộc">
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <p class="cookie-category-desc">
                            Cần thiết để bảo mật phiên đăng nhập, chứng thực người dùng và phòng chống tấn công CSRF. Không thể tắt vì hệ thống không thể hoạt động an toàn nếu thiếu mục này.
                        </p>
                    </div>

                    <!-- Category 2: Functional / Preferences -->
                    <div class="cookie-category-card">
                        <div class="cookie-category-top">
                            <div class="cookie-category-info">
                                <div class="cookie-category-icon">
                                    <i data-lucide="palette"></i>
                                </div>
                                <span class="cookie-category-name">Cookie Chức năng & Giao diện</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cookie-toggle-functional" checked aria-label="Bật cookie chức năng">
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <p class="cookie-category-desc">
                            Ghi nhớ tùy chọn giao diện (chế độ Sáng / Tối / Tự động theo hệ thống), bộ lọc danh mục giao dịch và danh sách tài khoản Google để đăng nhập nhanh.
                        </p>
                    </div>

                    <!-- Category 3: Analytics & Performance -->
                    <div class="cookie-category-card">
                        <div class="cookie-category-top">
                            <div class="cookie-category-info">
                                <div class="cookie-category-icon">
                                    <i data-lucide="activity"></i>
                                </div>
                                <span class="cookie-category-name">Cookie Hiệu năng & Thống kê</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="cookie-toggle-analytics" aria-label="Bật cookie hiệu năng">
                                <span class="slider round"></span>
                            </label>
                        </div>
                        <p class="cookie-category-desc">
                            Thu thập số liệu hiệu năng phản hồi serverless và tần suất sử dụng tính năng một cách ẩn danh nhằm phát hiện lỗi và tối ưu hóa trải nghiệm ứng dụng.
                        </p>
                    </div>
                </div>
                <div class="cookie-modal-footer">
                    <button type="button" class="btn-cookie-essential" id="btn-modal-cookie-essential">Chỉ cần thiết</button>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn-cookie-essential" id="btn-modal-save-choices">Lưu tùy chọn</button>
                        <button type="button" class="btn-cookie-accept" id="btn-modal-accept-all">Chấp nhận tất cả</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Bind interactive events
        bindCookieEvents();

        // Refresh icons if lucide is available
        if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function showBanner() {
        const banner = document.getElementById('spendmind-cookie-banner');
        if (banner) {
            banner.classList.add('show');
        }
    }

    function hideBanner() {
        const banner = document.getElementById('spendmind-cookie-banner');
        if (banner) {
            banner.classList.remove('show');
        }
    }

    function openModal() {
        const overlay = document.getElementById('spendmind-cookie-modal-overlay');
        if (!overlay) {
            injectCookieUI();
        }
        const current = getStoredConsent() || DEFAULT_CONSENT;
        const functionalToggle = document.getElementById('cookie-toggle-functional');
        const analyticsToggle = document.getElementById('cookie-toggle-analytics');

        if (functionalToggle) functionalToggle.checked = Boolean(current.functional);
        if (analyticsToggle) analyticsToggle.checked = Boolean(current.analytics);

        const targetOverlay = document.getElementById('spendmind-cookie-modal-overlay');
        if (targetOverlay) {
            targetOverlay.classList.add('show');
            // Focus close button for accessibility
            const closeBtn = document.getElementById('btn-close-cookie-modal');
            if (closeBtn) closeBtn.focus();
        }
    }

    function closeModal() {
        const overlay = document.getElementById('spendmind-cookie-modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }

    function bindCookieEvents() {
        // Banner events
        const btnAcceptAll = document.getElementById('btn-cookie-accept-all');
        if (btnAcceptAll) {
            btnAcceptAll.addEventListener('click', () => {
                saveConsent({ functional: true, analytics: true });
            });
        }

        const btnEssential = document.getElementById('btn-cookie-essential-only');
        if (btnEssential) {
            btnEssential.addEventListener('click', () => {
                saveConsent({ functional: false, analytics: false });
            });
        }

        const btnCustomize = document.getElementById('btn-cookie-open-modal');
        if (btnCustomize) {
            btnCustomize.addEventListener('click', () => {
                openModal();
            });
        }

        // Modal events
        const btnClose = document.getElementById('btn-close-cookie-modal');
        if (btnClose) {
            btnClose.addEventListener('click', closeModal);
        }

        const overlay = document.getElementById('spendmind-cookie-modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeModal();
            });
        }

        const btnModalSave = document.getElementById('btn-modal-save-choices');
        if (btnModalSave) {
            btnModalSave.addEventListener('click', () => {
                const functional = document.getElementById('cookie-toggle-functional')?.checked ?? true;
                const analytics = document.getElementById('cookie-toggle-analytics')?.checked ?? false;
                saveConsent({ functional, analytics });
            });
        }

        const btnModalAcceptAll = document.getElementById('btn-modal-accept-all');
        if (btnModalAcceptAll) {
            btnModalAcceptAll.addEventListener('click', () => {
                saveConsent({ functional: true, analytics: true });
            });
        }

        const btnModalEssential = document.getElementById('btn-modal-cookie-essential');
        if (btnModalEssential) {
            btnModalEssential.addEventListener('click', () => {
                saveConsent({ functional: false, analytics: false });
            });
        }

        // Keyboard navigation: ESC to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('spendmind-cookie-modal-overlay');
                if (modal && modal.classList.contains('show')) {
                    closeModal();
                }
            }
        });
    }

    // Attach to external triggers (like footer button or dashboard settings menu)
    function attachExternalTriggers() {
        const footerBtn = document.getElementById('open-cookie-settings-footer');
        if (footerBtn) {
            footerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openModal();
            });
        }

        const settingsMenuItem = document.getElementById('menu-item-cookies');
        if (settingsMenuItem) {
            settingsMenuItem.addEventListener('click', (e) => {
                e.preventDefault();
                // Close settings dropdown if function exists
                if (typeof window.closeSettingsDropdown === 'function') {
                    window.closeSettingsDropdown();
                }
                openModal();
            });
        }
    }

    // Initialization
    function init() {
        injectCookieUI();
        attachExternalTriggers();

        const stored = getStoredConsent();
        if (!stored) {
            // First time visitor: show banner after a gentle 800ms delay
            setTimeout(showBanner, 800);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    window.SpendMindCookie = {
        openPreferences: openModal,
        closePreferences: closeModal,
        getConsent: () => getStoredConsent() || { ...DEFAULT_CONSENT },
        hasConsent: (category) => {
            const consent = getStoredConsent() || DEFAULT_CONSENT;
            return Boolean(consent[category]);
        },
        acceptAll: () => saveConsent({ functional: true, analytics: true }),
        acceptEssentialOnly: () => saveConsent({ functional: false, analytics: false }),
        savePreferences: saveConsent
    };

})();
