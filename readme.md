# 视频学习系统 - 系统说明书

## 一、项目概述

视频学习系统是一款基于 React + Flask 的在线视频学习平台，集成 AI 费曼学习法互动功能，支持视频播放、PDF阅读、截图标注、智能复习等核心功能。

播放目录
<img width="2217" height="1137" alt="image" src="https://github.com/user-attachments/assets/ddae4411-0c56-4dea-84ca-ead7786e7c2d" />
播放区域
<img width="2217" height="1137" alt="image" src="https://github.com/user-attachments/assets/3385ef6e-3421-4514-a0a2-e93adcb5ae35" />
标注区域
<img width="2217" height="1137" alt="image" src="https://github.com/user-attachments/assets/3f37ee6b-ba88-4424-8ed1-fa7db6583633" />
标注管理
<img width="2217" height="1137" alt="image" src="https://github.com/user-attachments/assets/a58c3443-a3ce-41cf-bf6b-35a9a0ebb4d8" />


## 二、功能特性

### 2.1 视频播放功能

| 功能 | 描述 |
|------|------|
| 多格式支持 | MP4, WebM, MKV, AVI, MOV 等主流格式 |
| 播放速度 | 支持 1.0x, 1.5x, 1.7x, 2.3x 倍速播放 |
| 全屏播放 | 点击 ⛶ 按钮进入全屏浮动窗口 |
| 进度条标注 | 截图自动在进度条标记，点击查看标注详情 |
| 播放控制 | 播放/暂停、音量调节、时间显示 |
| 视频优化 | 支持视频修复和优化（消除B帧、添加faststart） |

### 2.2 PDF阅读功能

| 功能 | 描述 |
|------|------|
| 滚动懒加载 | 页面进入视口时自动加载，支持100M大文件 |
| 页码跳转 | 支持输入页码快速跳转 |
| 文本提取 | 基于PyMuPDF的文本提取 |
| 标注定位 | 点击标注截图跳转到对应页码 |

### 2.3 截图标注功能

| 功能 | 描述 |
|------|------|
| 📷 标注截图 | 截取当前画面并保存标注 |
| 定位按钮📍 | 跳转到视频时间戳或PDF页码 |
| 删除按钮× | 删除标注 |
| 记忆评分 | 支持 🔁重来、😓困难、🙂一般、😊容易 |
| 间隔复习 | 基于SM-2算法的智能复习提醒 |

### 2.4 费曼学习法互动

| 功能 | 描述 |
|------|------|
| AI分析题目 | 分析截图内容，给出解题思路 |
| 生成考题 | 自动生成3道考题并提供答案解析 |
| 公式可视化 | 支持LaTeX公式渲染（红色字体） |
| 提示词模板 | 本地存储多个默认提示词，支持切换 |
| 自动重试 | API超时自动重新提问 |
| 对话布局 | 左对称布局，谷歌风格 |

### 2.5 进度条标注预览

| 功能 | 描述 |
|------|------|
| 点击标记 | 打开/关闭预览窗口 |
| 预览窗口 | 90%宽，94%高，页面居中显示 |
| 左侧截图 | 55%宽度，显示截图和时间戳 |
| 右侧互动 | 45%宽度，费曼学习法互动窗口 |
| 背景遮罩 | 点击遮罩关闭预览，保持全屏状态 |

### 2.6 播放目录管理

| 功能 | 描述 |
|------|------|
| 添加文件夹 | 支持添加自定义视频文件夹 |
| 播放列表 | 支持多文件添加到播放列表 |
| 批量删除 | 支持批量删除视频 |
| 目录浏览 | 支持Windows盘符浏览 |

### 2.7 自定义遮盖块

| 功能 | 描述 |
|------|------|
| 颜色选择 | 支持任意颜色选择 |
| 透明度调节 | 支持0-100%透明度 |
| 无外框 | 遮盖块不显示虚线外框 |
| 位置调整 | 可拖动调整遮盖位置 |

## 三、技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │PlayerPage│  │SavePage  │  │FeynmanChat│ │PDFReader │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │             │              │         │
│       └──────────────┴─────────────┴──────────────┘         │
│                     Vite构建                                │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP API
┌──────────────────────────┴──────────────────────────────────┐
│                        后端 (Flask)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │视频服务  │  │PDF处理   │  │标注管理  │  │LLM调用  │   │
│  │ffmpeg   │  │PyMuPDF   │  │JSON存储  │  │API代理  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 四、文件结构

```
video-learning-system/
├── backend/                  # 后端服务
│   ├── app.py               # Flask主应用
│   ├── requirements.txt     # Python依赖
│   ├── save/                # 标注数据存储
│   └── feynman_chats/       # 费曼对话记录
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── components/      # 组件目录
│   │   │   ├── VideoPlayerEnhanced.jsx  # 增强版视频播放器
│   │   │   ├── FeynmanChat.jsx          # 费曼学习法互动
│   │   │   ├── PDFReader.jsx            # PDF阅读器
│   │   │   ├── AnnotationReviewPanel.jsx # 标注预览面板
│   │   │   └── DrawingCanvas.jsx       # 截图画布
│   │   ├── pages/           # 页面目录
│   │   │   ├── PlayerPage.jsx          # 播放器页面
│   │   │   └── SavePage.jsx            # 我的标注页面
│   │   ├── App.jsx          # 主应用组件
│   │   └── App.css          # 全局样式
│   ├── dist/                # 构建产物
│   ├── package.json         # npm依赖
│   └── vite.config.js       # Vite配置
├── start.bat                # 启动脚本
├── 启动.bat                 # 中文启动脚本
└── 打包.bat                 # 打包脚本
```

## 五、API接口

### 5.1 视频相关

| 接口 | 方法 | 描述 |
|------|------|------|
| /api/videos | GET | 获取视频列表 |
| /api/video/<filename> | GET | 获取视频文件 |
| /api/video-folder/<filename> | GET | 获取自定义文件夹视频 |
| /api/video-info | GET | 获取视频信息 |
| /api/video-diagnose | GET | 视频诊断 |
| /api/fix-video | POST | 修复视频 |
| /api/optimize-video | POST | 优化视频 |
| /api/optimize-all-videos | POST | 批量优化视频 |

### 5.2 PDF相关

| 接口 | 方法 | 描述 |
|------|------|------|
| /api/pdf-page-image | GET/POST | 获取PDF页面图片 |
| /api/pdf-parse | GET/POST | 解析PDF文本 |
| /api/pdf-file | GET | 获取PDF文件 |

### 5.3 标注相关

| 接口 | 方法 | 描述 |
|------|------|------|
| /api/annotations | GET | 获取标注列表 |
| /api/annotations/<id> | GET | 获取标注详情 |
| /api/annotations | POST | 创建标注 |
| /api/annotations/<id> | PUT | 更新标注 |
| /api/annotations/<id> | DELETE | 删除标注 |
| /api/annotations/<id>/image | GET | 获取标注图片 |

### 5.4 费曼学习法

| 接口 | 方法 | 描述 |
|------|------|------|
| /api/feynman/chat | POST | 发送费曼对话消息 |
| /api/feynman/chat/<id> | GET | 获取对话历史 |

### 5.5 播放列表

| 接口 | 方法 | 描述 |
|------|------|------|
| /api/playlist | GET | 获取播放列表 |
| /api/playlist/add | POST | 添加到播放列表 |
| /api/playlist/remove | POST | 从播放列表移除 |
| /api/playlist/clear | POST | 清空播放列表 |

### 5.6 文件管理

| 接口 | 方法 | 描述 |
|------|------|------|
| /api/set-folder | POST | 设置视频文件夹 |
| /api/remove-folder | POST | 移除视频文件夹 |
| /api/folder-videos | GET | 获取文件夹视频 |
| /api/browse | GET | 浏览文件系统 |

## 六、配置说明

### 6.1 后端配置 (backend/config.json)

```json
{
  "lastFolderPaths": ["D:\\video\\learning"],
  "playlist": []
}
```

### 6.2 前端配置 (frontend/vite.config.js)

```js
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5010',
        changeOrigin: true
      }
    }
  }
})
```

### 6.3 LLM API配置 (backend/app.py)

在后端代码中配置LLM服务地址和API Key，支持自动重试机制。

## 七、运行环境

### 7.1 前端依赖

```bash
# Node.js >= 18.0.0
# npm >= 9.0.0
```

### 7.2 后端依赖

```bash
# Python >= 3.9.0
# 系统依赖：ffmpeg, ffprobe
```

### 7.3 Python包

```
flask==3.1.0
flask-cors==5.0.1
PyMuPDF==1.24.10
opencv-python==4.10.0.84
numpy==1.26.4
```

---

# 部署方案

## 一、环境准备

### 1.1 安装Node.js

下载地址：https://nodejs.org/

推荐版本：18.x 或 20.x LTS

### 1.2 安装Python

下载地址：https://www.python.org/

推荐版本：3.9.x 或 3.10.x

### 1.3 安装ffmpeg

**Windows**:
```bash
# 下载地址：https://ffmpeg.org/download.html
# 解压后将bin目录添加到系统PATH
```

**验证安装**:
```bash
ffmpeg -version
ffprobe -version
```

## 二、项目部署

### 2.1 克隆项目

```bash
git clone <repository-url>
cd video-learning-system
```

### 2.2 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2.3 安装前端依赖

```bash
cd frontend
npm install
```

### 2.4 构建前端

```bash
cd frontend
npm run build
```

## 三、启动服务

### 3.1 方式一：使用启动脚本

```bash
# Windows
双击 启动.bat
```

### 3.2 方式二：手动启动

**启动后端**:
```bash
cd backend
python app.py
```

**启动前端开发服务器**:
```bash
cd frontend
npm run dev
```

### 3.3 访问地址

```
前端开发地址：http://localhost:5173
后端API地址：http://localhost:5010
```

## 四、生产部署

### 4.1 使用Gunicorn（推荐）

```bash
# 安装gunicorn
pip install gunicorn

# 启动服务
cd backend
gunicorn --bind 0.0.0.0:5010 --workers 4 app:app
```

### 4.2 使用Nginx反向代理

**nginx.conf**:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /path/to/video-learning-system/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 4.3 配置开机自启

**Windows服务**:
```bash
# 使用nssm创建Windows服务
nssm install VideoLearningSystem
```

## 五、数据备份

### 5.1 备份目录

| 目录 | 说明 |
|------|------|
| backend/save/ | 标注截图和元数据 |
| backend/feynman_chats/ | 费曼对话记录 |
| backend/config.json | 配置文件 |

### 5.2 备份命令

```bash
# 打包备份
zip -r backup.zip backend/save/ backend/feynman_chats/ backend/config.json
```

## 六、常见问题

### 6.1 视频无法播放

- 检查ffmpeg是否安装正确
- 检查视频格式是否支持
- 尝试使用「修复视频」功能
- 检查视频文件是否损坏

### 6.2 PDF无法加载

- 检查PyMuPDF是否安装正确
- 检查PDF文件路径是否正确
- 大文件可能需要较长加载时间

### 6.3 费曼学习法无响应

- 检查网络连接
- 检查LLM API配置
- 检查API Key是否有效

### 6.4 内存占用过高

- 系统会自动释放空闲资源
- 长时间使用后建议重启服务
- 定期清理不需要的标注

## 七、更新维护

### 7.1 更新前端

```bash
cd frontend
git pull
npm install
npm run build
```

### 7.2 更新后端

```bash
cd backend
git pull
pip install -r requirements.txt
```

---

**版本**: 1.0.0  
**日期**: 2026-07-19  
**作者**: shenyc（微信可以联系）
