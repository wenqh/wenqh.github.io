// ==UserScript==
// @name         E-ink 图片还原（抵消 EinkTool 加深）
// @namespace    eink
// @version      1.0
// @description  EinkTool 对整个浏览器做了加深（out = 1 - k(1-in)），这里对图片/视频/canvas 预先做逆变换，显示出来就是原亮度
// @author       vwen
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ===== 可调参数 =====
    const K = 1.5;          // 跟 EinkTool 里浏览器的加深 k 保持一致
    // 加深是在哪个颜色空间做的，没实测过，两种都给：
    // 'sRGB' = 直接按像素值算；'linearRGB' = 先转线性光再算（SurfaceFlinger 若在线性空间做矩阵就选这个）
    // 判断方法：找一张灰阶渐变图，对比 EinkTool 里 k=1.0 时的样子，选中间灰一致的那个
    const SPACE = 'sRGB';

    // 预补偿：y = x/k + (1 - 1/k)，经过 1 - k(1-y) 后还原为 x
    const slope = (1 / K).toFixed(4);
    const intercept = (1 - 1 / K).toFixed(4);

    const f = `<feFunc$ type='linear' slope='${slope}' intercept='${intercept}'/>`;
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg'>` +
        `<filter id='u' color-interpolation-filters='${SPACE}'><feComponentTransfer>` +
        ['R', 'G', 'B'].map(c => f.replace('$', c)).join('') +
        `</feComponentTransfer></filter></svg>`;
    const uri = 'data:image/svg+xml,' + svg.replace(/</g, '%3C').replace(/>/g, '%3E');

    const style = document.createElement('style');
    style.id = 'eink-undarken-media';
    style.textContent = `img,video,canvas,picture,svg image{filter:url("${uri}#u")!important}`;
    document.documentElement.appendChild(style);
})();
