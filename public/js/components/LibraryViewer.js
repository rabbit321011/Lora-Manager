import { TagEditor } from './TagEditor.js'; 

export class LibraryViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.loras = [];
        this.selectedPaths = new Set();
        this.isMultiSelectMode = false;
        this.viewMode = 'tree'; // 默认为 'tree' (目录树模式)
        this.filters = { must: [], include: [], exclude: [] };
        this.actionBar = document.getElementById('action-bar');
    }

    async init() {
        this.renderLayout(); 
        await this.reload();
        this._bindGlobalEvents();
        this._bindInternalEvents();
    }

    renderLayout() {
        this.container.innerHTML = `
            <div class="filter-panel">
                <div class="filter-row">
                    <div class="filter-label lbl-must">✅ 必须包含</div>
                    <input type="text" class="filter-input" data-type="must" placeholder="同时满足 (AND)">
                </div>
                <div class="filter-row">
                    <div class="filter-label lbl-include">⭕ 包含任意</div>
                    <input type="text" class="filter-input" data-type="include" placeholder="满足其一 (OR)">
                </div>
                <div class="filter-row">
                    <div class="filter-label lbl-exclude">🚫 排除</div>
                    <input type="text" class="filter-input" data-type="exclude" placeholder="排除 (NOT)">
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:10px;">
                    <div class="view-toggles">
                        <button class="toggle-btn ${this.viewMode === 'tree' ? 'active' : ''}" data-view="tree">📂 目录树</button>
                        <button class="toggle-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">▦ 平铺网格</button>
                    </div>
                    <div class="filter-stats" id="lib-stats">加载中...</div>
                </div>
            </div>

            <div id="main-content-area"></div>
        `;
    }

    async reload() {
        try {
            const res = await fetch('/api/library');
            const json = await res.json();
            if (json.success) {
                this.loras = json.data;
                this.refreshView();
            }
        } catch (e) { console.error(e); }
    }

    // 统一刷新入口
    refreshView() {
        const list = this.getFilteredLoras();
        document.getElementById('lib-stats').innerText = `显示 ${list.length} / ${this.loras.length}`;
        
        const mainArea = document.getElementById('main-content-area');
        
        if (list.length === 0) {
            mainArea.innerHTML = '<div style="color:#666; padding:20px; text-align:center;">没有符合条件的 LoRA</div>';
            return;
        }

        if (this.viewMode === 'tree') {
            this.renderTreeMode(list, mainArea);
        } else {
            this.renderGridMode(list, mainArea);
        }
        
        this._bindCardEvents(mainArea);
        this._updateActionBar();
    }

    // --- 模式 A: 平铺网格 ---
    renderGridMode(list, container) {
        container.className = 'lora-grid'; // CSS Grid
        container.innerHTML = list.map(lora => this._createCardHtml(lora)).join('');
    }

    // --- 模式 B: 目录树 (核心难点) ---
    renderTreeMode(list, container) {
        container.className = 'tree-container';
        
        // 1. 构建树结构
        const tree = {};
        list.forEach(lora => {
            // 按照 框架 > 平台 > 画风 的层级归类
            // 如果 Tag 是 undefined, 归类到 '未分类' 或者该 Tag 本身的名字
            const l1 = lora.baseTags.framework || 'Other';
            const l2 = lora.baseTags.platform || 'Other';
            const l3 = lora.baseTags.style || 'Other';

            if (!tree[l1]) tree[l1] = {};
            if (!tree[l1][l2]) tree[l1][l2] = {};
            if (!tree[l1][l2][l3]) tree[l1][l2][l3] = [];
            
            tree[l1][l2][l3].push(lora);
        });

        // 2. 递归渲染 HTML
        // 生成的结构：<details Framework> -> <details Platform> -> <div Grid>Cards</div>
        const buildHtml = (node, level) => {
            let html = '';
            for (const key in node) {
                const child = node[key];
                const isLeafArray = Array.isArray(child); // 如果是数组，说明到底了，是 LoRA 列表
                
                // 计算该节点下有多少个 LoRA (用于显示数字)
                const count = isLeafArray ? child.length : 'Folder'; 

                if (isLeafArray) {
                    // 到了最底层 (画风层)，渲染网格
                    const cards = child.map(lora => this._createCardHtml(lora)).join('');
                    html += `
                        <details class="tree-node" open>
                            <summary class="tree-summary">
                                <span>🎨 ${key}</span>
                                <span style="font-size:12px; color:#666; font-weight:normal;">${child.length} 个</span>
                            </summary>
                            <div class="tree-content tree-grid">
                                ${cards}
                            </div>
                        </details>
                    `;
                } else {
                    // 还是文件夹 (框架/平台层)
                    const innerHtml = buildHtml(child, level + 1);
                    const icon = level === 0 ? '🏗️' : '💻'; // 每一层的图标
                    html += `
                        <details class="tree-node" open>
                            <summary class="tree-summary">
                                <span>${icon} ${key}</span>
                            </summary>
                            <div class="tree-content">
                                ${innerHtml}
                            </div>
                        </details>
                    `;
                }
            }
            return html;
        };

        container.innerHTML = buildHtml(tree, 0);
    }

    // 复用：卡片 HTML 生成
    _createCardHtml(lora) {
        const path = lora._sys.dirPath;
        const isSelected = this.selectedPaths.has(path);
        const cover = lora._sys.coverUrl || 'css/placeholder.png'; 
        const tagPills = [
            lora.baseTags.framework, lora.baseTags.platform, ...(lora.extraTags || [])
        ].slice(0, 4).map(t => `<span class="card-tag">${t}</span>`).join('');

        let extraBtns = '';
        
        if (lora.triggerWords && lora.triggerWords.length > 0) {
            const words = lora.triggerWords.join(', ');
            extraBtns += `<button class="btn-icon" title="复制激活词: ${words}" 
                onclick="event.stopPropagation(); navigator.clipboard.writeText('${words}').then(()=>window.showToast('已复制激活词', 'success'))">⚡</button>`;
        }

        if (lora.civitaiUrl) {
            extraBtns += `<button class="btn-icon" title="打开来源" 
                onclick="event.stopPropagation(); window.open('${lora.civitaiUrl}', '_blank')">🏠</button>`;
        }

        return `
            <div class="lora-card ${isSelected ? 'selected' : ''}" data-path="${path.replace(/"/g, '&quot;')}">
                <div class="card-checkbox ${this.isMultiSelectMode ? 'visible' : ''}">${isSelected ? '✔' : ''}</div>
                <div class="card-img" style="background-image: url('${cover}')"></div>
                <div class="card-info">
                    <div class="card-title" title="${lora.name}\n${lora.remark || ''}">${lora.name}</div>
                    <div class="card-tags">${tagPills}</div>
                </div>
                <div class="card-actions">
                    ${extraBtns} <div style="flex-grow:1"></div> <button class="btn-icon" onclick="window.app.openFolder('${path.replace(/\\/g, '\\\\')}')">📂</button>
                    <button class="btn-icon" onclick="window.app.editLora('${path.replace(/\\/g, '\\\\')}')">✏️</button>
                    <button class="btn-icon danger" onclick="window.app.deleteLora('${path.replace(/\\/g, '\\\\')}')">🗑️</button>
                </div>
            </div>
        `;
    }

    // --- 事件绑定 ---
    _bindInternalEvents() {
        // 筛选输入监听
        const inputs = this.container.querySelectorAll('.filter-input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const type = e.target.dataset.type;
                const val = e.target.value;
                this.filters[type] = val.split(/[,，]/).map(t => t.trim()).filter(t => t);
                this.refreshView();
            });
        });

        // 视图切换监听
        const toggles = this.container.querySelectorAll('.toggle-btn');
        toggles.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.viewMode = e.target.dataset.view;
                // 更新按钮样式
                toggles.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.refreshView();
            });
        });
    }

    _bindCardEvents(container) {
        container.querySelectorAll('.lora-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // 如果点的是按钮，或者不在多选模式，忽略
                if (e.target.tagName === 'BUTTON' || !this.isMultiSelectMode) return;

                const path = card.dataset.path;
                const checkbox = card.querySelector('.card-checkbox');

                // 1. 更新数据状态
                if (this.selectedPaths.has(path)) {
                    this.selectedPaths.delete(path);
                    // 2. 直接操作 DOM，不重绘
                    card.classList.remove('selected');
                    checkbox.innerHTML = ''; 
                } else {
                    this.selectedPaths.add(path);
                    // 2. 直接操作 DOM
                    card.classList.add('selected');
                    checkbox.innerHTML = '✔';
                }

                // 3. 更新底部统计栏
                this._updateActionBar();
            });
        });
    }

    // 筛选逻辑 (保持不变)
    getFilteredLoras() {
        if (this.filters.must.length === 0 && this.filters.include.length === 0 && this.filters.exclude.length === 0) return this.loras;
        return this.loras.filter(lora => {
            const allTags = new Set([lora.baseTags.framework, lora.baseTags.platform, lora.baseTags.style, ...(lora.extraTags || [])].filter(t => t && t !== 'undefined'));
            if (this.filters.must.length > 0 && !this.filters.must.every(t => allTags.has(t))) return false;
            if (this.filters.exclude.length > 0 && this.filters.exclude.some(t => allTags.has(t))) return false;
            if (this.filters.include.length > 0 && !this.filters.include.some(t => allTags.has(t))) return false;
            return true;
        });
    }

    // 全局事件绑定
    _bindGlobalEvents() {
        window.app = window.app || {};

        window.app.openFolder = async (path) => {
            try {
                const res = await fetch('/api/open', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ path })
                });
                const json = await res.json();
                if (!json.success) {
                    window.showToast(json.message, 'error');
                }
            } catch (e) {
                window.showToast('打开文件夹失败', 'error');
            }
        };

        window.app.deleteLora = async (path) => {
            if (!confirm('确定要删除这个 LoRA 吗？此操作不可恢复！')) return;
            await this._doDelete([path]);
        };

        window.app.batchDelete = async () => {
            if (this.selectedPaths.size === 0) {
                window.showToast('请先选择要删除的 LoRA', 'error');
                return;
            }
            if (!confirm(`确定要删除选中的 ${this.selectedPaths.size} 个 LoRA 吗？此操作不可恢复！`)) return;
            await this._doDelete(Array.from(this.selectedPaths));
        };

        window.app.toggleMultiSelect = () => {
            this.isMultiSelectMode = !this.isMultiSelectMode;
            this.selectedPaths.clear();
            this.refreshView();
            const btn = document.querySelector('button[onclick="window.app.toggleMultiSelect()"]');
            if (btn) {
                btn.textContent = this.isMultiSelectMode ? '❌ 退出多选' : '✅ 进入多选模式';
            }
        };

        window.app.exportPrompt = () => {
            const selected = Array.from(this.selectedPaths).map(path => {
                const lora = this.loras.find(l => l._sys.dirPath === path);
                return lora ? `<lora:${lora.name}>` : null;
            }).filter(Boolean);
            
            if (selected.length === 0) {
                window.showToast('请先选择要导出的 LoRA', 'error');
                return;
            }
            
            const prompt = selected.join(' ');
            navigator.clipboard.writeText(prompt).then(() => {
                window.showToast(`已复制 ${selected.length} 个 LoRA 提示词`, 'success');
            });
        };
    }
    
    // ... _doDelete, _updateActionBar 等辅助方法 (保持不变) ...
    async _doDelete(paths) { const res = await fetch('/api/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ paths }) }); const json = await res.json(); if(json.success){ this.selectedPaths.clear(); this.reload(); } else { window.showToast(json.message, 'error'); } }
    _updateActionBar() { if (!this.actionBar) return; this.actionBar.style.display = this.isMultiSelectMode ? 'flex' : 'none'; document.getElementById('selected-count').textContent = this.selectedPaths.size; }
}