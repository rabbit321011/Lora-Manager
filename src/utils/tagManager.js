const fs = require('fs-extra');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'global-config.json');

// --- 核心算法：生成建议 ---
async function getTagSuggestions() {
    if (!await fs.pathExists(CONFIG_PATH)) {
        return generateDefaultConfig();
    }
    
    const config = await fs.readJson(CONFIG_PATH);
    const stats = config.tagStats || {};

    const getSortedTags = (category, isMultiRow = false) => {
        const catStats = stats[category] || { history: [], frequency: {} };
        const { history, frequency } = catStats;

        // 按频率降序
        const sortedByFreq = Object.keys(frequency).sort((a, b) => frequency[b] - frequency[a]);
        
        const topCount = isMultiRow ? 10 : 3; 
        const topTags = sortedByFreq.slice(0, topCount);

        // 历史记录排除 Top
        const recentTags = history.filter(t => !topTags.includes(t));

        if (!isMultiRow) {
            return [...recentTags, ...topTags];
        } else {
            return {
                recent: recentTags,
                top: topTags
            };
        }
    };

    return {
        framework: getSortedTags('framework'),
        platform: getSortedTags('platform'),
        style: getSortedTags('style'),
        others: getSortedTags('others', true)
    };
}

function generateDefaultConfig() {
    return {
        framework: ['SD1.5', 'SDXL', 'FLUX'],
        platform: ['webUI', 'comfyUI', 'webUI&comfyUI'],
        style: ['realist', 'anime'],
        others: { recent: [], top: ['high-res', 'lo-res'] }
    };
}

// --- 核心算法：更新统计 (之前报错就是缺这个) ---
async function updateTagStats(usedTags) {
    // 确保文件存在
    if (!await fs.pathExists(CONFIG_PATH)) {
        await fs.outputJson(CONFIG_PATH, { rootPath: "C:\\LoraData", tagStats: {} });
    }

    const config = await fs.readJson(CONFIG_PATH);
    if (!config.tagStats) config.tagStats = {};

    const updateCategory = (cat, tags) => {
        if (!tags) return;
        const tagList = Array.isArray(tags) ? tags : [tags];
        
        if (!config.tagStats[cat]) config.tagStats[cat] = { history: [], frequency: {} };
        const entry = config.tagStats[cat];

        tagList.forEach(t => {
            entry.frequency[t] = (entry.frequency[t] || 0) + 1;
            entry.history = entry.history.filter(h => h !== t);
            entry.history.unshift(t);
        });
        
        if (entry.history.length > 50) entry.history.length = 50;
    };

    updateCategory('framework', usedTags.framework);
    updateCategory('platform', usedTags.platform);
    updateCategory('style', usedTags.style);
    updateCategory('others', usedTags.extraTags);

    await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
}

// 关键：确保导出了两个函数
module.exports = { getTagSuggestions, updateTagStats };