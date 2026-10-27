/**
 * ==========================================================================
 * SPENDMINDAI - SPRING PRESS (kiểu Apple: SwiftUI spring + SF Symbols .bounce)
 * Mọi phần tử bấm được: nhấn xuống thì lún nhẹ, thả tay thì bật về, vượt quá
 * cỡ một chút rồi lắng. Biểu tượng bên trong nảy kiểu SF Symbols.
 * Lò xo là mô phỏng vật lý thật, bị ngắt giữa chừng vẫn giữ vận tốc.
 * Web Animations với composite "add" cộng thêm scale vào transform sẵn có
 * (translate định vị, hover nhấc lên) thay vì ghi đè.
 * ==========================================================================
 */

(function () {
    'use strict';

    if (typeof KeyframeEffect !== 'function' || !('composite' in KeyframeEffect.prototype)) return;

    const STEP = 1000 / 60; // ms giữa hai khung mẫu
    // Tham số như SwiftUI .spring(response:bounce:): response tính bằng giây, bounce 0 = không nảy
    const PRESS = { response: 0.2, bounce: 0.1 };
    const RELEASE = { response: 0.45, bounce: 0.45 };
    const SYMBOL = { response: 0.5, bounce: 0.5 };
    const RELEASE_KICK = 20;  // vận tốc bật lên khi thả = độ lún × 20 → vượt quá cỡ ~36% độ lún
    const SYMBOL_KICK = 3.5;  // biểu tượng phồng tới ~1.15, chìm ~0.98 rồi lắng
    const TOUCH_DELAY = 80;   // ms chờ trước khi lún khi chạm, để vuốt cuộn không làm lún cả danh sách
    const TOUCH_SLOP = 10;    // px: kéo xa hơn thì coi là cuộn / vuốt, bỏ nhấn

    const PRESSABLE = 'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], ' +
        '[role="switch"], [role="checkbox"], [onclick], input[type="checkbox"], input[type="radio"], ' +
        'input[type="button"], input[type="submit"], input[type="reset"]';
    const NOT_PRESSABLE = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"]), ' +
        'textarea, select, [contenteditable="true"], [contenteditable=""], .progress-bar-bg';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const springs = new WeakMap(); // phần tử -> { anim, xs, vs }
    let active = null;             // lần nhấn đang giữ

    // Lò xo khối lượng 1 từ (x, v) về đích, tích phân 4 bước nhỏ mỗi khung; trả về vị trí / vận tốc từng khung
    function simulate(x, v, to, spring) {
        const k = (2 * Math.PI / spring.response) ** 2;
        const c = 4 * Math.PI * (1 - spring.bounce) / spring.response;
        const h = STEP / 4000;
        const xs = [x], vs = [v];
        while (xs.length < 2 || (xs.length < 120 && (Math.abs(x - to) > 1e-4 || Math.abs(v) > 1e-3))) {
            for (let i = 0; i < 4; i++) { v += (-k * (x - to) - c * v) * h; x += v * h; }
            xs.push(x); vs.push(v);
        }
        xs[xs.length - 1] = to;
        return { xs, vs };
    }

    function animate(el, to, spring, kick) {
        let x = 1, v = 0;
        const prev = springs.get(el);
        if (prev) { // nối tiếp từ đúng vị trí và vận tốc đang hiển thị
            const i = Math.min(prev.xs.length - 1, Math.floor((prev.anim.currentTime || 0) / STEP));
            x = prev.xs[i]; v = prev.vs[i];
            prev.anim.cancel();
        }
        const s = simulate(x, v + (kick || 0), to, spring);
        const anim = el.animate(s.xs.map(n => ({ transform: `scale(${n})` })), {
            duration: (s.xs.length - 1) * STEP, fill: 'forwards', composite: 'add'
        });
        springs.set(el, { anim, xs: s.xs, vs: s.vs });
        if (to === 1) anim.onfinish = () => {
            if (springs.get(el) && springs.get(el).anim === anim) { springs.delete(el); anim.cancel(); }
        };
    }

    function pressable(target) {
        if (!(target instanceof Element) || target.closest(NOT_PRESSABLE)) return null;
        let el = target.closest(PRESSABLE);
        // Ô / thẻ bấm được gắn sự kiện bằng JS: lấy phần tử ngoài cùng của chuỗi cursor: pointer
        if (!el) {
            for (let n = target; n && n !== document.body && getComputedStyle(n).cursor === 'pointer'; n = n.parentElement) el = n;
        }
        if (!el || el.matches(':disabled, [aria-disabled="true"]')) return null;
        const r = el.getBoundingClientRect();
        // Lớp phủ, khung lớn hơn nửa màn hình: không lún
        if (!r.width || r.width * r.height > window.innerWidth * window.innerHeight / 2) return null;
        // Lún ~5px theo cạnh dài: nút nhỏ 0.92, nút thường ~0.96, thẻ rộng 0.98
        return { el, depth: Math.min(0.08, Math.max(0.02, 5 / Math.max(r.width, r.height))) };
    }

    function press(p) {
        p.timer = 0;
        animate(p.el, 1 - p.depth, PRESS);
    }

    function letGo(p, tapped) {
        animate(p.el, 1, RELEASE, tapped ? p.depth * RELEASE_KICK : 0);
        if (!tapped) return;
        const icon = p.el.querySelector('svg, img');
        if (icon && icon.getBoundingClientRect().width <= 48) animate(icon, 1, SYMBOL, SYMBOL_KICK);
    }

    function finish(tapped) {
        const p = active;
        active = null;
        if (!p.timer) return letGo(p, tapped);
        clearTimeout(p.timer);
        if (!tapped) return;
        press(p); // chạm nhanh trước khi kịp lún: vẫn lún rồi bật, như iOS
        setTimeout(() => letGo(p, true), 90);
    }

    window.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.button > 0 || reduceMotion.matches) return;
        const found = pressable(e.target);
        if (!found) return;
        if (active) finish(false);
        const p = active = { el: found.el, depth: found.depth, id: e.pointerId, x: e.clientX, y: e.clientY, timer: 0 };
        if (e.pointerType === 'touch') p.timer = setTimeout(() => press(p), TOUCH_DELAY);
        else press(p);
    }, { capture: true, passive: true });

    window.addEventListener('pointermove', (e) => {
        if (active && e.pointerId === active.id &&
            Math.hypot(e.clientX - active.x, e.clientY - active.y) > TOUCH_SLOP) finish(false);
    }, { capture: true, passive: true });

    window.addEventListener('pointerup', (e) => {
        if (active && e.pointerId === active.id) finish(true);
    }, { capture: true, passive: true });

    window.addEventListener('pointercancel', (e) => {
        if (active && e.pointerId === active.id) finish(false);
    }, { capture: true, passive: true });
})();
