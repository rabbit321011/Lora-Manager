@echo off
title LoRA Manager Local
color 0a

echo ========================================================
echo        LoRA Manager Local - By pureJS
echo ========================================================
echo.
echo [System] Server is starting...
echo [System] Do not close this window while using the app.
echo.

:: 1. 启动浏览器 (延迟 1 秒给服务器一点时间)
:: 如果你的端口不是 3235，请修改这里的端口号
start "" "http://localhost:3235"

:: 2. 启动 Node 服务器
node server.js

pause