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
        /* .h1_b8gRO */
        #slidelist {
            width: 100%;
            height: 100%;
            z-index: 504;
            background-color: #000;
            position: fixed;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
        }
        #slidelist div:first-child {
            padding-right: 0 !important;
        }
    `;

    const style = document.createElement('style');
    style.textContent = css;

    (document.head || document.documentElement).appendChild(style);
})();