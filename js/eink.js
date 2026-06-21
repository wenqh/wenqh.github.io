// ==UserScript==
// @name         E-ink 阅读加深（纯白保持纯白·黑字不发肿）
// @namespace    eink
// @version      2.0
// @description  自定义色调曲线：暗部≈原样(黑字不加粗)，浅灰/浅色才压暗，纯白保持绝对白；图片/视频反向补偿。document-start 注入防闪烁。
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
    //const CURVE = [0, 0.12, 0.20, 0.27, 0.33, 0.41, 0.52, 0.68, 1];
    
    // 第①档 狠：线条明显变黑，浅灰整体下沉
    //const CURVE = [0, 0.12, 0.22, 0.29, 0.35, 0.40, 0.47, 0.58, 1];

    // 第②档 更狠：浅灰线压到中灰，对比强（推荐先试）
    const CURVE = [0, 0.11, 0.20, 0.26, 0.31, 0.36, 0.42, 0.52, 1];

    // 第③档 最狠：接近白的浅线都拉成深灰，极限黑
    //const CURVE = [0, 0.11, 0.19, 0.24, 0.29, 0.33, 0.38, 0.46, 1];

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

    const svg = `<svg xmlns='http://www.w3.org/2000/svg'>${filter('d', fwd)}${filter('r', inv)}</svg>`;
    const uri = 'data:image/svg+xml,' + svg.replace(/</g, '%3C').replace(/>/g, '%3E');

    const css =
        `html{filter:url("${uri}#d")!important}` +
        (KEEP_MEDIA ? `img,video,canvas{filter:url("${uri}#r")!important}` : '');

    const style = document.createElement('style');
    style.id = 'eink-darken-style';
    style.textContent = css;
    document.documentElement.appendChild(style);
})();
// ==UserScript==
// @name         v1E-ink 阅读加深（纯白保持纯白）
// @namespace    eink
// @version      1.0
// @description  用 gamma 曲线压暗中间调与彩色，纯白背景保持绝对白；图片/视频反向补偿不被压暗。document-start 注入防闪烁。
// @author       wen
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ===== 可调参数 ===== */
    const GAMMA = 3;        // 压暗强度：1=无效果，2 适中，2.5 / 3 更狠，1.5 更轻
    const KEEP_MEDIA = true; // true=图片/视频/canvas 反向补偿，保持原亮度不被压暗
    /* ==================== */

    // 逆 gamma：(x^GAMMA)^(1/GAMMA) = x，用来把媒体还原回原始亮度
    const inv = (1 / GAMMA).toFixed(4);

    // out = in^exponent：纯白 1^n=1 不动，纯黑 0^n=0 不动，中间调全部下沉
    const filter = (id, exp) =>
        `<filter id='${id}' color-interpolation-filters='sRGB'>` +
        `<feComponentTransfer>` +
        `<feFuncR type='gamma' exponent='${exp}'/>` +
        `<feFuncG type='gamma' exponent='${exp}'/>` +
        `<feFuncB type='gamma' exponent='${exp}'/>` +
        `</feComponentTransfer></filter>`;

    // 把两个滤镜塞进同一张内联 SVG，做成 data URI（自包含，无需往 DOM 插 SVG 节点）
    const svg = `<svg xmlns='http://www.w3.org/2000/svg'>${filter('d', GAMMA)}${filter('r', inv)}</svg>`;
    const uri = 'data:image/svg+xml,' + svg.replace(/</g, '%3C').replace(/>/g, '%3E');

    const css =
        `html{filter:url("${uri}#d")!important}` +
        (KEEP_MEDIA ? `img,video,canvas{filter:url("${uri}#r")!important}` : '');

    // 尽早注入 <style>，避免页面先亮一下再变暗的闪烁
    const style = document.createElement('style');
    style.id = 'eink-darken-style';
    style.textContent = css;
    document.documentElement.appendChild(style);
})();
