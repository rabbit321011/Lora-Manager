export class TagEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.suggestions = null;
        this.state = {
            framework: '',
            platform: '',
            style: '',
            extraTags: []
        };
    }

    async init() {
        try {
            const res = await fetch('/api/tags/suggestions');
            const json = await res.json();
            if (json.success) {
                this.suggestions = json.data;
                this.render();
            }
        } catch (e) {
            this.container.innerHTML = '<div style="color:red">Tag 加载失败</div>';
        }
    }

    getValue() {
        // 提交时，再次确保 state 和输入框显示的一致
        this._syncStateFromInput();
        return {
            name: document.getElementById('input-name')?.value || '',
            baseTags: {
                framework: this.state.framework || 'undefined',
                platform: this.state.platform || 'undefined',
                style: this.state.style || 'undefined'
            },
            extraTags: this.state.extraTags
        };
    }

    setValue(data) {
        if (data.baseTags) {
            this.state.framework = data.baseTags.framework === 'undefined' ? '' : data.baseTags.framework;
            this.state.platform = data.baseTags.platform === 'undefined' ? '' : data.baseTags.platform;
            this.state.style = data.baseTags.style === 'undefined' ? '' : data.baseTags.style;
        }
        if (data.extraTags) {
            this.state.extraTags = [...data.extraTags];
        }
        this.render();
    }

    render() {
        if (!this.suggestions) return;
        
        this.container.innerHTML = `
            <div class="tag-editor-section">
                ${this._renderSingleRow('框架', 'framework', this.suggestions.framework)}
                ${this._renderSingleRow('平台', 'platform', this.suggestions.platform)}
                ${this._renderSingleRow('画风', 'style', this.suggestions.style)}
                <hr style="border-color:#333; margin: 15px 0;">
                ${this._renderMultiSection('其他', this.suggestions.others)}
            </div>
        `;

        this._bindEvents();
        this._updateVisualState();
    }

    _renderSingleRow(label, key, tags) {
        const tagsHtml = tags.map(tag => 
            `<span class="tag-btn" data-key="${key}" data-val="${tag}">${tag}</span>`
        ).join('');

        return `
            <div class="tag-row single-select-row">
                <div class="tag-label">${label}</div>
                <div class="tag-input-wrapper">
                    <input type="text" class="tag-input" id="input-${key}" 
                           value="${this.state[key]}" placeholder="undefined" data-key="${key}">
                    ${tagsHtml}
                </div>
            </div>
        `;
    }

    _renderMultiSection(label, data) {
        const { recent, top } = data;
        const renderTags = (list, isTop) => list.map(tag => 
            `<span class="tag-btn ${isTop ? 'top-tag' : 'recent-tag'}" data-type="multi" data-val="${tag}">${tag}</span>`
        ).join('');

        return `
            <div class="tag-row">
                <div class="tag-label">${label}</div>
                <div class="multi-select-container">
                    <input type="text" id="input-extra-tags" class="tag-input" 
                           style="width: 100%; margin-bottom:5px;" 
                           value="${this.state.extraTags.join(', ')}" 
                           placeholder="点击下方 Tag 或手动输入 (逗号分隔)">
                    <div class="multi-row recent-row">${renderTags(recent, false)}</div>
                    <div class="multi-row top-stats-row">
                        <span style="font-size:10px; color:#555; align-self:center;">🔥 常用:</span>
                        ${renderTags(top, true)}
                    </div>
                </div>
            </div>
        `;
    }

    _bindEvents() {
        // 1. 单选输入框监听
        ['framework', 'platform', 'style'].forEach(key => {
            const input = this.container.querySelector(`#input-${key}`);
            if(input) {
                input.addEventListener('input', (e) => {
                    this.state[key] = e.target.value.trim();
                    this._updateVisualState();
                });
            }
        });

        // 2. 多选输入框监听 (仅更新 state，不重绘)
        const extraInput = this.container.querySelector('#input-extra-tags');
        if (extraInput) {
            extraInput.addEventListener('input', () => {
                this._syncStateFromInput(); // 手打时同步到 state
                this._updateVisualState(true); // 更新按钮高亮
            });
        }

        // 3. 点击事件 (核心修复逻辑)
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('.tag-btn');
            if (!btn) return;

            const val = btn.dataset.val;

            if (btn.dataset.type === 'multi') {
                // --- 修复后的多选逻辑 ---
                // 1. 先读取输入框里当前的内容 (防止覆盖用户手打到一半的字)
                let currentText = extraInput.value;
                // 2. 解析成数组 (兼容中英文逗号)
                let tags = currentText.split(/[,，]/).map(t => t.trim()).filter(t => t);
                
                // 3. 判断：有则删，无则加
                if (tags.includes(val)) {
                    tags = tags.filter(t => t !== val);
                } else {
                    tags.push(val);
                }

                // 4. 写回
                this.state.extraTags = tags;
                extraInput.value = tags.join(', ');
                this._updateVisualState(true);

            } else {
                // --- 单选逻辑 ---
                const key = btn.dataset.key;
                this.state[key] = val;
                this._updateVisualState();
            }
        });
    }

    // 辅助：从多选输入框同步 State
    _syncStateFromInput() {
        const input = this.container.querySelector('#input-extra-tags');
        if (input) {
            const val = input.value;
            this.state.extraTags = val.split(/[,，]/).map(t => t.trim()).filter(t => t);
        }
    }

    _updateVisualState(skipExtraInput = false) {
        // 更新单选区
        ['framework', 'platform', 'style'].forEach(key => {
            const val = this.state[key];
            const input = this.container.querySelector(`#input-${key}`);
            if (input && input.value !== val) input.value = val;
            
            this.container.querySelectorAll(`.tag-btn[data-key="${key}"]`).forEach(btn => {
                if (btn.dataset.val === val) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        });

        // 更新多选按钮高亮
        // 注意：这里我们根据 state.extraTags 来高亮，所以必须保证 state 已经同步了
        this.container.querySelectorAll(`.tag-btn[data-type="multi"]`).forEach(btn => {
            if (this.state.extraTags.includes(btn.dataset.val)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}