// ==UserScript==
// @name         滑动翻页-适配红书
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  滑动翻页
// @author       You
// @run-at       document-start
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let startX = 0;
    let startY = 0;

    window.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    });
    window.addEventListener('touchmove', (e) => {
         if (startX >= 0.600) {
            e.preventDefault();
         }
    }, { passive: false });
    window.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;

        if (startX < 0.600) {
            return;
        }

        if (endY - startY < -50) {
            const before = window.scrollY;

            window.scrollBy(0, window.innerHeight);

            requestAnimationFrame(() => {
                const after = window.scrollY;
                if (after - before < window.innerHeight - 1) {
                    //alert((after - before)+"到"+window.innerHeight);
                    const e = document.createElement('div');
                    Object.assign(e.style, {
                        position: 'absolute', top: before + innerHeight + 'px', width: '100%', borderTop: '3px solid'
                    });
                    document.body.appendChild(e);
                }
            });


        } else if (endY - startY > 50) {
            window.scrollBy(0, -window.innerHeight);
        }
    });
})();
