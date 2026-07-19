// ==UserScript==
// @name        Zhihu Desktop on Mobile
// @name:zh-CN  知乎桌面版适配移动端
// @description Use full-featured desktop web zhihu on your phone.
// @description:zh-CN 在你的手机上使用全功能的知乎桌面网页版。
// @namespace   https://greasyfork.org/users/197529 //https://greasyfork.org/zh-CN/scripts/546526-zhihu-desktop-on-mobile
// @version     0.1
// @author      wqh
// @license     Unlicense
// @match       *://*.zhihu.com/*
// @run-at      document-start
// ==/UserScript==

(function () {
    const CSS = `
        @media (orientation: portrait) {
            header.AppHeader, .SearchTabs {
                overflow-x: auto;
            }
            header.AppHeader,
            .Topstory-container,
            .Topstory-mainColumn,
            .Question-main_,
            .Question-mainColumn,
            .QuestionPage > div,
            .Search-container,
            .SearchMain,
            .Profile-main,
            .Profile-mainColumn,
            .ProfileHeader {
                width: 100%;
                min-width: 100%;
                padding: 0;
                margin: 0;
            }
            .Question-mainColumn_ + *,
            .Topstory-mainColumn + *,
            .Profile-mainColumn + * {
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
                padding: 4px 0 0 0;
                margin: 0;
                overflow-x: auto;
                overflow-y: hidden;
            }
            .ContentItem-actions > * {
                margin: 0 8px 0 0;
            }
            

            /* 搜索框位置 */
            .SearchTabs-actions {
                order: 9;
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
                width: 100%; padding-left: 4px;
            }
            .AuthorInfo-badgeText {
                width: auto !important;
            }
            
            /* 评论模态框 */
            /*.Modal-content {
                max-width: 100%;
            }*/
            div:has(> div > .Modal-content) {
                width: 100%;
                max-height: 100%;
                height: 100%;
            }
            .Modal-content > div > :last-child, .Modal-content > div > :first-child {
                display: none;
            }
            .css-kt4t4n {margin: 0; display: none}/*写评论*/

            .QuestionHeader-Comment {order: -1}/* 问题标题评论 */
            .QuestionMainAction.ViewAll-QuestionMainAction {background-color: #eee; color: black}/* 查看全部回答 */
            
            .Modal-content > div > div:nth-child(2) > :last-child {border: 10px solid #ddd}
            .Pc-word-new {display: none}/*广告*/
            .css-5ym188 {background-color: inherit;}/*模态框灰背景*/
        }
    `;
    const el = document.createElement('style');
    el.textContent = CSS;
    document.documentElement.appendChild(el);


    document.addEventListener('DOMContentLoaded', () => {
        const mo = new MutationObserver(function () {
            const childs = document.body.children;
            const div = childs[childs.length - 1];

            if (div.querySelector('.Modal-content')) {
                console.log('打开了')
                location.hash = "#modal"
            }
        });
        mo.observe(document.body, {childList: true});
    });

    // 情况二：点击了 .Button.Button--secondary 且文字是“查看全部 N 条回复”（N 不固定）。
    // MutationObserver 监听不到，所以这里单独补一个 hash。
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.Modal-content .Button.Button--secondary');
        if (btn && /查看全部\s*\d+\s*条回复/.test(btn.textContent)) {
            if (location.hash === '#modal') location.hash = "#modal2";
        }
    });

    let lastHash;
    window.addEventListener('hashchange', () => {
        if (location.hash === '' || lastHash === '#modal2') {
            // 优先点第一个；找不到就退回点“关闭”按钮（用 || 短路取第一个存在的）
            (document.querySelector('.Modal-content > div:nth-child(2) > div > div > div')
                || document.querySelector('button[aria-label="关闭"]')
            )?.click();
        }
        lastHash = location.hash;
    });
})();
