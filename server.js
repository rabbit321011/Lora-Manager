const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
const { scanLibrary } = require('./src/utils/scanner'); 

const app = express();
const PORT = 3235;

// --- 1. 核心中间件 (必须最先加载) ---
app.use(cors());
app.use(bodyParser.json()); // <--- 这行是修复 Delete 报错的关键
app.use(bodyParser.urlencoded({ extended: true }));

// --- 2. 静态资源 ---
app.use(express.static('public'));

// 动态挂载用户设置的根目录到 /files
app.use('/files', async (req, res, next) => {
    try {
        const configPath = path.join(__dirname, 'data', 'global-config.json');
        if (await fs.pathExists(configPath)) {
            const config = await fs.readJson(configPath);
            // 只有当路径存在时才托管
            if (config.rootPath && await fs.pathExists(config.rootPath)) {
                return express.static(config.rootPath)(req, res, next);
            }
        }
        next();
    } catch (e) {
        next();
    }
});

// --- 3. 挂载路由 ---
// 注意：必须在 bodyParser 之后挂载
app.use('/api', require('./src/routes/lora'));
app.use('/api/tags', require('./src/routes/tags'));

// --- 4. 额外接口 ---
app.get('/api/library', async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'data', 'global-config.json');
        const config = await fs.readJson(configPath);
        const loras = await scanLibrary(config.rootPath);
        res.json({ success: true, data: loras });
    } catch (error) {
        console.error('Library Scan Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- 启动 ---
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});