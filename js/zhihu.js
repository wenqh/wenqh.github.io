// ==UserScript==
// @name        Zhihu Desktop on Mobile
// @name:zh-CN  知乎桌面版适配移动端
// @description Use full-featured desktop web zhihu on your phone.
// @description:zh-CN 在你的手机上使用全功能的知乎桌面网页版。
// @namespace   https://greasyfork.org/users/197529
// @version     0.1.3
// @author      kkocdko
// @license     Unlicense
// @match       *://*.zhihu.com/*
// @run-at      document-start
// @downloadURL https://update.greasyfork.org/scripts/546526/%E7%9F%A5%E4%B9%8E%E6%A1%8C%E9%9D%A2%E7%89%88%E9%80%82%E9%85%8D%E7%A7%BB%E5%8A%A8%E7%AB%AF.user.js1
// @updateURL https://update.greasyfork.org/scripts/546526/%E7%9F%A5%E4%B9%8E%E6%A1%8C%E9%9D%A2%E7%89%88%E9%80%82%E9%85%8D%E7%A7%BB%E5%8A%A8%E7%AB%AF.meta.js1
// ==/UserScript==

const afterEnter = (f, condition = () => document.documentElement) => {
    if (condition()) return f();
    const observer = new MutationObserver(() => {
        if (!condition()) return;
        observer.disconnect();
        f();
    });
    observer.observe(document, { childList: true, subtree: true });



};

const css = ([s]) => {
    const el = document.createElement("style");
    el.textContent = s.replace(/;/g, "!important;");
    afterEnter(() => {
        document.documentElement.appendChild(el);
    });
};

css`
    .ContentItem-title,
    .QuestionHeader-title {
        font-weight: normal;
    }
    .OpenInAppButton,
    .PlaceHolder.List-item {
        display: none;
    }
    @media (orientation: portrait) {
        header.AppHeader {
            overflow: auto;
        }
        header.AppHeader,
        .Topstory-container,
        .Topstory-mainColumn,
        .Question-main,
        .Question-mainColumn,
        .Search-container,
        .SearchMain,
        .Profile-main,
        .Profile-mainColumn {
            width: 100%;
            min-width: 100%;
            padding: 0;
            margin: 0;
            margin-top: -10px;
        }
        .Question-mainColumn + *,
        .Topstory-mainColumn + *
        /*.ContentItem-actions > :not(:first-child) svg*/ {
            display: none;
        }
        .Search-container .List-item,
        .Question-mainColumn .List-item,
        .Profile-mainColumn .List-item,
        .Topstory-mainColumn .TopstoryItem,
        .QuestionAnswer-content {
            padding: 4px 4px 8px;
        }
        .ContentItem-actions {
            left: 0;
            padding: 4px 0 0 0;
            margin: 0;
            overflow: auto;
            overflow: overlay;
            overflow-y: hidden;
        }
        .ContentItem-actions > * {
            margin: 0 8px 0 0;
        }
        .ContentItem-actions.is-fixed {
            width: 100%;
            padding: 0;
        }
        .Modal-content {
            max-width: 100%;
        }


        /* 搜索框位置 */
        .AppHeader-Tabs, .SearchTabs-actions {
            order: 9;
        }
        .SearchTabs {
            overflow-x: scroll;
        }
        /* 搜索页侧边 */
        .SearchMain + *, .Question-sideColumn {
            display: none;
        }
        /* 问题页 */
        .QuestionHeader {
            min-width: 100%;
        }
        .QuestionHeader-main {
            width: 100%;
        }
        .AuthorInfo-badgeText {
            width: auto;
        }
        /* 评论框 */
        div:has(> div > .Modal-content) {
            width: 95%;
            max-height: 100%;
            height: 100%;
        }
        .Modal-content > div > :last-child, .Modal-content > div > :first-child {
            display: none;
        }

        .Pc-word-new {display: none}
        .css-kt4t4n {margin: 0}
    }
`;



document.addEventListener('DOMContentLoaded', () => {
    const mo = new MutationObserver(function(){
        const childs = document.body.children;
        const div = childs[childs.length - 1];

        if(div.querySelector('.Modal-content')) {
            console.log('打开了')
            location.hash = "#modal"
        }
    });
    mo.observe(document.body, { childList: true });


    // 情况二：点击了 .Button.Button--secondary 且文字是“查看全部 N 条回复”（N 不固定）。
    // MutationObserver 监听不到，所以这里单独补一个 hash。
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.Modal-content .Button.Button--secondary');
        if (btn && /查看全部\s*\d+\s*条回复/.test(btn.textContent)) {
            if(location.hash === '#modal') location.hash = "#modal2";
        }
    });

    let lastHash;
    window.addEventListener('hashchange', () => {
        if(location.hash === '' || lastHash === '#modal2') {
            // 优先点第一个；找不到就退回点“关闭”按钮（用 || 短路取第一个存在的）
            (document.querySelector('.Modal-content > div > div > div > div')
                || document.querySelector('button[aria-label="关闭"]')
            )?.click();
        }
        lastHash = location.hash;
    });
});