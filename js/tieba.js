// ==UserScript==
// @name         贴吧防误触
// @namespace    https://viayoo.com/q0cmg7
// @version      0.1
// @description  try to take over the world!
// @author       You
// @run-at       document-end
// @match        *://tieba.baidu.com/p/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const div = document.createElement('div');
    div.style = 'width: 10px; height: 55px; position: fixed; z-index:999; bottom: 0;  left: 50%; transform: translateX(-50%);'
    document.body.appendChild(div);

})();
