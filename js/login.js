/**
 * SpendMindAI - Login Script (Backward-compatible wrapper delegating to auth.js)
 */
if (typeof handleLoginSubmit === 'undefined') {
    const script = document.createElement('script');
    script.src = 'js/auth.js';
    document.head.appendChild(script);
}
