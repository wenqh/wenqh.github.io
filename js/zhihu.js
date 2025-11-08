//知乎网页插件0.1.3 https://greasyfork.org/zh-CN/users/197529-kkocdko https://greasyfork.org/zh-CN/scripts/546526-zhihu-desktop-on-mobile
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
      width: 100vw;
      min-width: 100vw;
      padding: 0;
      margin: 0;
      margin-top: -10px;
    }
    .Question-mainColumn + *,
    .Topstory-mainColumn + *,
    .ContentItem-actions > :not(:first-child) svg {
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
      width: 100vw;
      padding: 0;
    }
    .Modal-content {
      max-width: 100vw;
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
  }
`;



document.addEventListener('DOMContentLoaded', () => {

let modalDiv;
const mo = new MutationObserver(function(){
    const childs = document.body.children;
    const div = childs[childs.length - 1];

    if(div.querySelector('.Modal-content')) {
        console.log('打开了')
        modalDiv = div
        location.hash = "#modal"
    }
});
mo.observe(document.body, { childList: true });

window.addEventListener('hashchange', () => {
    if(location.hash === '') {
        modalDiv.querySelector('button[aria-label="关闭"]').click();
    }
});

});