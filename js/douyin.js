// ==UserScript==
// @name         抖音
// @namespace    https://viayoo.com/
// @version      0.1
// @run-at       document-start
// @match        https://www.douyin.com/*
// @grant        none
// ==/UserScript==

(function () {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
        meta.setAttribute("content", meta.content.replace(/initial-scale=\d+(\.\d+)?/, "initial-scale=1"));
    }

    const css = `
            body {min-width: 100% !important}
            #1douyin-navigation {display: none}
            #slidelist div:first-child {padding-right: 0 !important;}
            #douyin-header>div {min-width: 100% !important;}
    `;

    const style = document.createElement('style');
    style.textContent = css;

    document.head.appendChild(style);
    setTimeout(()=>document.getElementById('douyin-navigation').style.display = 'none', 5000);
})();