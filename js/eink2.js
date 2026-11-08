// ==UserScript==
// @name         E-ink 阅读加深（纯白保持纯白·黑字不发肿）
// @namespace    eink
// @version      2.1
// @description  自定义色调曲线：暗部≈原样(黑字不加粗)，浅灰/浅色才压暗，纯白保持绝对白；图片/视频反向补偿（同时抵消 EinkTool 的加深 k）。document-start 注入防闪烁。
// @author       vwen
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ===== 色调曲线（可调）=====
       9 个点 = 输入亮度 0/0.125/.../1 时的「输出亮度」。
       - 前段保持≈对角线(0,0.125,0.25)：暗部和黑字边缘不动 → 黑字不发肿
       - 中后段低于对角线：浅灰/浅色被压暗 → 这就是你喜欢的效果
       - 末尾必须是 1：纯白保持纯白
       想更暗：把中间几个数(0.33~0.75)调小；想更轻：调大。必须单调递增。 */
    const CURVE = [0, 0.11, 0.20, 0.26, 0.31, 0.36, 0.42, 0.52, 1];//[0, 0.06, 0.1, 0.14, 0.18, 0.22, 0.28, 0.42, 1];//[0, 0.02, 0.10, 0.17, 0.23, 0.31, 0.42, 0.58, 1];//[0, 0.12, 0.20, 0.27, 0.33, 0.41, 0.52, 0.68, 1];

    const KEEP_MEDIA = true; // true=图片/视频/canvas 反向补偿，保持原亮度不被压暗

    // EinkTool 给浏览器设的加深 k（out = 1 - k(1-in)），图片/视频顺带抵消掉；1 = 没开加深
    const EINKTOOL_K = 1.5;

    // 由正向曲线自动算出逆曲线（在均匀 y 上重采样），改 CURVE 时无需手动维护
    function invert(fwd, n) {
        const m = fwd.length - 1, out = [];
        for (let i = 0; i <= n; i++) {
            const y = i / n;
            let k = 0;
            while (k < m && fwd[k + 1] < y) k++;
            const y0 = fwd[k], y1 = fwd[k + 1];
            const t = y1 > y0 ? (y - y0) / (y1 - y0) : 0;
            out.push(+(k / m + t / m).toFixed(4));
        }
        return out;
    }

    const fwd = CURVE.join(' ');
    const inv = invert(CURVE, 16).join(' ');

    const filter = (id, vals) =>
        `<filter id='${id}' color-interpolation-filters='sRGB'><feComponentTransfer>` +
        `<feFuncR type='table' tableValues='${vals}'/>` +
        `<feFuncG type='table' tableValues='${vals}'/>` +
        `<feFuncB type='table' tableValues='${vals}'/>` +
        `</feComponentTransfer></filter>`;

    // EinkTool 加深的逆变换：y = x/k + (1 - 1/k)，经过 1 - k(1-y) 后还原为 x
    const slope = (1 / EINKTOOL_K).toFixed(4);
    const intercept = (1 - 1 / EINKTOOL_K).toFixed(4);
    const undoK =
        `<filter id='k' color-interpolation-filters='sRGB'><feComponentTransfer>` +
        ['R', 'G', 'B'].map(c => `<feFunc${c} type='linear' slope='${slope}' intercept='${intercept}'/>`).join('') +
        `</feComponentTransfer></filter>`;

    const svg = `<svg xmlns='http://www.w3.org/2000/svg'>${filter('d', fwd)}${filter('r', inv)}${undoK}</svg>`;
    const uri = 'data:image/svg+xml,' + svg.replace(/</g, '%3C').replace(/>/g, '%3E');

    // 图片显示时先过页面曲线(#d)、再过 EinkTool 的 k，所以补偿要反过来：先抵消 k(#k)，再抵消曲线(#r)。
    // 两个补偿必须写在同一个 filter 里：分成两条规则会互相覆盖，只剩一个生效
    const media = (EINKTOOL_K > 1 ? `url("${uri}#k") ` : '') + `url("${uri}#r")`;
    const css =
        `html{filter:url("${uri}#d")!important}` +
        (KEEP_MEDIA ? `img,video,canvas{filter:${media}!important}` : '');

    const style = document.createElement('style');
    style.id = 'eink-darken-style';
    style.textContent = css;
    document.documentElement.appendChild(style);
})();
