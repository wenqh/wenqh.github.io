// ==UserScript==
// @name         抖音
// @namespace    https://viayoo.com/
// @version      0.1
// @run-at       document-end
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

            .isDark {background-color: black !important}

            :root .isDark {--color-text-t1: white !important;}
            #videoSideCard {filter: invert(1);}
            #videoSideCard img {filter: invert(1);}
    `;

    const style = document.createElement('style');
    style.textContent = css;

    document.head.appendChild(style);
    //setTimeout(() => {
        const menu = document.getElementById('douyin-navigation');

        const b = document.createElement('div');
        b.textContent = '菜单';
        b.style.cssText = 'position: fixed; top: 0; z-index: 999; padding: 15px; color: white; background-color: black;';
        b.addEventListener('click', () => {menu.style.display = menu.style.display === 'none' ? '' : 'none';});
        document.body.append(b);

        menu.addEventListener('click', (e) => {
            if (e.target.closest('a')) {
                e.currentTarget.style.display = 'none';
            }
        });
    //}, 2000);
})();