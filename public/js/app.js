import { TagEditor } from './components/TagEditor.js';
import { LibraryViewer } from './components/LibraryViewer.js';

// --- 全局 Toast 消息工具 ---
window.showToast = function(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-in forwards';
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 2000);
};

// --- 1. 初始化导入界面的组件 ---
const importTagEditor = new TagEditor('tag-editor-container');
importTagEditor.init();

const library = new LibraryViewer('library-container');
library.init();

// --- 2. 初始化编辑弹窗的组件 ---
// 我们复用 TagEditor 类，但挂载到弹窗里的容器上
const editTagEditor = new TagEditor('edit-tag-container');
editTagEditor.init(); // 也需要拉取 Tag 建议

// --- 3. 绑定导入逻辑 (保留之前的) ---
const loraInput = document.getElementById('file-lora');
const previewInput = document.getElementById('file-preview');
const fileInfoDiv = document.getElementById('file-info');

loraInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const name = file.name.substring(0, file.name.lastIndexOf('.'));
        document.getElementById('input-lora-name').value = name;
        fileInfoDiv.textContent = `已选: ${file.name}`;
    }
});
// --- 拖拽与文件处理逻辑 ---
function setupDropZone(dropZoneId, inputId, onFileCallback) {
    const dropZone = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);

    // 点击触发 input
    dropZone.addEventListener('click', () => input.click());

    // 拖拽视觉反馈
    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
    });

    // 监听 Drop
    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // 利用 DataTransfer 将拖拽的文件赋值给 input
            // 这样后续的 doImport 逻辑完全不用改
            input.files = files; 
            onFileCallback(files);
        }
    });

    // 监听 Input Change (点击上传)
    input.addEventListener('change', (e) => {
        if (input.files.length > 0) {
            onFileCallback(input.files);
        }
    });
}

// 1. 初始化 LoRA 拖拽区
setupDropZone('drop-lora', 'file-lora', (files) => {
    const file = files[0];
    // 自动填入名字
    const name = file.name.substring(0, file.name.lastIndexOf('.'));
    document.getElementById('input-lora-name').value = name;
    
    // 显示文件名 tag
    const nameTag = document.getElementById('lora-file-name');
    nameTag.textContent = file.name;
    nameTag.style.display = 'inline-block';
});

// 2. 初始化预览图拖拽区
setupDropZone('drop-preview', 'file-preview', (files) => {
    const dropZone = document.getElementById('drop-preview');
    const container = document.getElementById('preview-thumbs');
    const count = files.length;

    container.innerHTML = ''; // 清空旧图

    if (count > 0) {
        // 添加标记类，触发 CSS 变化（隐藏文字，显示 Grid）
        dropZone.classList.add('has-preview');
        
        // 设置 data-count 属性，触发不同的 Grid 布局
        if (count <= 4) {
            container.setAttribute('data-count', count.toString());
        } else {
            container.setAttribute('data-count', 'many');
        }

        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'thumb-img';
                container.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    } else {
        // 如果清空了文件，还原样式
        dropZone.classList.remove('has-preview');
        container.removeAttribute('data-count');
    }
});
window.doImport = async () => {
    const loraFile = loraInput.files[0];
    if (!loraFile) return window.showToast('请先选择 LoRA 文件', 'error');
    const previewFiles = previewInput.files;
    const name = document.getElementById('input-lora-name').value;
    const tagData = importTagEditor.getValue();

    const civitaiUrl = document.getElementById('input-civitai').value.trim();
    const triggerWords = document.getElementById('input-triggers').value.split(/[,，]/).map(t => t.trim()).filter(t => t);
    const remark = document.getElementById('input-remark').value.trim();

    const metadata = {
        ...tagData,
        name: name,
        civitaiUrl,
        triggerWords,
        remark
    };

    const formData = new FormData();
    formData.append('loraFile', loraFile);
    for (let i = 0; i < previewFiles.length; i++) formData.append('previewImages', previewFiles[i]);
    formData.append('metadata', JSON.stringify(metadata));

    const btn = document.querySelector('button.primary-btn');
    btn.textContent = '正在导入...'; btn.disabled = true;
    try {
        const res = await fetch('/api/import', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success) {
            window.showToast('导入成功！', 'success');
            location.reload();
        } else {
            window.showToast('错误: ' + result.message, 'error');
        }
    } catch (e) { window.showToast('请求失败: ' + e.message, 'error'); } 
    finally { btn.textContent = '开始导入'; btn.disabled = false; }
};


// --- 4. [新增] 编辑功能的全局逻辑 ---
let currentEditingPath = null; // 暂存当前正在编辑的 LoRA 路径

window.app = window.app || {};

// 打开弹窗并填充数据
window.app.editLora = (path) => {
    const loraData = library.loras.find(l => l._sys.dirPath === path);
    if (!loraData) return window.showToast('未找到该 LoRA 数据', 'error');

    currentEditingPath = path;
    
    document.getElementById('edit-civitai').value = loraData.civitaiUrl || '';
    document.getElementById('edit-triggers').value = (loraData.triggerWords || []).join(', ');
    document.getElementById('edit-remark').value = loraData.remark || '';

    editTagEditor.setValue({
        baseTags: loraData.baseTags,
        extraTags: loraData.extraTags
    });

    document.getElementById('edit-modal').style.display = 'block';
};

// 关闭弹窗
window.app.closeModal = () => {
    document.getElementById('edit-modal').style.display = 'none';
    currentEditingPath = null;
};

// 保存修改
window.app.saveEdit = async () => {
    if (!currentEditingPath) return;

    const newTags = editTagEditor.getValue();
    const originalData = library.loras.find(l => l._sys.dirPath === currentEditingPath);
    
    const newCivitai = document.getElementById('edit-civitai').value.trim();
    const newTriggers = document.getElementById('edit-triggers').value.split(/[,，]/).map(t => t.trim()).filter(t => t);
    const newRemark = document.getElementById('edit-remark').value.trim();

    const newMetadata = {
        ...originalData,
        baseTags: newTags.baseTags,
        extraTags: newTags.extraTags,
        civitaiUrl: newCivitai,
        triggerWords: newTriggers,
        remark: newRemark
    };

    if (!confirm('确定保存吗？')) return;

    try {
        const res = await fetch('/api/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                oldPath: currentEditingPath,
                metadata: newMetadata
            })
        });
        
        const json = await res.json();
        if (json.success) {
            window.showToast('更新成功', 'success');
            window.app.closeModal();
            library.reload();
        } else {
            window.showToast('失败: ' + json.message, 'error');
        }
    } catch (e) {
        window.showToast('请求失败', 'error');
    }
};

// 点击弹窗外部关闭
window.onclick = function(event) {
    const modal = document.getElementById('edit-modal');
    if (event.target == modal) {
        window.app.closeModal();
    }
};