/**
 * ==========================================================================
 * SPENDMINDAI - SKELETON COMPONENT LIBRARY (VANILLA JS ES6)
 * Reusable Atomic & Composite Skeleton Screen Helpers (Zero-CLS)
 * ==========================================================================
 */

(function (global) {
    'use strict';

    const SkeletonRenderer = {
        // --- 1. ATOMIC PRIMITIVES ---

        /**
         * Avatar: khối tròn kích thước w-10 h-10 (40px x 40px) hoặc custom
         */
        avatar(size = 40, className = '') {
            let sizeClass = 'skeleton-avatar';
            if (size <= 32) sizeClass = 'skeleton-avatar-sm';
            else if (size >= 56) sizeClass = 'skeleton-avatar-lg';

            return `<div class="skeleton-bone ${sizeClass} ${className}" aria-hidden="true"></div>`;
        },

        /**
         * Tiêu đề / Tên: khối chữ nhật bo góc, chiều rộng ~60% (hoặc 150px)
         */
        title(width = '60%', height = '18px', className = '') {
            return `<div class="skeleton-bone skeleton-title ${className}" style="width: ${width}; height: ${height};" aria-hidden="true"></div>`;
        },

        /**
         * Dòng chữ đơn / Single line
         */
        line(width = '100%', height = '14px', className = '') {
            return `<div class="skeleton-bone skeleton-line ${className}" style="width: ${width}; height: ${height};" aria-hidden="true"></div>`;
        },

        /**
         * Đoạn văn bản: 3 dòng, dòng cuối cùng ngắn hơn (khoảng 40-50% width)
         */
        paragraph(className = '') {
            return `
                <div class="skeleton-paragraph ${className}" aria-hidden="true">
                    <div class="skeleton-bone skeleton-line" style="width: 100%;"></div>
                    <div class="skeleton-bone skeleton-line" style="width: 82%;"></div>
                    <div class="skeleton-bone skeleton-line" style="width: 46%;"></div>
                </div>
            `;
        },

        /**
         * Khối thẻ / hình ảnh: Tỷ lệ khung hình 16:9 hoặc chiều cao cố định
         */
        media(aspectRatio = '16/9', height = null, className = '') {
            const style = height ? `height: ${height};` : `aspect-ratio: ${aspectRatio};`;
            return `<div class="skeleton-bone skeleton-media-box ${className}" style="${style}" aria-hidden="true"></div>`;
        },

        /**
         * Khối viên thuốc / Badge / Pill
         */
        pill(width = '76px', height = '26px', className = '') {
            return `<div class="skeleton-bone skeleton-pill ${className}" style="width: ${width}; height: ${height};" aria-hidden="true"></div>`;
        },

        /**
         * Nút bấm bo tròn
         */
        button(width = '100%', height = '40px', className = '') {
            return `<div class="skeleton-bone skeleton-btn ${className}" style="width: ${width}; height: ${height};" aria-hidden="true"></div>`;
        },

        // --- 2. COMPOSITE CARDS MATCHING REFERENCE IMAGE 1:1 ---

        /**
         * Card Loại 1: Media Card (Góc trên bên trái trong hình)
         * - Hình 16:9 phía trên
         * - Dòng tiêu đề ngắn + badge viên thuốc
         * - Đường phân cách (Divider)
         * - Đoạn văn bản 3 dòng (dòng cuối 46%)
         * - Nút bấm viên thuốc full width phía dưới
         */
        renderMediaCardSkeleton() {
            return `
                <div class="skeleton-card skeleton-card-media" aria-hidden="true">
                    <div class="skeleton-bone skeleton-media-16-9"></div>
                    <div class="media-row">
                        <div class="skeleton-bone skeleton-line" style="width: 38%; height: 16px;"></div>
                        <div class="skeleton-bone skeleton-pill" style="width: 90px; height: 28px;"></div>
                    </div>
                    <div class="skeleton-divider"></div>
                    <div class="skeleton-paragraph">
                        <div class="skeleton-bone skeleton-line"></div>
                        <div class="skeleton-bone skeleton-line"></div>
                        <div class="skeleton-bone skeleton-line"></div>
                    </div>
                    <div class="skeleton-bone skeleton-btn" style="height: 38px;"></div>
                </div>
            `;
        },

        /**
         * Card Loại 2: Profile / Feed Card (Chính giữa trong hình)
         * - Header: 2 dòng text + Avatar tròn w-10 h-10 bên phải
         * - Đường phân cách
         * - Khối nội dung / media lớn trung tâm
         */
        renderProfileCardSkeleton() {
            return `
                <div class="skeleton-card skeleton-card-profile" aria-hidden="true">
                    <div class="profile-header">
                        <div class="profile-header-info">
                            <div class="skeleton-bone skeleton-line" style="width: 80%; height: 16px;"></div>
                            <div class="skeleton-bone skeleton-line" style="width: 50%; height: 14px;"></div>
                        </div>
                        <div class="skeleton-bone skeleton-avatar"></div>
                    </div>
                    <div class="skeleton-divider"></div>
                    <div class="skeleton-bone profile-body" style="height: 240px;"></div>
                </div>
            `;
        },

        /**
         * Card Loại 3: Feature Banner Card (Góc trên bên phải trong hình)
         * - Badge viên thuốc trên đầu
         * - Khối nội dung lớn
         * - 2 dòng text bên dưới
         */
        renderFeatureCardSkeleton() {
            return `
                <div class="skeleton-card skeleton-card-feature" aria-hidden="true">
                    <div class="skeleton-bone skeleton-pill" style="width: 140px; height: 32px;"></div>
                    <div class="skeleton-bone" style="width: 100%; height: 140px; border-radius: var(--skeleton-radius-md);"></div>
                    <div class="skeleton-bone skeleton-line" style="width: 90%; height: 15px;"></div>
                    <div class="skeleton-bone skeleton-line" style="width: 55%; height: 14px;"></div>
                </div>
            `;
        },

        /**
         * Card Loại 4: Compact Horizontal Card (Góc dưới bên phải trong hình)
         * - Hình vuông bên trái
         * - 2 dòng text bên phải
         * - Nút bấm viên thuốc bên dưới
         */
        renderCompactCardSkeleton() {
            return `
                <div class="skeleton-card skeleton-card-compact" aria-hidden="true">
                    <div class="compact-top">
                        <div class="skeleton-bone skeleton-media-thumb"></div>
                        <div class="compact-info">
                            <div class="skeleton-bone skeleton-line" style="width: 90%; height: 15px;"></div>
                            <div class="skeleton-bone skeleton-line" style="width: 60%; height: 13px;"></div>
                        </div>
                    </div>
                    <div class="skeleton-divider"></div>
                    <div style="display: flex; justify-content: flex-end;">
                        <div class="skeleton-bone skeleton-pill" style="width: 110px; height: 32px;"></div>
                    </div>
                </div>
            `;
        },

        // --- 3. SPENDMINDAI DOMAIN COMPONENTS (1:1 ZERO-CLS MATCHING) ---

        /**
         * <FeedItemSkeleton />: Khớp 1:1 với .daily-item
         * Avatar 40x40, Tiêu đề 55%, Dòng mô tả 40%, Số tiền pill bên phải
         */
        renderFeedItemSkeleton() {
            return `
                <div class="skeleton-daily-item" aria-hidden="true">
                    <div class="skeleton-daily-left">
                        <div class="skeleton-bone skeleton-avatar"></div>
                        <div class="skeleton-daily-info">
                            <div class="skeleton-bone skeleton-daily-title"></div>
                            <div class="skeleton-bone skeleton-daily-desc"></div>
                        </div>
                    </div>
                    <div class="skeleton-daily-right">
                        <div class="skeleton-bone skeleton-daily-amount"></div>
                    </div>
                </div>
            `;
        },

        /**
         * Render danh sách Feed Items lặp lại (3 đến 5 items theo yêu cầu)
         */
        renderFeedListSkeleton(count = 5) {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += this.renderFeedItemSkeleton();
            }
            return html;
        },

        /**
         * Skeleton Thẻ số dư khả dụng (Balance Card)
         */
        renderBalanceCardSkeleton() {
            return `
                <div class="skeleton-balance-row" aria-hidden="true">
                    <div class="skeleton-bone skeleton-balance-label"></div>
                    <div class="skeleton-bone skeleton-balance-amount"></div>
                    <div class="skeleton-indicators-row">
                        <div class="skeleton-indicator-box">
                            <div class="skeleton-bone skeleton-avatar-sm"></div>
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                                <div class="skeleton-bone skeleton-line" style="width: 55px; height: 12px;"></div>
                                <div class="skeleton-bone skeleton-line" style="width: 85px; height: 16px;"></div>
                            </div>
                        </div>
                        <div class="skeleton-indicator-box">
                            <div class="skeleton-bone skeleton-avatar-sm"></div>
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                                <div class="skeleton-bone skeleton-line" style="width: 55px; height: 12px;"></div>
                                <div class="skeleton-bone skeleton-line" style="width: 85px; height: 16px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        /**
         * Skeleton Lưới Lịch 35 ô ngày
         */
        renderCalendarGridSkeleton(count = 35) {
            let html = '';
            for (let i = 1; i <= count; i++) {
                const hasBadge = (i % 3 === 0 || i % 5 === 0);
                html += `
                    <div class="skeleton-calendar-cell" aria-hidden="true">
                        <div class="skeleton-bone skeleton-cell-day"></div>
                        ${hasBadge ? '<div class="skeleton-bone skeleton-cell-badge"></div>' : ''}
                    </div>
                `;
            }
            return html;
        },

        /**
         * Skeleton Danh sách hạn mức ngân sách (3 items)
         */
        renderBudgetListSkeleton(count = 3) {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-budget-item" aria-hidden="true">
                        <div class="skeleton-budget-header">
                            <div class="skeleton-bone skeleton-budget-name"></div>
                            <div class="skeleton-budget-meta">
                                <div class="skeleton-bone skeleton-pill" style="width: 65px; height: 22px;"></div>
                                <div class="skeleton-bone skeleton-line" style="width: 95px; height: 14px;"></div>
                            </div>
                        </div>
                        <div class="skeleton-bone skeleton-budget-bar"></div>
                    </div>
                `;
            }
            return html;
        },

        /**
         * Skeleton Tin nhắn Chatbot AI (Avatar + 3 dòng văn bản)
         */
        renderChatbotMessageSkeleton() {
            return `
                <div class="skeleton-chat-message" aria-hidden="true">
                    <div class="skeleton-bone skeleton-avatar-sm"></div>
                    <div class="skeleton-chat-content">
                        <div class="skeleton-bone skeleton-chat-author"></div>
                        <div class="skeleton-paragraph">
                            <div class="skeleton-bone skeleton-line" style="width: 100%;"></div>
                            <div class="skeleton-bone skeleton-line" style="width: 82%;"></div>
                            <div class="skeleton-bone skeleton-line" style="width: 46%;"></div>
                        </div>
                    </div>
                </div>
            `;
        },

        /**
         * Skeleton Biểu đồ (Pie / Trend)
         */
        renderChartCardSkeleton() {
            return `
                <div class="skeleton-chart-box" aria-hidden="true">
                    <div class="skeleton-bone skeleton-avatar-lg" style="margin-bottom: 8px;"></div>
                    <div class="skeleton-bone skeleton-line" style="width: 140px; height: 14px;"></div>
                    <div class="skeleton-bone skeleton-line" style="width: 90px; height: 12px;"></div>
                </div>
            `;
        },

        // --- 4. STATE MANAGEMENT HELPERS ---

        /**
         * Gắn skeleton HTML vào DOM element
         */
        mount(elementOrId, skeletonHtml) {
            const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
            if (el) {
                el.dataset.skeletonActive = 'true';
                el.innerHTML = skeletonHtml;
            }
        },

        /**
         * Xóa skeleton HTML khỏi DOM element
         */
        unmount(elementOrId) {
            const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
            if (el && el.dataset.skeletonActive === 'true') {
                delete el.dataset.skeletonActive;
                el.innerHTML = '';
            }
        }
    };

    // Expose globally
    global.SkeletonRenderer = SkeletonRenderer;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SkeletonRenderer;
    }
})(typeof window !== 'undefined' ? window : this);
