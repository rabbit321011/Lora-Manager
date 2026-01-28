const path = require('path');

/**
 * 根据 LoRA 的元数据生成标准物理路径
 * 规则：根目录/框架/平台/画风/Lora名
 */
function generateLoraPath(rootPath, loraData) {
    const { name, baseTags } = loraData;
    
    // 处理 undefined 情况，确保路径安全
    const framework = baseTags.framework || 'undefined';
    const platform = baseTags.platform || 'undefined';
    const style = baseTags.style || 'undefined';
    
    // 确保文件名安全 (移除非法字符)
    const safeName = name.replace(/[\\/:*?"<>|]/g, '_');

    return path.join(rootPath, framework, platform, style, safeName);
}

module.exports = { generateLoraPath };
