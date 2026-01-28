// 在顶部添加
const { updateTagStats } = require('../utils/tagManager');
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto'); // 补全这行，防止运行时报错
const { generateLoraPath } = require('../utils/pathHelper');

// 1. Multer 配置
const upload = multer({ 
    dest: path.join(process.cwd(), 'temp') 
});

// 2. 字段定义
const cpUpload = upload.fields([
    { name: 'loraFile', maxCount: 1 }, 
    { name: 'previewImages', maxCount: 10 }
]);

// 3. 路由逻辑
router.post('/import', cpUpload, async (req, res) => {
    const tempFilesCleanup = [];
    if (req.files) {
        if (req.files.loraFile) tempFilesCleanup.push(...req.files.loraFile);
        if (req.files.previewImages) tempFilesCleanup.push(...req.files.previewImages);
    }

    try {
        if (!req.files || !req.files.loraFile) throw new Error('未上传 LoRA 模型文件');
        if (!req.body.metadata) throw new Error('缺少元数据');

        const configPath = path.join(process.cwd(), 'data', 'global-config.json');
        if (!await fs.pathExists(configPath)) throw new Error('全局配置文件不存在');
        
        const globalConfig = await fs.readJson(configPath);
        const rootPath = globalConfig.rootPath;

        let metadata;
        try { metadata = JSON.parse(req.body.metadata); } 
        catch (e) { throw new Error('metadata 必须为 JSON 格式'); }

        const targetDir = generateLoraPath(rootPath, metadata);
        await fs.ensureDir(targetDir);

        const loraFile = req.files.loraFile[0];
        const loraExt = path.extname(loraFile.originalname);
        const finalLoraName = metadata.name ? `${metadata.name}${loraExt}` : loraFile.originalname;
        await fs.move(loraFile.path, path.join(targetDir, finalLoraName), { overwrite: true });

        const previewFiles = req.files.previewImages || [];
        const processedImages = [];
        for (let i = 0; i < previewFiles.length; i++) {
            const ext = path.extname(previewFiles[i].originalname);
            const fileName = i === 0 ? `sample${ext}` : `sample_${i}${ext}`;
            await fs.move(previewFiles[i].path, path.join(targetDir, fileName), { overwrite: true });
            processedImages.push(fileName);
        }

        metadata.id = crypto.randomUUID();
        metadata.loraFile = finalLoraName;
        metadata.previewImages = processedImages;
        metadata.updatedAt = new Date().toISOString();
        
        await fs.writeJson(path.join(targetDir, 'info.json'), metadata, { spaces: 2 });
        // [新增] 更新全局 Tag 统计数据
        await updateTagStats({
            framework: metadata.baseTags.framework,
            platform: metadata.baseTags.platform,
            style: metadata.baseTags.style,
            extraTags: metadata.extraTags
        });

        res.json({ success: true, path: targetDir });

    } catch (error) {
        console.error('Import Error:', error);
        for (const file of tempFilesCleanup) {
            await fs.remove(file.path).catch(() => {});
        }
        res.status(500).json({ success: false, message: error.message });
    }
});
// --- [新增] 阶段五：高级操作接口 ---

// 引入原生子进程模块 (不需要 npm install，Node 自带)
const { exec } = require('child_process');

// 1. 打开本地文件夹 (Windows 专用暴力版)
router.post('/open', async (req, res) => {
    try {
        const { path: dirPath } = req.body;
        
        // 简单打个日志，看看后端有没有收到请求
        console.log('Attempting to open:', dirPath);

        if (!dirPath || !await fs.pathExists(dirPath)) {
            throw new Error('文件夹不存在');
        }

        // 直接调用 Windows 资源管理器
        // 注意：路径必须用引号包起来，防止有空格导致命令截断
        exec(`explorer "${dirPath}"`, (err) => {
            if (err) {
                console.error('Failed to open explorer:', err);
                // 这里不 throw error，因为 exec 即使成功有时也会有 stderr
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Open Route Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. 删除 LoRA
router.post('/delete', async (req, res) => {
    try {
        const { paths } = req.body; // 支持批量删除，接收数组
        if (!Array.isArray(paths)) throw new Error('参数错误: paths 必须是数组');

        for (const dirPath of paths) {
            // 安全检查：防止误删根目录以外的文件
            if (!dirPath.includes('LoraData')) { // 简单的安全阈值，实际可用 path.relative 检查
                console.warn(`跳过不安全路径: ${dirPath}`);
                continue;
            }
            await fs.remove(dirPath);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. 更新 LoRA (修改 Tag -> 移动文件夹)
router.post('/update', async (req, res) => {
    try {
        const { oldPath, metadata } = req.body;
        
        // A. 基础校验
        if (!await fs.pathExists(oldPath)) throw new Error('原 LoRA 路径不存在');
        
        // B. 计算新路径
        const configPath = path.join(process.cwd(), 'data', 'global-config.json');
        const globalConfig = await fs.readJson(configPath);
        const newPath = generateLoraPath(globalConfig.rootPath, metadata);

        // C. 移动文件夹 (如果路径变了)
        // 注意：Windows下路径大小写不敏感，最好用 path.relative 比较
        if (path.relative(oldPath, newPath) !== '') {
            if (await fs.pathExists(newPath)) {
                throw new Error('目标路径已存在同名 LoRA，无法移动/重命名');
            }
            await fs.move(oldPath, newPath);
        }

        // D. 更新 info.json
        metadata.updatedAt = new Date().toISOString();
        // 确保保留原有的 id 和 images (如果前端没传回来，这里可能会丢，所以前端必须传完整 metadata)
        // 建议：读取旧的 info.json 补全 metadata，防止数据丢失
        const currentInfoFile = path.join(newPath, 'info.json'); // 此时文件已经在新路径了
        let currentInfo = {};
        if (await fs.pathExists(currentInfoFile)) {
            currentInfo = await fs.readJson(currentInfoFile);
        }
        
        // 合并数据：旧数据底版 + 新数据覆盖
        const finalMetadata = { ...currentInfo, ...metadata };
        await fs.writeJson(currentInfoFile, finalMetadata, { spaces: 2 });

        // E. 更新全局统计
        await updateTagStats({
            framework: metadata.baseTags.framework,
            platform: metadata.baseTags.platform,
            style: metadata.baseTags.style,
            extraTags: metadata.extraTags
        });

        res.json({ success: true, newPath });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// ★★★ 关键：这一行必须存在且不能写错 ★★★
module.exports = router;