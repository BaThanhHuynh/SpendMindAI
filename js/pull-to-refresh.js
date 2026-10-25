/**
 * ==========================================================================
 * SPENDMINDAI - PULL TO REFRESH & DESKTOP LOGO RELOAD
 * Smooth native Apple iOS / Android pull-down gesture to reload page,
 * and desktop click-to-reload on brand logo.
 * ==========================================================================
 */

(function () {
    'use strict';

    let startY = 0;
    let startX = 0;
    let isPulling = false;
    let isRefreshing = false;
    let pullDistance = 0;
    const PULL_THRESHOLD = 68; // px to trigger reload
    const MAX_PULL = 115;      // max damped drag distance

    let indicator = null;
    let icon = null;
    let appContainer = null;

    function initPullToRefresh() {
        indicator = document.getElementById('pull-to-refresh-indicator');
        if (!indicator) return;

        icon = indicator.querySelector('.ptr-icon');
        appContainer = document.getElementById('app-dashboard') || document.querySelector('.landing-wrapper');

        // Listen on window with passive: false for touchmove to prevent native rubber-banding conflict
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        window.addEventListener('touchcancel', onTouchCancel, { passive: true });
    }

    function isModalOrPanelOpen() {
        return (
            document.body.classList.contains('modal-open') ||
            document.body.classList.contains('chatbot-open') ||
            document.body.classList.contains('settings-open') ||
            document.body.classList.contains('popover-open') ||
            document.querySelector('.modal-overlay:not(.hidden)') !== null
        );
    }

    function onTouchStart(e) {
        if (isRefreshing || isModalOrPanelOpen()) return;

        // Must be at the very top of the page
        const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        if (scrollY > 4) return;

        if (e.touches && e.touches.length === 1) {
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
            isPulling = false;
            pullDistance = 0;
        }
    }

    function onTouchMove(e) {
        if (isRefreshing || !e.touches || e.touches.length !== 1) return;

        const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const diffY = currentY - startY;
        const diffX = currentX - startX;

        // If user scrolled down from top, abort pull
        if (scrollY > 4) {
            if (isPulling) cancelPull();
            return;
        }

        // Detect downward drag at top (vertical dominance)
        if (!isPulling) {
            if (diffY > 8 && Math.abs(diffY) > Math.abs(diffX) * 1.5 && scrollY <= 0) {
                isPulling = true;
            }
        }

        if (isPulling) {
            if (diffY > 0) {
                // Prevent native browser bounce interference
                if (e.cancelable) {
                    e.preventDefault();
                }

                // Damped logarithmic pull curve (Apple iOS spring physics)
                pullDistance = Math.min(MAX_PULL, Math.pow(diffY, 0.82) * 1.6);

                applyPullStyles(pullDistance);
            } else {
                cancelPull();
            }
        }
    }

    function applyPullStyles(dist) {
        if (!indicator) return;

        // Indicator moves down
        indicator.style.transition = 'none';
        indicator.style.transform = `translate3d(-50%, ${dist - 48}px, 0)`;

        // Icon rotates clockwise as pulled down (0deg -> 360deg)
        const rotation = Math.min(360, (dist / PULL_THRESHOLD) * 360);
        if (icon) {
            icon.style.transition = 'none';
            icon.style.transform = `rotate(${rotation}deg)`;
        }

        // Subtly pull down the main dashboard view for native physical elasticity
        if (appContainer) {
            appContainer.style.transition = 'none';
            appContainer.style.transform = `translate3d(0, ${dist * 0.72}px, 0)`;
        }

        // State indicator: glow / ready
        if (dist >= PULL_THRESHOLD) {
            if (!indicator.classList.contains('is-ready')) {
                indicator.classList.add('is-ready');
                if (navigator.vibrate) {
                    try { navigator.vibrate(12); } catch (err) {}
                }
            }
        } else {
            indicator.classList.remove('is-ready');
        }
    }

    function onTouchEnd() {
        if (!isPulling || isRefreshing) return;
        isPulling = false;

        if (pullDistance >= PULL_THRESHOLD) {
            triggerRefresh();
        } else {
            cancelPull();
        }
    }

    function onTouchCancel() {
        if (isPulling && !isRefreshing) {
            cancelPull();
        }
    }

    function triggerRefresh() {
        isRefreshing = true;

        if (indicator) {
            indicator.classList.remove('is-ready');
            indicator.classList.add('is-refreshing');
            indicator.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
            indicator.style.transform = 'translate3d(-50%, 18px, 0)';
        }

        if (appContainer) {
            appContainer.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
            appContainer.style.transform = 'translate3d(0, 52px, 0)';
        }

        // Haptic tap
        if (navigator.vibrate) {
            try { navigator.vibrate([15, 40, 15]); } catch (e) {}
        }

        // Perform clean reload after brief feedback so the user sees the spin
        setTimeout(() => {
            window.location.reload();
        }, 320);
    }

    function cancelPull() {
        isPulling = false;
        pullDistance = 0;

        if (indicator) {
            indicator.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
            indicator.style.transform = 'translate3d(-50%, -64px, 0)';
            indicator.classList.remove('is-ready', 'is-refreshing');
        }

        if (appContainer) {
            appContainer.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
            appContainer.style.transform = 'translate3d(0, 0, 0)';
            setTimeout(() => {
                if (!isPulling && !isRefreshing && appContainer) {
                    appContainer.style.removeProperty('transform');
                    appContainer.style.removeProperty('transition');
                }
            }, 360);
        }
    }

    // --- 2. DESKTOP LOGO RELOAD ---
    function initDesktopLogoReload() {
        const logoArea = document.querySelector('.logo-area') || document.querySelector('.landing-logo');
        if (!logoArea) return;

        logoArea.setAttribute('title', 'Nhấn để làm mới trang (Reload)');

        logoArea.addEventListener('click', (e) => {
            // In desktop mode (or clicking the logo icon directly)
            const isDesktop = window.innerWidth > 768;
            const clickedIcon = e.target.closest('.logo-icon') || e.target.closest('.logo-icon-sm');

            if (isDesktop || clickedIcon) {
                e.preventDefault();
                const iconEl = logoArea.querySelector('.logo-icon') || logoArea.querySelector('.logo-icon-sm') || logoArea;
                if (iconEl) {
                    iconEl.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
                    iconEl.style.transform = 'rotate(360deg) scale(0.92)';
                }
                setTimeout(() => {
                    window.location.reload();
                }, 200);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initPullToRefresh();
        initDesktopLogoReload();
    });
})();
