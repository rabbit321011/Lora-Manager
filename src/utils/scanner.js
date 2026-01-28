const fs = require('fs-extra');
const path = require('path');

/**
 * 递归扫描指定目录下的所有 LoRA (通过查找 info.json)
 * @param {string} dir - 当前扫描目录
 * @returns {Promise<Array>} - 返回 LoRA 信息数组
 */
async function scanLibrary(rootDir) {
    if (!await fs.pathExists(rootDir)) return [];

    const results = [];

    async function walk(currentDir) {
        const items = await fs.readdir(currentDir, { withFileTypes: true });
        
        // 检查当前目录是不是一个 LoRA 包 (特征：有 info.json)
        const infoPath = path.join(currentDir, 'info.json');
        if (await fs.pathExists(infoPath)) {
            try {
                const metadata = await fs.readJson(infoPath);
                // 补充物理路径信息，方便前端展示图片
                // 注意：这里我们返回相对于 rootDir 的路径，或者绝对路径
                // 为了安全和简单，我们返回 metadata 本身，外加一个相对路径标识
                // 强制将 Windows 反斜杠转换为 Web 标准的正斜杠
                const relativePath = path.relative(rootDir, currentDir).replace(/\\/g, '/');
                
                results.push({
                    ...metadata,
                    _sys: {
                        dirPath: currentDir,     // 绝对路径 (用于后端操作)
                        relPath: relativePath,   // 相对路径 (用于展示层级)
                        coverUrl: metadata.previewImages && metadata.previewImages.length > 0 
                            ? `/files/${encodeURIComponent(relativePath)}/${metadata.previewImages[0]}`
                            : null // 封面图 URL
                    }
                });
                return; // 如果已经是 LoRA 目录，就不再往里深挖了 (假设 LoRA 不会嵌套 LoRA)
            } catch (e) {
                console.warn(`Skipping corrupted info.json in ${currentDir}`);
            }
        }

        // 如果不是 LoRA 目录，继续递归子目录
        for (const item of items) {
            if (item.isDirectory()) {
                await walk(path.join(currentDir, item.name));
            }
        }
    }

    await walk(rootDir);
    return results;
}

module.exports = { scanLibrary };