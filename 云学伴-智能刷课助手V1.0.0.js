// ==UserScript==
// @name         云学伴 - 智能刷课助手
// @namespace    yunxueban-auto-course
// @version      1.0.0
// @description  云学伴 - 传智播客高校学习平台智能刷课插件 | 自定义倍速 · 声音控制 · 自动搜题答题 · 可视化面板
// @author       霖尘云客工作室
// @homepage     mailto:1400189243@qq.com
// @match        *://stu.ityxb.com/preview/detail/*
// @match        *://stu.ityxb.com/learning/*/directory*
// @match        *://study.ithb.com/preview/detail/*
// @match        *://study.ithb.com/learning/*/directory*
// @icon         https://stu.ityxb.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      baidu.com
// @connect      cn.bing.com
// @connect      www.baidu.com
// @run-at       document-idle
// @license      Copyright (c) 2026 霖尘云客工作室. All Rights Reserved.
// ==/UserScript==

/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                                                              ║
 * ║   云学伴 - 智能刷课助手                                     ║
 * ║                                                              ║
 * ║   版权所有 © 2026 霖尘云客工作室                        ║
 * ║   作者邮箱: 1400189243@qq.com                                ║
 * ║                                                              ║
 * ║   本软件受中华人民共和国著作权法保护。                         ║
 * ║   未经版权所有者书面授权，禁止:                               ║
 * ║     1. 复制、修改、分发本软件或其任何部分                     ║
 * ║     2. 将本软件用于商业用途                                  ║
 * ║     3. 反编译、反汇编本软件                                   ║
 * ║     4. 删除或修改本版权声明                                   ║
 * ║     5. 以任何形式冒充原作者                                  ║
 * ║                                                              ║
 * ║   侵权必究 · 保留一切法律权利                                 ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

(function() {
    'use strict';

    // ============================================================
    //  配置
    // ============================================================
    const CONFIG = {
        playbackRate: 16,
        checkInterval: 1000,
        nextWait: 2000,
        autoMute: true,
        autoStart: true,
        autoAnswer: true,
        searchEngine: 'baidu',
        answerWait: 3000,
        // 防卡顿配置（主动缓冲策略）
        bufferDetect: true,          // 开启智能缓冲控制
        bufferAhead: 10,             // 前方缓冲目标（秒），低于此值降速
        bufferFull: 30,              // 缓冲充足阈值（秒），高于此值提速
        minSpeed: 1,                 // 最低倍速
        maxSpeed: 16,                // 最高倍速
        speedUpStep: 2,              // 每次提速步长
        speedDownStep: 2,            // 每次降速步长
        speedCheckInterval: 2000,    // 缓冲检测间隔（ms）
        recoverDelay: 5000,          // 缓冲恢复后延迟提速（ms）
        stallThreshold: 3,           // 卡顿超过N秒判定为严重缓冲
        forceSeekOnStall: true,      // 严重卡顿时 seek 触发预加载
    };

    // ============================================================
    //  状态
    // ============================================================
    const STATE = {
        isRunning: false,
        currentIndex: -1,
        totalNodes: 0,
        completedCount: 0,
        totalVideos: 0,
        startTime: null,
        statusText: '等待启动',
        isAnswering: false,
        answerStats: { searched: 0, found: 0, filled: 0 },
        // 防卡顿状态
        stallCount: 0,
        currentSpeed: 16,
        targetSpeed: 16,
        lastPlayTime: 0,
        lastBufferTime: 0,
        isBuffering: false,
        recoverTimer: null,
        bufferCheckTimer: null,
        lastStallLogTime: 0,       // 防止日志刷屏
        smoothSpeedUp: false,       // 是否处于平滑提速阶段
    };

    // ============================================================
    //  白色主题样式
    // ============================================================
    GM_addStyle(`
        #yxb-panel {
            position: fixed; top: 16px; right: 16px; z-index: 999999;
            width: 330px;
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
            color: #333; overflow: hidden;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            border: 1px solid rgba(0,0,0,0.06);
        }
        #yxb-panel.minimized {
            width: 46px; height: 46px; border-radius: 50%;
            cursor: pointer; overflow: hidden;
            box-shadow: 0 4px 16px rgba(59,130,246,0.35);
            border: none;
        }
        #yxb-panel.minimized .yxb-body,
        #yxb-panel.minimized .yxb-header { display: none; }
        #yxb-panel.minimized .yxb-mini-icon { display: flex; }

        .yxb-mini-icon {
            display: none; align-items: center; justify-content: center;
            width: 100%; height: 100%;
            background: linear-gradient(135deg, #3b82f6, #6366f1);
            font-size: 18px; color: white; border-radius: 50%;
            box-shadow: 0 2px 8px rgba(59,130,246,0.3);
        }

        /* 头部 */
        .yxb-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 14px 16px 12px;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-bottom: 1px solid #f1f5f9;
        }
        .yxb-header-left { display: flex; align-items: center; gap: 10px; }
        .yxb-logo {
            width: 32px; height: 32px;
            background: linear-gradient(135deg, #3b82f6, #6366f1);
            border-radius: 10px; display: flex; align-items: center; justify-content: center;
            font-size: 15px; color: white;
            box-shadow: 0 2px 8px rgba(59,130,246,0.3);
        }
        .yxb-title-group { display: flex; flex-direction: column; gap: 1px; }
        .yxb-title { font-size: 14px; font-weight: 700; color: #1e293b; letter-spacing: 0.3px; }
        .yxb-subtitle { font-size: 10px; color: #94a3b8; font-weight: 400; }
        .yxb-header-actions { display: flex; gap: 4px; }
        .yxb-btn-icon {
            width: 30px; height: 30px; border: none;
            background: white; border-radius: 8px;
            color: #94a3b8; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; transition: all 0.2s;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .yxb-btn-icon:hover { background: #f1f5f9; color: #64748b; }

        .yxb-body { padding: 14px 16px 10px; }

        /* 状态栏 */
        .yxb-status {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 14px; background: #f8fafc;
            border-radius: 12px; margin-bottom: 14px;
            border: 1px solid #f1f5f9;
        }
        .yxb-status-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: #cbd5e1; flex-shrink: 0; transition: all 0.3s;
        }
        .yxb-status-dot.running { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5); animation: yxb-pulse 2s infinite; }
        .yxb-status-dot.paused { background: #f59e0b; }
        .yxb-status-dot.done { background: #3b82f6; }
        .yxb-status-dot.answering { background: #8b5cf6; box-shadow: 0 0 8px rgba(139,92,246,0.5); animation: yxb-pulse 1s infinite; }
        @keyframes yxb-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .yxb-status-text {
            font-size: 12px; color: #64748b; flex: 1;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            font-weight: 500;
        }

        /* 进度条 */
        .yxb-progress-wrap { margin-bottom: 14px; }
        .yxb-progress-label {
            display: flex; justify-content: space-between;
            font-size: 11px; color: #94a3b8; margin-bottom: 6px; font-weight: 500;
        }
        .yxb-progress-bar { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
        .yxb-progress-fill {
            height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1);
            border-radius: 3px; transition: width 0.5s ease; width: 0%;
        }

        /* 统计卡片 */
        .yxb-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .yxb-stat {
            text-align: center; padding: 10px 4px; background: #f8fafc;
            border-radius: 12px; border: 1px solid #f1f5f9;
        }
        .yxb-stat-value { font-size: 20px; font-weight: 800; color: #1e293b; line-height: 1.2; }
        .yxb-stat-label { font-size: 10px; color: #94a3b8; margin-top: 3px; font-weight: 500; }

        /* 当前播放 */
        .yxb-now-playing {
            padding: 9px 12px; background: #eff6ff;
            border: 1px solid #dbeafe; border-radius: 10px;
            margin-bottom: 12px; font-size: 12px; color: #3b82f6;
            display: none; align-items: center; gap: 8px; font-weight: 500;
        }
        .yxb-now-playing-icon { font-size: 12px; animation: yxb-bounce 1s infinite; }
        @keyframes yxb-bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }
        .yxb-now-playing-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #64748b; }

        /* 控制按钮 */
        .yxb-controls { display: flex; gap: 8px; margin-bottom: 14px; }
        .yxb-btn {
            flex: 1; padding: 10px 0; border: none; border-radius: 12px;
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.2s; display: flex; align-items: center;
            justify-content: center; gap: 6px;
        }
        .yxb-btn-primary {
            background: linear-gradient(135deg, #3b82f6, #6366f1);
            color: white; box-shadow: 0 2px 8px rgba(59,130,246,0.3);
        }
        .yxb-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(59,130,246,0.4); }
        .yxb-btn-secondary {
            background: #f1f5f9; color: #64748b;
        }
        .yxb-btn-secondary:hover { background: #e2e8f0; }
        .yxb-btn-sound {
            width: 42px; flex: none; padding: 10px 0;
            background: #f1f5f9; color: #64748b;
            border: none; border-radius: 12px; cursor: pointer;
            font-size: 16px; transition: all 0.2s; display: flex;
            align-items: center; justify-content: center;
        }
        .yxb-btn-sound:hover { background: #e2e8f0; }
        .yxb-btn-sound.muted { color: #ef4444; background: #fef2f2; }

        /* 设置区域 */
        .yxb-settings {
            background: #f8fafc; border-radius: 12px; padding: 12px 14px;
            border: 1px solid #f1f5f9;
        }
        .yxb-setting { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
        .yxb-setting + .yxb-setting { border-top: 1px solid #f1f5f9; padding-top: 8px; margin-top: 2px; }
        .yxb-setting-label { font-size: 12px; color: #475569; font-weight: 500; }
        .yxb-setting-control { display: flex; align-items: center; gap: 8px; }

        /* 倍速滑块 */
        .yxb-speed-control { display: flex; align-items: center; gap: 8px; }
        .yxb-speed-slider {
            -webkit-appearance: none; appearance: none;
            width: 90px; height: 4px; background: #e2e8f0;
            border-radius: 2px; outline: none; cursor: pointer;
        }
        .yxb-speed-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 16px; height: 16px; background: #3b82f6;
            border-radius: 50%; cursor: pointer;
            box-shadow: 0 1px 4px rgba(59,130,246,0.4);
            transition: transform 0.15s;
        }
        .yxb-speed-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
        .yxb-speed-value {
            font-size: 13px; font-weight: 700; color: #3b82f6;
            min-width: 36px; text-align: right;
        }

        /* 开关 */
        .yxb-toggle {
            position: relative; width: 40px; height: 22px;
            background: #e2e8f0; border-radius: 11px;
            cursor: pointer; transition: background 0.3s;
        }
        .yxb-toggle.active { background: #3b82f6; }
        .yxb-toggle::after {
            content: ''; position: absolute; top: 2px; left: 2px;
            width: 18px; height: 18px; background: white;
            border-radius: 50%; transition: transform 0.3s;
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        .yxb-toggle.active::after { transform: translateX(18px); }

        /* 搜题引擎 */
        .yxb-select {
            background: white; border: 1px solid #e2e8f0;
            border-radius: 8px; color: #475569; padding: 4px 10px;
            font-size: 11px; outline: none; cursor: pointer;
            font-weight: 500;
        }
        .yxb-select:focus { border-color: #3b82f6; }

        /* 答题统计 */
        .yxb-answer-stats {
            display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;
            margin-top: 10px; padding: 10px 12px;
            background: #faf5ff; border: 1px solid #f3e8ff;
            border-radius: 10px;
        }
        .yxb-answer-stat { text-align: center; }
        .yxb-answer-stat-value { font-size: 15px; font-weight: 700; color: #7c3aed; }
        .yxb-answer-stat-label { font-size: 9px; color: #a78bfa; margin-top: 1px; }

        /* 日志 */
        .yxb-log {
            max-height: 120px; overflow-y: auto; margin-top: 12px;
            padding: 8px 10px; background: #f8fafc;
            border-radius: 10px; font-size: 11px; line-height: 1.7;
            color: #94a3b8; border: 1px solid #f1f5f9;
        }
        .yxb-log::-webkit-scrollbar { width: 3px; }
        .yxb-log::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }
        .yxb-log-item { padding: 1px 0; }
        .yxb-log-item.success { color: #16a34a; }
        .yxb-log-item.warn { color: #d97706; }
        .yxb-log-item.error { color: #dc2626; }
        .yxb-log-item.info { color: #2563eb; }
        .yxb-log-item.answer { color: #7c3aed; }

        /* 版权 */
        .yxb-footer {
            text-align: center; padding: 10px 0 4px;
            font-size: 10px; color: #94a3b8; line-height: 1.6;
            border-top: 1px solid #f1f5f9; margin-top: 8px;
        }
        .yxb-footer-copy { font-weight: 600; color: #64748b; }
        .yxb-footer-warn { font-size: 9px; color: #cbd5e1; margin-top: 2px; }
    `);

    // ============================================================
    //  工具函数
    // ============================================================
    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${m}:${String(s).padStart(2,'0')}`;
    }

    // ============================================================
    //  搜题答题模块 v3 - 全面重构
    // ============================================================
    const AnswerEngine = {
        // ---- 题目检测 ----
        getQuestions() {
            const questions = [];
            // 传智播客平台实际 DOM 结构（优先）
            const containerSelectors = [
                '.question-info-box',          // 传智播客：题目信息框
                '.questions-lists-box',        // 传智播客：习题列表容器
                '.topic-item',                 // 通用
                '.question-item',
                '.el-form-item__content',
                '.exercise-item',
                '.exam-question-item',
                '.topic-content',
            ];
            let containers = [];
            for (const sel of containerSelectors) {
                const els = $$(sel);
                els.forEach(el => {
                    if (!el.closest('.yxb-panel') && !containers.includes(el)) {
                        containers.push(el);
                    }
                });
                if (containers.length > 0) break;
            }
            // 兜底：查找包含 el-radio-group 的容器
            if (containers.length === 0) {
                const radioGroups = $$('.el-radio-group');
                radioGroups.forEach(rg => {
                    if (rg.closest('.yxb-panel')) return;
                    // 传智播客：向上找到 .question-info-box
                    const infoBox = rg.closest('.question-info-box');
                    if (infoBox) {
                        if (!containers.includes(infoBox)) containers.push(infoBox);
                        return;
                    }
                    const parent = rg.closest('.el-form-item') || rg.parentElement?.parentElement;
                    if (parent && !containers.includes(parent)) containers.push(parent);
                });
            }

            containers.forEach((container, idx) => {
                // 提取题目文本 - 匹配传智播客实际结构
                const textSelectors = [
                    '.question-title-text',     // 传智播客：题目文本
                    '.topic-content', '.question-stem', '.stem-text',
                    '.topic-title', '.question-text',
                    '.el-form-item__label',
                    'h4', '.title',
                ];
                let text = '';
                for (const sel of textSelectors) {
                    const el = container.querySelector(sel);
                    if (el && el.textContent.trim().length > 3) {
                        text = el.textContent.trim();
                        break;
                    }
                }
                if (!text || text.length < 3) {
                    const firstText = container.querySelector('.question-num, .topic-num, .question-num, .stem-num');
                    if (firstText) {
                        text = firstText.parentElement?.textContent?.trim() || '';
                    }
                }
                if (!text || text.length < 3) return;

                // 判断题型 - 优先用DOM结构判断
                let type = 'unknown';
                if (container.querySelector('.el-radio-group, .el-radio')) type = 'single';
                else if (container.querySelector('.el-checkbox-group, .el-checkbox')) type = 'multi';
                else if (container.querySelector('.el-input, input[type="text"], textarea')) type = 'fill';
                else if (container.querySelector('.tf-content, [class*="judge"]')) type = 'judge';
                else {
                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('单选') || lowerText.includes('单项选择')) type = 'single';
                    else if (lowerText.includes('多选') || lowerText.includes('多项选择')) type = 'multi';
                    else if (lowerText.includes('填空') || lowerText.includes('填写')) type = 'fill';
                    else if (lowerText.includes('判断') || lowerText.includes('对错')) type = 'judge';
                }

                // 提取选项文本 - 匹配传智播客实际结构
                const options = [];
                // 传智播客: .question-option-item > label.el-radio > span.el-radio__label > div.options-item-text
                const optionItems = container.querySelectorAll('.question-option-item');
                if (optionItems.length > 0) {
                    optionItems.forEach((item, i) => {
                        const textEl = item.querySelector('.options-item-text');
                        let optText = textEl ? textEl.textContent.trim() : '';
                        // 去掉开头的 A、B、等
                        optText = optText.replace(/^\s*[A-F][.、．)\s]+/, '').trim();
                        if (optText.length > 0 && optText.length < 100) {
                            options.push({ index: i, letter: String.fromCharCode(65 + i), text: optText });
                        }
                    });
                } else {
                    // 通用兜底
                    const optionEls = container.querySelectorAll('.el-radio, .el-checkbox, .option-item');
                    optionEls.forEach((opt, i) => {
                        const label = opt.querySelector('.el-radio__label, .el-checkbox__label');
                        let optText = label ? label.textContent.trim() : opt.textContent.trim();
                        optText = optText.replace(/^\s*[A-F][.、．)\s]+/, '').trim();
                        if (optText.length > 0 && optText.length < 100) {
                            options.push({ index: i, letter: String.fromCharCode(65 + i), text: optText });
                        }
                    });
                }

                questions.push({
                    index: idx,
                    text: text,
                    type: type,
                    options: options,
                    container: container,
                    answered: false,
                });
            });
            return questions;
        },

        // ---- 搜索关键词构建 ----
        // 核心原则：只搜题目核心内容，不包含选项
        buildSearchQuery(question) {
            let text = question.text
                .replace(/^\d+[.、．)\s]+/, '')            // 去题号
                .replace(/[（(]\d+[)）]/, '')            // 去括号题号
                .replace(/^(单选|多选|填空|判断)[题]?\s*[：:]*\s*/i, '') // 去题型前缀
                .replace(/\s+/g, ' ')
                .trim();

            // 截取前50个字符（太长搜索效果差）
            if (text.length > 50) text = text.substring(0, 50);
            return text;
        },

        // ---- 搜索答案 ----
        async searchAnswer(questionText) {
            const encoded = encodeURIComponent(questionText);
            const engines = CONFIG.searchEngine === 'bing'
                ? [`https://cn.bing.com/search?q=${encoded}`, `https://www.baidu.com/s?wd=${encoded}`]
                : [`https://www.baidu.com/s?wd=${encoded}`, `https://cn.bing.com/search?q=${encoded}`];

            const results = []; // 收集所有引擎的结果

            for (const url of engines) {
                try {
                    const answer = await this._fetchAndParse(url, questionText);
                    if (answer) results.push(answer);
                } catch (e) {
                    continue;
                }
            }

            if (results.length === 0) return null;

            // 多引擎结果交叉验证：取出现次数最多的
            if (results.length >= 2) {
                const counts = {};
                results.forEach(r => {
                    const key = r.answer.trim().toUpperCase();
                    counts[key] = (counts[key] || 0) + 1;
                });
                // 找到最高频的答案
                let bestKey = '', bestCount = 0;
                for (const [key, count] of Object.entries(counts)) {
                    if (count > bestCount) { bestKey = key; bestCount = count; }
                }
                if (bestCount >= 2) {
                    // 多引擎一致，高置信度
                    return results.find(r => r.answer.trim().toUpperCase() === bestKey);
                }
            }

            // 单引擎或结果不一致：取置信度最高的
            results.sort((a, b) => b.confidence - a.confidence);
            if (results[0].confidence >= 0.6) return results[0];
            return null;
        },

        // ---- 请求并解析 ----
        _fetchAndParse(url, questionText) {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET', url, timeout: 8000,
                    onload: function(response) {
                        try {
                            const html = response.responseText;
                            const result = parseSearchResultV3(html, questionText);
                            resolve(result);
                        } catch (e) { resolve(null); }
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null),
                });
            });
        },

        // ---- 填入答案 ----
        fillAnswer(question, answerObj) {
            if (!answerObj || !answerObj.answer) return false;
            const answer = answerObj.answer;
            const container = question.container;
            try {
                switch (question.type) {
                    case 'single': return this._fillSingle(container, answer, question.options);
                    case 'multi': return this._fillMulti(container, answer, question.options);
                    case 'fill': return this._fillBlank(container, answer);
                    case 'judge': return this._fillJudge(container, answer);
                    default:
                        // 未知题型，依次尝试
                        return this._fillSingle(container, answer, question.options) ||
                               this._fillMulti(container, answer, question.options) ||
                               this._fillJudge(container, answer);
                }
            } catch (e) {
                addLog('填入答案出错: ' + e.message, 'error');
            }
            return false;
        },

        // ---- 单选题填入 ----
        _fillSingle(container, answer, knownOptions) {
            // 传智播客: .question-option-item > label.el-radio
            // 通用: 直接找 .el-radio
            const optionItems = container.querySelectorAll('.question-option-item');
            const radioWraps = optionItems.length > 0
                ? Array.from(optionItems).map(item => item.querySelector('label.el-radio')).filter(Boolean)
                : Array.from(container.querySelectorAll('.el-radio'));

            if (radioWraps.length === 0) return false;

            const cleanAnswer = answer.trim().toUpperCase();

            // 策略1: 答案是纯字母 A-F
            if (/^[A-F]$/.test(cleanAnswer)) {
                const idx = cleanAnswer.charCodeAt(0) - 65;
                if (idx < radioWraps.length) {
                    this._clickRadio(radioWraps[idx]);
                    addLog(`  → 选择 ${cleanAnswer}`, 'info');
                    return true;
                }
            }

            // 策略2: 答案是 "A.xxx" 或 "A、xxx" 格式
            const letterPrefix = answer.match(/^([A-F])[.、．)\s]/i);
            if (letterPrefix) {
                const idx = letterPrefix[1].toUpperCase().charCodeAt(0) - 65;
                if (idx < radioWraps.length) {
                    this._clickRadio(radioWraps[idx]);
                    addLog(`  → 选择 ${letterPrefix[1].toUpperCase()}`, 'info');
                    return true;
                }
            }

            // 策略3: 用选项文字匹配（精确匹配优先）
            const answerText = answer.trim()
                .replace(/^[A-F][.、．)\s]+/i, '')
                .replace(/[。，,;！!？?\s]+$/, '')
                .trim();

            if (answerText.length > 0) {
                // 精确匹配
                for (let i = 0; i < radioWraps.length; i++) {
                    const optText = this._getOptionText(radioWraps[i]);
                    if (optText === answerText) {
                        this._clickRadio(radioWraps[i]);
                        addLog(`  → 精确匹配选项${String.fromCharCode(65 + i)}`, 'info');
                        return true;
                    }
                }
                // 模糊匹配（仅当精确匹配失败）
                for (let i = 0; i < radioWraps.length; i++) {
                    const optText = this._getOptionText(radioWraps[i]);
                    if (answerText.length >= 2 && optText.length >= 2) {
                        if (optText.includes(answerText) || answerText.includes(optText)) {
                            this._clickRadio(radioWraps[i]);
                            addLog(`  → 模糊匹配选项${String.fromCharCode(65 + i)}`, 'info');
                            return true;
                        }
                    }
                }
            }

            // 策略4: 从答案中提取字母
            const anyLetter = answer.match(/([A-F])[.、．号选项]?/i);
            if (anyLetter) {
                const idx = anyLetter[1].toUpperCase().charCodeAt(0) - 65;
                if (idx < radioWraps.length) {
                    this._clickRadio(radioWraps[idx]);
                    addLog(`  → 提取字母选择 ${anyLetter[1].toUpperCase()}`, 'info');
                    return true;
                }
            }

            return false;
        },

        // 获取选项文字（适配传智播客结构）
        _getOptionText(radioEl) {
            // 传智播客: .el-radio__label > .options-item-text
            const textEl = radioEl.querySelector('.options-item-text');
            if (textEl) return textEl.textContent.trim().replace(/^\s*[A-F][.、．)\s]+/, '').trim();
            // 通用: .el-radio__label
            const label = radioEl.querySelector('.el-radio__label');
            if (label) return label.textContent.trim().replace(/^\s*[A-F][.、．)\s]+/, '').trim();
            return radioEl.textContent.trim().replace(/^\s*[A-F][.、．)\s]+/, '').trim();
        },

        // 安全点击 el-radio（触发 Vue 响应式）
        _clickRadio(radioEl) {
            // 传智播客: label.el-radio > span.el-radio__input > input.el-radio__original
            // 优先点击 label 元素本身（Vue Element UI 的标准交互方式）
            if (radioEl.tagName === 'LABEL') {
                radioEl.click();
            } else {
                // 兜底：找内部 input
                const input = radioEl.querySelector('input.el-radio__original, input[type="radio"]');
                if (input) {
                    input.click();
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    radioEl.click();
                }
            }
        },

        // ---- 多选题填入 ----
        _fillMulti(container, answer, knownOptions) {
            // 传智播客: .question-option-item > label.el-checkbox
            const optionItems = container.querySelectorAll('.question-option-item');
            const checkboxWraps = optionItems.length > 0
                ? Array.from(optionItems).map(item => item.querySelector('label.el-checkbox')).filter(Boolean)
                : Array.from(container.querySelectorAll('.el-checkbox'));
            if (checkboxWraps.length === 0) return false;

            // 解析答案中的字母
            const letters = new Set();
            const letterMatches = answer.match(/[A-F]/g);
            if (letterMatches) {
                letterMatches.forEach(l => letters.add(l.toUpperCase()));
            }

            // 解析答案中的文字
            const answerTexts = answer.split(/[,，;；\s|/]+/)
                .map(a => a.replace(/^[A-F][.、．)\s]+/i, '').trim())
                .filter(a => a.length > 0 && !/^[A-F]$/.test(a));

            let filled = 0;

            // 按字母匹配
            for (const letter of letters) {
                const idx = letter.charCodeAt(0) - 65;
                if (idx < checkboxWraps.length) {
                    const cb = checkboxWraps[idx];
                    const input = cb.querySelector('input.el-checkbox__original, input[type="checkbox"]');
                    if (input && !input.checked) {
                        if (cb.tagName === 'LABEL') cb.click();
                        else { input.click(); input.dispatchEvent(new Event('change', { bubbles: true })); }
                        filled++;
                    }
                }
            }

            // 按文字匹配（只匹配还没选中的）
            for (const text of answerTexts) {
                for (let i = 0; i < checkboxWraps.length; i++) {
                    const cb = checkboxWraps[i];
                    const input = cb.querySelector('input.el-checkbox__original, input[type="checkbox"]');
                    if (input && input.checked) continue;

                    const optText = this._getOptionText(cb);

                    if (optText === text || (text.length >= 2 && optText.includes(text))) {
                        if (cb.tagName === 'LABEL') cb.click();
                        else { input.click(); input.dispatchEvent(new Event('change', { bubbles: true })); }
                        filled++;
                        break;
                    }
                }
            }

            if (filled > 0) addLog(`  → 多选填入 ${filled} 个选项`, 'info');
            return filled > 0;
        },

        // ---- 填空题填入 ----
        _fillBlank(container, answer) {
            let cleanAnswer = answer.trim()
                .replace(/^[A-F][.、．)\s]+/i, '')
                .replace(/^(正确答案|答案|选)[是为：:\s]*/i, '')
                .replace(/^["""]|["""]$/g, '')
                .trim();

            if (!cleanAnswer) return false;

            const input = container.querySelector('.el-input__inner, input[type="text"], textarea');
            if (!input) return false;

            try {
                // Vue 兼容写入
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                )?.set || Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                )?.set;

                if (nativeInputValueSetter) {
                    nativeInputValueSetter.call(input, cleanAnswer);
                } else {
                    input.value = cleanAnswer;
                }
                // 触发 Vue 响应式更新
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                addLog(`  → 填入: ${cleanAnswer.substring(0, 20)}`, 'info');
                return true;
            } catch (e) {
                input.value = cleanAnswer;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                addLog(`  → 填入(降级): ${cleanAnswer.substring(0, 20)}`, 'info');
                return true;
            }
        },

        // ---- 判断题填入 ----
        _fillJudge(container, answer) {
            const ans = answer.trim();
            const isTrue = /正确|对|true|√|yes|是/i.test(ans);
            const isFalse = /错误|不对|false|×|no|错|否/i.test(ans);

            // 排除歧义（同时包含正确和错误关键词）
            if (isTrue && isFalse) {
                // 看哪个关键词在答案中更靠前
                const trueIdx = ans.search(/正确|对|true|√|yes|是/i);
                const falseIdx = ans.search(/错误|不对|false|×|no|错|否/i);
                if (falseIdx < trueIdx) return this._clickJudge(container, false);
            }

            if (!isTrue && !isFalse) return false;
            return this._clickJudge(container, isTrue);
        },

        _clickJudge(container, isTrue) {
            // 传智播客: .question-option-item > label.el-radio
            const optionItems = container.querySelectorAll('.question-option-item');
            const radios = optionItems.length > 0
                ? Array.from(optionItems).map(item => item.querySelector('label.el-radio')).filter(Boolean)
                : Array.from(container.querySelectorAll('.el-radio'));
            if (radios.length >= 2) {
                // 识别哪个是"正确"哪个是"错误"
                let trueIdx = -1, falseIdx = -1;
                radios.forEach((r, i) => {
                    const t = r.textContent.trim();
                    if (/正确|对|是|true|√/i.test(t)) trueIdx = i;
                    if (/错误|不对|否|false|错|×/i.test(t)) falseIdx = i;
                });

                let targetIdx;
                if (trueIdx >= 0 && falseIdx >= 0) {
                    targetIdx = isTrue ? trueIdx : falseIdx;
                } else {
                    targetIdx = isTrue ? 0 : 1;
                }

                this._clickRadio(radios[targetIdx]);
                addLog(`  → 判断题: ${isTrue ? '正确' : '错误'}`, 'info');
                return true;
            }
            return false;
        },

        // ---- 自动答题主流程 ----
        async autoAnswer() {
            if (STATE.isAnswering) return;
            STATE.isAnswering = true;

            // 等待页面完全加载
            await sleep(2000);

            const questions = this.getQuestions();
            if (questions.length === 0) {
                addLog('未检测到题目', 'warn');
                STATE.isAnswering = false;
                return false;
            }

            addLog(`检测到 ${questions.length} 道题目，开始搜题...`, 'answer');
            STATE.statusText = `搜题答题中 (0/${questions.length})`;
            updateUI();

            let filledCount = 0;
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                if (q.answered) continue;

                STATE.statusText = `搜题中 (${i + 1}/${questions.length})...`;
                updateUI();

                const query = this.buildSearchQuery(q);
                addLog(`第${i + 1}题: ${query.substring(0, 35)}...`, 'answer');

                STATE.answerStats.searched++;
                const answerObj = await this.searchAnswer(query);

                if (answerObj && answerObj.answer) {
                    STATE.answerStats.found++;
                    addLog(`找到答案: ${answerObj.answer} (置信度:${Math.round(answerObj.confidence * 100)}%)`, 'answer');
                    const ok = this.fillAnswer(q, answerObj);
                    if (ok) {
                        STATE.answerStats.filled++;
                        filledCount++;
                        q.answered = true;
                        addLog(`✓ 第${i + 1}题已填入`, 'success');
                    } else {
                        addLog(`✗ 第${i + 1}题答案无法匹配选项`, 'warn');
                    }
                } else {
                    addLog(`✗ 第${i + 1}题未找到答案`, 'warn');
                }

                // 题目间间隔
                if (i < questions.length - 1) await sleep(800);
            }

            addLog(`答题完成: 填入 ${filledCount}/${questions.length}`, filledCount > 0 ? 'success' : 'warn');
            STATE.isAnswering = false;

            // 等待用户查看后提交
            await sleep(1500);

            // 提交答案
            const submitted = await this._submitAnswer();
            if (submitted) {
                addLog('已提交，等待结果...', 'info');
                await sleep(2000);
                // 处理提交后的弹窗
                await this._handlePostSubmit();
            } else {
                addLog('未找到提交按钮', 'warn');
            }

            return filledCount > 0;
        },

        // ---- 提交答案 ----
        async _submitAnswer() {
            // 精确匹配提交按钮（排除面板内的按钮）
            const btnSelectors = [
                'button.el-button--primary',           // Element UI 主按钮
                '.submit-btn', '.btn-submit',
                'button[type="submit"]',
            ];

            for (const sel of btnSelectors) {
                const btns = $$(sel);
                for (const btn of btns) {
                    // 排除面板内的按钮
                    if (btn.closest('.yxb-panel')) continue;
                    const text = btn.textContent.trim();
                    // 必须是提交相关按钮
                    if (/提交|确定|交卷|保存答案/i.test(text) && !/取消|返回|上一题|下一题/i.test(text)) {
                        // 确保按钮没有被禁用
                        if (!btn.disabled && !btn.classList.contains('is-disabled')) {
                            addLog(`点击提交: ${text}`, 'info');
                            btn.click();
                            return true;
                        }
                    }
                }
            }
            return false;
        },

        // ---- 处理提交后的弹窗/结果 ----
        async _handlePostSubmit() {
            // 等待弹窗出现
            await sleep(1500);

            // 检查是否有结果弹窗（Element UI Dialog）
            const dialog = $('.el-dialog__wrapper, .v-modal, .el-message-box__wrapper');
            if (dialog) {
                addLog('检测到结果弹窗', 'info');
                // 查找弹窗中的确认/关闭/下一题按钮
                const dialogBtns = dialog.querySelectorAll('button');
                for (const btn of dialogBtns) {
                    const text = btn.textContent.trim();
                    if (/确定|知道了|下一题|下一节|继续|关闭|完成/i.test(text)) {
                        addLog(`关闭弹窗: ${text}`, 'info');
                        btn.click();
                        await sleep(1000);
                        break;
                    }
                }
            }

            // 检查是否有"下一题"按钮（非弹窗内的）
            await sleep(500);
            const nextBtnSelectors = [
                'button.el-button--primary',
                '.next-btn', '.btn-next',
            ];
            for (const sel of nextBtnSelectors) {
                const btns = $$(sel);
                for (const btn of btns) {
                    const text = btn.textContent.trim();
                    if (/下一题|下一节|继续学习|继续/i.test(text)) {
                        addLog(`点击: ${text}`, 'info');
                        btn.click();
                        return;
                    }
                }
            }
        },

        // ---- 跳转到下一个知识点 ----
        async jumpToNext() {
            await sleep(1000);
            const pointBoxes = getPointBoxes();
            if (pointBoxes.length === 0) return false;

            // 找到当前正在播放/选中的节点
            const currentName = getCurrentPlayingName();
            let currentIdx = -1;
            const names = getPointNames();
            for (let i = 0; i < names.length; i++) {
                if (names[i].textContent.trim() === currentName) {
                    currentIdx = i;
                    break;
                }
            }

            // 如果找不到当前节点，尝试找第一个未完成的
            if (currentIdx === -1) {
                for (let i = 0; i < pointBoxes.length; i++) {
                    if (getProgress(i) < 100) {
                        currentIdx = i;
                        break;
                    }
                }
            }

            // 点击下一个节点
            if (currentIdx >= 0 && currentIdx < pointBoxes.length - 1) {
                // 找下一个未完成的
                for (let i = currentIdx + 1; i < pointBoxes.length; i++) {
                    if (getProgress(i) < 100) {
                        addLog(`跳转到下一节: ${names[i]?.textContent?.trim() || '第' + (i + 1) + '节'}`, 'info');
                        clickPoint(i);
                        return true;
                    }
                }
            }

            // 兜底：点击第一个未完成的
            for (let i = 0; i < pointBoxes.length; i++) {
                if (getProgress(i) < 100) {
                    clickPoint(i);
                    return true;
                }
            }

            return false;
        },
    };

    // ============================================================
    //  搜索结果解析 v3 - 更精准
    // ============================================================
    function parseSearchResultV3(html, originalQuestion) {
        // 清理HTML
        const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ');

        const candidates = [];

        // ---- 模式1: 高置信度 - "答案：A" 格式 ----
        const highConfPatterns = [
            /(?:正确答案|标准答案|参考答案)[是为：:\s]*([A-F])(?:[.,、\s]|$)/gi,
            /答案[是为：:\s]*([A-F])(?:[.,、\s]|$)/gi,
        ];
        for (const p of highConfPatterns) {
            let m;
            while ((m = p.exec(text)) !== null) {
                candidates.push({ answer: m[1].toUpperCase(), confidence: 0.9, source: 'direct' });
            }
        }

        // ---- 模式2: "选A" / "应选A" 格式 ----
        const selectPatterns = [
            /(?:应该?选|应选|选)[是为：:\s]*([A-F])(?:[.,、\s]|$)/gi,
            /(?:选|应该选)[是为：:\s]*([A-F])[.、．号]?/gi,
        ];
        for (const p of selectPatterns) {
            let m;
            while ((m = p.exec(text)) !== null) {
                candidates.push({ answer: m[1].toUpperCase(), confidence: 0.75, source: 'select' });
            }
        }

        // ---- 模式3: "A是对的" / "A为正确" 格式 ----
        const reversePatterns = [
            /([A-F])[是为：\s]*(?:正确|对的|是答案|为正确)/gi,
        ];
        for (const p of reversePatterns) {
            let m;
            while ((m = p.exec(text)) !== null) {
                candidates.push({ answer: m[1].toUpperCase(), confidence: 0.7, source: 'reverse' });
            }
        }

        // ---- 模式4: 多选题 "AB" / "A,B" / "A、B" 格式 ----
        const multiPatterns = [
            /(?:正确答案|答案|选)[是为：:\s]*([A-F][,，、.][A-F][,，、.]?[A-F]?)/gi,
            /(?:正确答案|答案|选)[是为：:\s]*([A-F]{2,4})/gi,
        ];
        for (const p of multiPatterns) {
            let m;
            while ((m = p.exec(text)) !== null) {
                let ans = m[1].toUpperCase().replace(/[^A-F]/g, '');
                // 去重排序
                ans = [...new Set(ans.split(''))].sort().join('');
                if (ans.length >= 2 && ans.length <= 4) {
                    candidates.push({ answer: ans, confidence: 0.8, source: 'multi' });
                }
            }
        }

        // ---- 模式5: 判断题 ----
        if (/判断|对错|正确.*错误/i.test(originalQuestion)) {
            const judgePatterns = [
                /(?:正确答案|答案|结果是)[是为：:\s]*(正确|错误|对|错|是|否|√|×)/i,
            ];
            for (const p of judgePatterns) {
                const m = text.match(p);
                if (m) {
                    const ans = m[1].trim();
                    const normalized = /正确|对|是|√|true/i.test(ans) ? '正确' : '错误';
                    candidates.push({ answer: normalized, confidence: 0.85, source: 'judge' });
                }
            }
        }

        // ---- 模式6: 填空题 ----
        const fillPatterns = [
            /(?:答案|填空)[是为：:\s]*["""]?([^"""<\n,，;；!！?？]{2,30}?)["""]?(?:[。，;！!?\s]|$)/i,
            /(?:答案是|答案为|答案：)[\s]*["""]?([^"""<\n,，;；!！?？]{2,30}?)["""]?/i,
        ];
        for (const p of fillPatterns) {
            const m = text.match(p);
            if (m) {
                const ans = m[1].trim();
                if (ans.length >= 1 && ans.length <= 30) {
                    candidates.push({ answer: ans, confidence: 0.6, source: 'fill' });
                }
            }
        }

        if (candidates.length === 0) return null;

        // 投票：统计每个答案的出现次数和置信度
        const votes = {};
        for (const c of candidates) {
            const key = c.answer.toUpperCase();
            if (!votes[key]) votes[key] = { answer: c.answer, totalConf: 0, count: 0 };
            votes[key].totalConf += c.confidence;
            votes[key].count++;
        }

        // 选出最佳答案
        let best = null, bestScore = 0;
        for (const [key, v] of Object.entries(votes)) {
            // 加权分数：出现次数 * 平均置信度
            const score = v.count * (v.totalConf / v.count);
            if (score > bestScore) {
                bestScore = score;
                best = { answer: v.answer, confidence: Math.min(score, 1), votes: v.count };
            }
        }

        // 最终验证
        if (best) {
            const ans = best.answer;
            // 答案不能和题目一样
            if (ans === originalQuestion) return null;
            // 纯字母答案长度不能超过4（多选上限）
            if (/^[A-F]+$/.test(ans) && ans.length > 4) return null;
            // 文字答案不能太长
            if (ans.length > 30) return null;
            // 至少需要1票
            if (best.votes < 1) return null;
        }

        return best;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ============================================================
    //  防卡顿模块 v2 - 主动缓冲策略
    //  核心思路：监控前方缓冲量，缓冲不足时主动降速，充足时平滑提速
    // ============================================================
    const AntiBuffer = {
        init(video) {
            if (!video || !CONFIG.bufferDetect) return;

            // 监听缓冲事件
            video.addEventListener('waiting', () => {
                STATE.isBuffering = true;
                STATE.lastBufferTime = Date.now();
                STATE.smoothSpeedUp = false;
                if (STATE.recoverTimer) { clearTimeout(STATE.recoverTimer); STATE.recoverTimer = null; }
            });

            video.addEventListener('playing', () => {
                if (STATE.isBuffering) {
                    STATE.isBuffering = false;
                    STATE.lastPlayTime = Date.now();
                    STATE.stallCount = 0;
                    // 缓冲结束后，延迟开始平滑提速
                    if (STATE.currentSpeed < STATE.targetSpeed) {
                        if (STATE.recoverTimer) clearTimeout(STATE.recoverTimer);
                        STATE.recoverTimer = setTimeout(() => {
                            STATE.smoothSpeedUp = true;
                            STATE.recoverTimer = null;
                        }, CONFIG.recoverDelay);
                    }
                }
            });

            video.addEventListener('canplay', () => {
                STATE.isBuffering = false;
                STATE.lastPlayTime = Date.now();
            });

            // 定时检测缓冲状态
            if (STATE.bufferCheckTimer) clearInterval(STATE.bufferCheckTimer);
            STATE.bufferCheckTimer = setInterval(() => this.check(video), CONFIG.speedCheckInterval);
        },

        // 获取视频前方已缓冲的秒数
        getBufferedAhead(video) {
            if (!video || !video.buffered || video.buffered.length === 0) return 0;
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            return Math.max(0, bufferedEnd - video.currentTime);
        },

        // 设置倍速（带边界保护）
        applySpeed(video, newSpeed) {
            newSpeed = Math.round(newSpeed * 10) / 10; // 保留一位小数
            newSpeed = Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxSpeed, newSpeed));
            if (Math.abs(newSpeed - video.playbackRate) < 0.05) return; // 变化太小不设置
            video.playbackRate = newSpeed;
            STATE.currentSpeed = newSpeed;
            updateSpeedUI();
        },

        check(video) {
            if (!video || !STATE.isRunning || !CONFIG.bufferDetect) return;

            const bufferedAhead = this.getBufferedAhead(video);
            const now = Date.now();

            // ---- 严重卡顿处理：视频长时间无进展 ----
            if (STATE.isBuffering) {
                const stallDuration = (now - STATE.lastBufferTime) / 1000;

                // 严重卡顿：超过阈值
                if (stallDuration > CONFIG.stallThreshold) {
                    // 防止日志刷屏（至少间隔5秒才打一次）
                    if (now - STATE.lastStallLogTime > 5000) {
                        addLog(`⚠ 缓冲 ${stallDuration.toFixed(0)}s，前方缓冲 ${bufferedAhead.toFixed(1)}s`, 'warn');
                        STATE.lastStallLogTime = now;
                    }

                    // 立即大幅降速
                    if (STATE.currentSpeed > CONFIG.minSpeed) {
                        const newSpeed = Math.max(CONFIG.minSpeed, STATE.currentSpeed - CONFIG.speedDownStep * 2);
                        this.applySpeed(video, newSpeed);
                    }

                    // 强制 seek 触发预加载（往前跳0.5秒）
                    if (CONFIG.forceSeekOnStall && video.currentTime > 1) {
                        video.currentTime = video.currentTime - 0.5;
                    }

                    // 确保视频在播放
                    if (video.paused) video.play().catch(() => {});
                }
                return;
            }

            // ---- 主动缓冲策略：基于前方缓冲量调节倍速 ----

            // 缓冲严重不足（<3秒）：立即大幅降速
            if (bufferedAhead < 3) {
                if (STATE.currentSpeed > CONFIG.minSpeed) {
                    const newSpeed = Math.max(CONFIG.minSpeed, STATE.currentSpeed - CONFIG.speedDownStep * 2);
                    this.applySpeed(video, newSpeed);
                    if (now - STATE.lastStallLogTime > 5000) {
                        addLog(`缓冲不足 (${bufferedAhead.toFixed(1)}s)，降速至 ${STATE.currentSpeed}x`, 'warn');
                        STATE.lastStallLogTime = now;
                    }
                }
                STATE.smoothSpeedUp = false;
                return;
            }

            // 缓冲不足（<bufferAhead）：降速
            if (bufferedAhead < CONFIG.bufferAhead) {
                if (STATE.currentSpeed > CONFIG.minSpeed + 0.5) {
                    const newSpeed = Math.max(CONFIG.minSpeed, STATE.currentSpeed - CONFIG.speedDownStep);
                    this.applySpeed(video, newSpeed);
                }
                STATE.smoothSpeedUp = false;
                return;
            }

            // 缓冲充足（>bufferFull）：开始平滑提速
            if (bufferedAhead > CONFIG.bufferFull && STATE.smoothSpeedUp && STATE.currentSpeed < STATE.targetSpeed) {
                const newSpeed = Math.min(STATE.targetSpeed, STATE.currentSpeed + CONFIG.speedUpStep);
                this.applySpeed(video, newSpeed);
                if (STATE.currentSpeed >= STATE.targetSpeed) {
                    STATE.smoothSpeedUp = false;
                    addLog(`缓冲充足，已恢复至 ${STATE.targetSpeed}x`, 'info');
                }
                return;
            }

            // 缓冲适中：保持当前倍速，不做调整
        }
    };

    function updateSpeedUI() {
        const slider = $('#yxb-speed-slider');
        const label = $('#yxb-speed-value');
        if (slider) slider.value = STATE.currentSpeed;
        if (label) label.textContent = STATE.currentSpeed + 'x';
    }

    // ============================================================
    //  面板创建
    // ============================================================
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'yxb-panel';
        panel.innerHTML = `
            <div class="yxb-mini-icon">☁</div>
            <div class="yxb-header">
                <div class="yxb-header-left">
                    <div class="yxb-logo">☁</div>
                    <div class="yxb-title-group">
                        <span class="yxb-title">云学伴</span>
                        <span class="yxb-subtitle">智能刷课助手</span>
                    </div>
                </div>
                <div class="yxb-header-actions">
                    <button class="yxb-btn-icon" id="yxb-minimize" title="最小化">−</button>
                </div>
            </div>
            <div class="yxb-body">
                <div class="yxb-status">
                    <div class="yxb-status-dot" id="yxb-dot"></div>
                    <div class="yxb-status-text" id="yxb-status-text">等待启动</div>
                </div>
                <div class="yxb-progress-wrap">
                    <div class="yxb-progress-label">
                        <span>总进度</span>
                        <span id="yxb-progress-pct">0%</span>
                    </div>
                    <div class="yxb-progress-bar">
                        <div class="yxb-progress-fill" id="yxb-progress-fill"></div>
                    </div>
                </div>
                <div class="yxb-stats">
                    <div class="yxb-stat">
                        <div class="yxb-stat-value" id="yxb-stat-done">0</div>
                        <div class="yxb-stat-label">已完成</div>
                    </div>
                    <div class="yxb-stat">
                        <div class="yxb-stat-value" id="yxb-stat-left">0</div>
                        <div class="yxb-stat-label">剩余</div>
                    </div>
                    <div class="yxb-stat">
                        <div class="yxb-stat-value" id="yxb-stat-time">0:00</div>
                        <div class="yxb-stat-label">已用时</div>
                    </div>
                </div>
                <div class="yxb-now-playing" id="yxb-now-playing">
                    <span class="yxb-now-playing-icon">▶</span>
                    <span class="yxb-now-playing-text" id="yxb-now-text">-</span>
                </div>
                <div class="yxb-controls">
                    <button class="yxb-btn yxb-btn-primary" id="yxb-btn-toggle">▶ 开始刷课</button>
                    <button class="yxb-btn-sound" id="yxb-btn-sound" title="声音开关">🔊</button>
                    <button class="yxb-btn yxb-btn-secondary" id="yxb-btn-reset">↻</button>
                </div>
                <div class="yxb-settings">
                    <div class="yxb-setting">
                        <span class="yxb-setting-label">播放倍速</span>
                        <div class="yxb-speed-control">
                            <input type="range" class="yxb-speed-slider" id="yxb-speed-slider"
                                   min="1" max="16" step="0.5" value="16">
                            <span class="yxb-speed-value" id="yxb-speed-value">16x</span>
                        </div>
                    </div>
                    <div class="yxb-setting">
                        <span class="yxb-setting-label">自动搜题答题</span>
                        <div class="yxb-toggle active" id="yxb-toggle-answer"></div>
                    </div>
                    <div class="yxb-setting">
                        <span class="yxb-setting-label">搜题引擎</span>
                        <div class="yxb-setting-control">
                            <select class="yxb-select" id="yxb-search-engine">
                                <option value="baidu">百度</option>
                                <option value="bing">必应</option>
                            </select>
                        </div>
                    </div>
                    <div class="yxb-answer-stats">
                        <div class="yxb-answer-stat">
                            <div class="yxb-answer-stat-value" id="yxb-as-searched">0</div>
                            <div class="yxb-answer-stat-label">已搜索</div>
                        </div>
                        <div class="yxb-answer-stat">
                            <div class="yxb-answer-stat-value" id="yxb-as-found">0</div>
                            <div class="yxb-answer-stat-label">已找到</div>
                        </div>
                        <div class="yxb-answer-stat">
                            <div class="yxb-answer-stat-value" id="yxb-as-filled">0</div>
                            <div class="yxb-answer-stat-label">已填入</div>
                        </div>
                    </div>
                </div>
                <div class="yxb-log" id="yxb-log"></div>
                <div class="yxb-footer">
                    <div class="yxb-footer-copy">© 2026 霖尘云客工作室</div>
                    <div>1400189243@qq.com</div>
                    <div class="yxb-footer-warn">未经授权禁止复制/修改/分发 · 侵权必究</div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        bindEvents(panel);
        return panel;
    }

    // ============================================================
    //  事件绑定
    // ============================================================
    function bindEvents(panel) {
        panel.querySelector('#yxb-minimize').addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.add('minimized');
        });
        // 点击最小化图标恢复面板
        panel.querySelector('.yxb-mini-icon').addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.remove('minimized');
        });
        // 点击面板空白区域也恢复
        panel.addEventListener('click', (e) => {
            if (panel.classList.contains('minimized')) {
                panel.classList.remove('minimized');
            }
        });

        panel.querySelector('#yxb-btn-toggle').addEventListener('click', () => {
            STATE.isRunning ? pause() : start();
        });

        panel.querySelector('#yxb-btn-reset').addEventListener('click', reset);

        panel.querySelector('#yxb-btn-sound').addEventListener('click', (e) => {
            CONFIG.autoMute = !CONFIG.autoMute;
            const btn = e.currentTarget;
            const video = $('video');
            if (video) video.muted = CONFIG.autoMute;
            btn.textContent = CONFIG.autoMute ? '🔇' : '🔊';
            btn.classList.toggle('muted', CONFIG.autoMute);
            addLog(`声音: ${CONFIG.autoMute ? '已静音' : '已开启'}`, 'info');
        });

        const slider = panel.querySelector('#yxb-speed-slider');
        const speedLabel = panel.querySelector('#yxb-speed-value');
        slider.addEventListener('input', (e) => {
            const rate = parseFloat(e.target.value);
            CONFIG.playbackRate = rate;
            STATE.currentSpeed = rate;
            STATE.targetSpeed = rate;
            speedLabel.textContent = rate + 'x';
            const video = $('video');
            if (video) video.playbackRate = rate;
        });
        slider.addEventListener('change', () => addLog(`倍速设为 ${CONFIG.playbackRate}x`, 'info'));

        panel.querySelector('#yxb-toggle-answer').addEventListener('click', (e) => {
            CONFIG.autoAnswer = !CONFIG.autoAnswer;
            e.currentTarget.classList.toggle('active', CONFIG.autoAnswer);
            addLog(`自动答题: ${CONFIG.autoAnswer ? '开启' : '关闭'}`, 'info');
        });

        panel.querySelector('#yxb-search-engine').addEventListener('change', (e) => {
            CONFIG.searchEngine = e.target.value;
            addLog(`搜题引擎: ${CONFIG.searchEngine === 'baidu' ? '百度' : '必应'}`, 'info');
        });
    }

    // ============================================================
    //  UI 更新
    // ============================================================
    function updateUI() {
        const dot = $('#yxb-dot');
        const statusText = $('#yxb-status-text');
        const btn = $('#yxb-btn-toggle');
        const progressFill = $('#yxb-progress-fill');
        const progressPct = $('#yxb-progress-pct');
        const statDone = $('#yxb-stat-done');
        const statLeft = $('#yxb-stat-left');
        const statTime = $('#yxb-stat-time');
        const nowPlaying = $('#yxb-now-playing');
        const nowText = $('#yxb-now-text');
        const asSearched = $('#yxb-as-searched');
        const asFound = $('#yxb-as-found');
        const asFilled = $('#yxb-as-filled');

        dot.className = 'yxb-status-dot';
        if (STATE.isAnswering) dot.classList.add('answering');
        else if (STATE.isRunning) dot.classList.add('running');
        else if (STATE.statusText.includes('完成')) dot.classList.add('done');
        else if (STATE.statusText.includes('暂停')) dot.classList.add('paused');

        statusText.textContent = STATE.statusText;
        btn.innerHTML = STATE.isRunning ? '⏸ 暂停' : '▶ 开始刷课';

        const total = STATE.totalVideos || STATE.totalNodes;
        const pct = total > 0 ? Math.round((STATE.completedCount / total) * 100) : 0;
        progressFill.style.width = pct + '%';
        progressPct.textContent = pct + '%';

        statDone.textContent = STATE.completedCount;
        statLeft.textContent = Math.max(0, total - STATE.completedCount);
        if (STATE.startTime) {
            statTime.textContent = formatTime(Math.floor((Date.now() - STATE.startTime) / 1000));
        }

        if (asSearched) asSearched.textContent = STATE.answerStats.searched;
        if (asFound) asFound.textContent = STATE.answerStats.found;
        if (asFilled) asFilled.textContent = STATE.answerStats.filled;

        const playingName = getCurrentPlayingName();
        if (playingName && STATE.isRunning) {
            nowPlaying.style.display = 'flex';
            nowText.textContent = playingName;
        } else if (!STATE.isRunning) {
            nowPlaying.style.display = 'none';
        }
    }

    function addLog(msg, type = '') {
        const logEl = $('#yxb-log');
        if (!logEl) return;
        const item = document.createElement('div');
        item.className = 'yxb-log-item ' + type;
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        item.textContent = `[${time}] ${msg}`;
        logEl.appendChild(item);
        logEl.scrollTop = logEl.scrollHeight;
        while (logEl.children.length > 60) logEl.removeChild(logEl.firstChild);
    }

    // ============================================================
    //  核心逻辑
    // ============================================================
    function getCurrentPlayingName() {
        const el = $('.playing-name');
        return el ? el.textContent.trim() : '';
    }
    function getPointBoxes() { return $$('.point-text-box'); }
    function getProgressBoxes() { return $$('.point-progress-box'); }
    function getPointNames() { return $$('.point-text.ellipsis'); }

    function isExercisePage() {
        // 方法1: 检测传智播客平台习题页的实际 DOM 结构
        const exerciseIndicators = [
            '.questions-lists-box',     // 传智播客习题容器（最可靠）
            '.questions-type-title',    // "单选题：" 标题
            '.question-info-box',       // 题目信息框
            '.question-option-item',    // 选项项
            '.topic-item', '.topic-content',
            '.exercise-content', '.exercise-item',
            '.exam-content', '.topic-list',
        ];
        for (const sel of exerciseIndicators) {
            const el = $(sel);
            if (el && !el.closest('.yxb-panel')) return true;
        }

        // 方法2: 检测 el-radio-group（题目选项组）
        const radioGroups = $$('.el-radio-group');
        for (const rg of radioGroups) {
            if (!rg.closest('.yxb-panel')) return true;
        }

        // 方法3: 检测 el-checkbox-group（多选题选项组）
        const checkboxGroups = $$('.el-checkbox-group');
        for (const cg of checkboxGroups) {
            if (!cg.closest('.yxb-panel')) return true;
        }

        // 方法4: 没有视频播放器且有内容
        const video = $('video');
        if (!video) {
            const hasContent = $('.el-form, [class*="question"], [class*="exercise"], [class*="topic"]');
            if (hasContent && !hasContent.closest('.yxb-panel')) return true;
        }

        return false;
    }

    function getProgress(index) {
        const boxes = getProgressBoxes();
        if (boxes[index]) {
            const match = boxes[index].textContent.trim().match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }
        return -1;
    }

    function findCurrentIndex() {
        const playingName = getCurrentPlayingName();
        const names = getPointNames();
        for (let i = 0; i < names.length; i++) {
            if (names[i].textContent.trim() === playingName) return i;
        }
        return -1;
    }

    function clickPoint(index) {
        const boxes = getPointBoxes();
        if (boxes[index]) { boxes[index].click(); return true; }
        return false;
    }

    function setPlaybackRate(rate) {
        const video = $('video');
        if (video) {
            video.playbackRate = rate;
            STATE.currentSpeed = rate;
            STATE.targetSpeed = rate;
            STATE.isBuffering = false;
            STATE.smoothSpeedUp = false;
            STATE.stallCount = 0;
            if (CONFIG.autoMute) video.muted = true;
            // 初始化防卡顿监听（每个新 video 元素都重新初始化）
            if (!video._yxbAntiBufferInit) {
                video._yxbAntiBufferInit = true;
                AntiBuffer.init(video);
            }
        }
    }

    function playVideo() {
        const video = $('video');
        if (video && video.paused) {
            video.play().catch(() => {}).then(() => {
                // 播放成功后初始化防卡顿
                if (!video._yxbAntiBufferInit) {
                    video._yxbAntiBufferInit = true;
                    AntiBuffer.init(video);
                }
                STATE.lastPlayTime = Date.now();
            });
        }
    }

    // ============================================================
    //  主循环
    // ============================================================
    let loopTimer = null;

    async function mainLoop() {
        if (!STATE.isRunning) return;

        try {
            const pointBoxes = getPointBoxes();
            STATE.totalNodes = pointBoxes.length;

            if (STATE.totalNodes === 0) {
                STATE.statusText = '等待页面加载...';
                updateUI();
                loopTimer = setTimeout(mainLoop, 3000);
                return;
            }

            // 统计完成数
            let completed = 0, videoCount = 0;
            for (let i = 0; i < STATE.totalNodes; i++) {
                if (getProgress(i) >= 100) completed++;
                const name = getPointNames()[i];
                if (name && !name.textContent.includes('习题')) videoCount++;
            }
            STATE.completedCount = completed;
            STATE.totalVideos = videoCount;

            // 习题检测
            if (isExercisePage()) {
                if (CONFIG.autoAnswer) {
                    STATE.statusText = '检测到习题，自动答题中...';
                    updateUI();
                    addLog('检测到习题页面', 'answer');

                    const answered = await AnswerEngine.autoAnswer();

                    if (answered) {
                        addLog('答题完成，准备跳转...', 'success');
                        STATE.statusText = '答题完成，跳转下一节...';
                    } else {
                        addLog('未能找到答案，跳过此节', 'warn');
                        STATE.statusText = '未找到答案，跳转...';
                    }
                    updateUI();

                    // 使用新的跳转方法
                    await sleep(CONFIG.answerWait);
                    const jumped = await AnswerEngine.jumpToNext();
                    if (!jumped) {
                        addLog('没有更多未完成的节点', 'warn');
                    }
                    loopTimer = setTimeout(mainLoop, CONFIG.nextWait + 2000);
                    return;
                } else {
                    STATE.statusText = '跳过习题...';
                    updateUI();
                    addLog('跳过习题（自动答题已关闭）', 'warn');
                    await sleep(CONFIG.nextWait);
                    const jumped = await AnswerEngine.jumpToNext();
                    if (!jumped) {
                        addLog('没有更多未完成的节点', 'warn');
                    }
                    loopTimer = setTimeout(mainLoop, CONFIG.nextWait + 2000);
                    return;
                }
            }

            const currentIdx = findCurrentIndex();

            if (currentIdx === -1) {
                STATE.statusText = '寻找未完成的视频...';
                updateUI();
                for (let i = 0; i < STATE.totalNodes; i++) {
                    if (getProgress(i) < 100) { clickPoint(i); break; }
                }
                loopTimer = setTimeout(mainLoop, CONFIG.checkInterval * 3);
                return;
            }

            STATE.currentIndex = currentIdx;
            const progress = getProgress(currentIdx);
            const pointName = getCurrentPlayingName() || `第${currentIdx + 1}节`;

            if (progress >= 100) {
                addLog(`${pointName} ✓ 完成`, 'success');
                STATE.statusText = `已完成 ${completed}/${videoCount}`;

                if (currentIdx < STATE.totalNodes - 1) {
                    let nextIdx = -1;
                    for (let i = currentIdx + 1; i < STATE.totalNodes; i++) {
                        if (getProgress(i) < 100) { nextIdx = i; break; }
                    }
                    if (nextIdx >= 0) {
                        setTimeout(() => clickPoint(nextIdx), CONFIG.nextWait);
                    } else {
                        let allDone = true;
                        for (let i = 0; i < STATE.totalNodes; i++) {
                            if (getProgress(i) < 100) { allDone = false; break; }
                        }
                        if (allDone) {
                            STATE.isRunning = false;
                            STATE.statusText = `🎉 全部完成！共 ${completed} 个`;
                            addLog('🎉 所有视频播放完成！', 'success');
                            updateUI(); return;
                        }
                    }
                } else {
                    STATE.isRunning = false;
                    STATE.statusText = `🎉 全部完成！共 ${completed} 个`;
                    addLog('🎉 所有视频播放完成！', 'success');
                    updateUI(); return;
                }
            } else {
                STATE.statusText = `播放中 ${currentIdx + 1}/${STATE.totalNodes} (${progress}%)`;
                const video = $('video');
                if (video) {
                    if (video.paused) playVideo();
                    // 不要强制覆盖倍速，让 AntiBuffer 模块管理
                    // 只在倍速为1（默认值）或被外部重置时才设置目标倍速
                    if (video.playbackRate <= 1 && STATE.targetSpeed > 1) {
                        setPlaybackRate(STATE.targetSpeed);
                    }
                    if (CONFIG.autoMute && !video.muted) video.muted = true;
                }
            }

        } catch (e) {
            addLog('错误: ' + e.message, 'error');
        }

        updateUI();
        loopTimer = setTimeout(mainLoop, CONFIG.checkInterval);
    }

    // ============================================================
    //  控制
    // ============================================================
    function start() {
        if (STATE.isRunning) return;
        STATE.isRunning = true;
        if (!STATE.startTime) STATE.startTime = Date.now();
        addLog('🚀 开始自动刷课', 'info');
        addLog(`倍速: ${CONFIG.playbackRate}x | 自动答题: ${CONFIG.autoAnswer ? '开启' : '关闭'}`, 'info');
        addLog('© 2026 霖尘云客工作室 | 侵权必究', 'info');
        updateUI();
        mainLoop();
    }

    function pause() {
        STATE.isRunning = false;
        if (loopTimer) clearTimeout(loopTimer);
        STATE.statusText = '已暂停';
        addLog('⏸ 已暂停', 'warn');
        updateUI();
    }

    function reset() {
        pause();
        STATE.completedCount = 0;
        STATE.currentIndex = -1;
        STATE.startTime = null;
        STATE.answerStats = { searched: 0, found: 0, filled: 0 };
        STATE.statusText = '已重置';
        addLog('↻ 已重置', 'info');
        updateUI();
    }

    // ============================================================
    //  初始化
    // ============================================================
    function init() {
        const waitForPage = setInterval(() => {
            const pointBoxes = getPointBoxes();
            if (pointBoxes.length > 0) {
                clearInterval(waitForPage);
                STATE.totalNodes = pointBoxes.length;
                for (let i = 0; i < pointBoxes.length; i++) {
                    if (getProgress(i) >= 100) STATE.completedCount++;
                }
                createPanel();
                const soundBtn = $('#yxb-btn-sound');
                if (soundBtn && CONFIG.autoMute) {
                    soundBtn.textContent = '🔇';
                    soundBtn.classList.add('muted');
                }
                updateUI();
                addLog(`检测到 ${STATE.totalNodes} 个知识点`, 'info');
                addLog(`已完成 ${STATE.completedCount} 个`, 'info');
                if (CONFIG.autoStart) setTimeout(start, 2000);
            }
        }, 1000);

        setTimeout(() => {
            if (STATE.totalNodes === 0) {
                clearInterval(waitForPage);
                createPanel();
                addLog('未检测到课程节点，请确认在正确的页面', 'error');
                STATE.statusText = '未检测到课程';
                updateUI();
            }
        }, 30000);
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
