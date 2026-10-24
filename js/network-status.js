/**
 * ==========================================================================
 * SPENDMINDAI - NETWORK STATUS & OFFLINE RESILIENCE MANAGER
 * Detects offline state, prevents refresh/redirect loops, displays Apple
 * frosted glass banner, and auto-reloads when connection is restored.
 * ==========================================================================
 */

(function () {
    'use strict';

    let isOffline = !navigator.onLine;
    let bannerElement = null;
    let autoReloadTimeout = null;

    // --- 1. CREATE OFFLINE BANNER DOM ---
    function ensureBannerDom() {
        if (bannerElement) return bannerElement;

        let el = document.getElementById('offline-network-banner');
        if (el) {
            bannerElement = el;
            return bannerElement;
        }

        el = document.createElement('div');
        el.id = 'offline-network-banner';
        el.className = 'offline-banner';
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');

        el.innerHTML = `
            <div class="offline-banner-content">
                <div class="offline-status-icon">
                    <span class="offline-pulse-dot"></span>
                    <i data-lucide="wifi-off" class="icon-offline"></i>
                    <i data-lucide="wifi" class="icon-online hidden"></i>
                </div>
                <div class="offline-banner-text">
                    <strong class="offline-title">Mất kết nối mạng</strong>
                    <span class="offline-desc">Dữ liệu sẽ tự động đồng bộ khi có kết nối trở lại.</span>
                </div>
                <button type="button" class="btn-offline-retry" id="btn-offline-retry" title="Kiểm tra kết nối lại">
                    <i data-lucide="refresh-cw"></i>
                    <span>Thử lại</span>
                </button>
            </div>
        `;

        document.body.appendChild(el);
        bannerElement = el;

        const retryBtn = el.querySelector('#btn-offline-retry');
        if (retryBtn) {
            retryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                checkConnectionManual(true);
            });
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons({ root: el });
        }

        return bannerElement;
    }

    // --- 2. SHOW / HIDE BANNER WITH APPLE SPRING ANIMATIONS ---
    function showOfflineBanner() {
        const banner = ensureBannerDom();
        if (!banner) return;

        banner.classList.remove('is-online');
        banner.classList.add('is-offline', 'show');

        const titleEl = banner.querySelector('.offline-title');
        const descEl = banner.querySelector('.offline-desc');
        const iconOffline = banner.querySelector('.icon-offline');
        const iconOnline = banner.querySelector('.icon-online');

        if (titleEl) titleEl.textContent = 'Mất kết nối mạng';
        if (descEl) descEl.textContent = 'Vui lòng kiểm tra Internet. Trang sẽ tự động tải lại khi có mạng.';
        if (iconOffline) iconOffline.classList.remove('hidden');
        if (iconOnline) iconOnline.classList.add('hidden');

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons({ root: banner });
        }
    }

    function showOnlineBannerAndReload() {
        const banner = ensureBannerDom();
        if (!banner) {
            window.location.reload();
            return;
        }

        banner.classList.remove('is-offline');
        banner.classList.add('is-online', 'show');

        const titleEl = banner.querySelector('.offline-title');
        const descEl = banner.querySelector('.offline-desc');
        const iconOffline = banner.querySelector('.icon-offline');
        const iconOnline = banner.querySelector('.icon-online');

        if (titleEl) titleEl.textContent = 'Đã kết nối Internet!';
        if (descEl) descEl.textContent = 'Đang tự động làm mới và cập nhật dữ liệu...';
        if (iconOffline) iconOffline.classList.add('hidden');
        if (iconOnline) iconOnline.classList.remove('hidden');

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons({ root: banner });
        }

        // Graceful delay before auto-reload to let network socket stabilize
        if (autoReloadTimeout) clearTimeout(autoReloadTimeout);
        autoReloadTimeout = setTimeout(() => {
            window.location.reload();
        }, 750);
    }

    function hideBanner() {
        if (bannerElement) {
            bannerElement.classList.remove('show', 'is-offline', 'is-online');
        }
    }

    // --- 3. MANUAL / PERIODIC CONNECTIVITY CHECK ---
    async function checkConnectionManual(showFeedback = false) {
        const retryBtn = document.getElementById('btn-offline-retry');
        if (retryBtn) {
            retryBtn.classList.add('spinning');
            retryBtn.disabled = true;
        }

        try {
            // Lightweight ping with cache-busting HEAD request to verify true internet
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            const res = await fetch(`/favicon.ico?_ping=${Date.now()}`, {
                method: 'HEAD',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok || res.status === 304 || res.type === 'opaque') {
                isOffline = false;
                showOnlineBannerAndReload();
                return true;
            }
        } catch (e) {
            // Still offline
        } finally {
            if (retryBtn) {
                setTimeout(() => {
                    retryBtn.classList.remove('spinning');
                    retryBtn.disabled = false;
                }, 400);
            }
        }

        if (showFeedback && typeof showToast === 'function') {
            showToast('Vẫn chưa có kết nối Internet. Vui lòng kiểm tra lại Wifi/4G.', 'warning');
        }
        return false;
    }

    // --- 4. GLOBAL NETWORK EVENT LISTENERS ---
    window.addEventListener('offline', () => {
        isOffline = true;
        showOfflineBanner();
    });

    window.addEventListener('online', () => {
        isOffline = false;
        // Verify with quick ping before reloading to prevent false flaps
        checkConnectionManual(false).then((connected) => {
            if (!connected) {
                // If ping failed despite 'online' event, remain in offline state
                isOffline = true;
                showOfflineBanner();
            }
        });
    });

    // Check on initial load
    document.addEventListener('DOMContentLoaded', () => {
        if (!navigator.onLine) {
            isOffline = true;
            showOfflineBanner();
        }
    });

    // Expose helpers globally
    window.NetworkStatus = {
        isOffline: () => isOffline || !navigator.onLine,
        showOfflineBanner,
        showOnlineBannerAndReload,
        checkConnection: checkConnectionManual
    };
})();
