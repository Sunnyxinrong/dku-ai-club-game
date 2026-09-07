# DKU AI Club — Fool the AI 开发与部署教程

这次是真正拆分后的完整源码项目，而不是把所有代码塞在一个 `index.html` 中。

## 1. 项目结构

```text
DKU_AI_Club_Fool_the_AI_Developer/
├─ index.html                 页面结构和控件
├─ css/
│  └─ styles.css              DKU 蓝绿色界面与响应式布局
├─ js/
│  ├─ config.js               游戏参数和挑战题库
│  ├─ preprocess.js           裁剪、居中、缩放涂鸦
│  └─ app.js                  绘画、模型、计时、计分、排行榜
├─ assets/
│  └─ dku-ai-club-logo.png    DKU AI Club Logo
├─ start_windows.bat          Windows 本地启动脚本
├─ start_mac_linux.sh         macOS/Linux 本地启动脚本
└─ .nojekyll                  告诉 GitHub Pages 原样发布静态文件
```

项目不需要 Node.js、npm、数据库或后端。

## 2. 每项技术到底做什么

### HTML：页面结构

`index.html` 定义画板、按钮、预测栏、排行榜、开始窗口和结果窗口。HTML 只负责“页面上有什么”，不负责颜色或游戏规则。

页面末尾依次加载：

```html
<script src="js/config.js"></script>
<script src="js/preprocess.js"></script>
<script src="js/app.js"></script>
```

顺序不能交换，因为 `app.js` 要使用前两个文件提供的配置和预处理函数。

### CSS：界面外观

`css/styles.css` 负责颜色、位置、字号、动画和手机适配。文件顶部的 `:root` 是全局颜色：

```css
:root {
  --navy: #071425;
  --blue: #2b7fff;
  --green: #00bd7e;
  --mint: #8fffd4;
}
```

修改这些值就能整体换主题。

### JavaScript：游戏控制

`js/app.js` 保存游戏状态并响应用户操作：

- Pointer Events 接收鼠标、触控笔和手指事件；
- `setInterval()` 每 0.1 秒更新倒计时；
- `predict()` 调用模型；
- `finishRound()` 判断是否成功并计分；
- `localStorage` 保存排行榜。

### Canvas：采集涂鸦

项目有两个 Canvas：

1. `drawingCanvas`：玩家看到并绘画的 700×560 大画板；
2. `modelCanvas`：模型真正接收的 280×280 正方形图像。

Pointer Event 的浏览器坐标会按比例转换为 Canvas 内部坐标，然后通过 `lineTo()` 连成笔画。

### ml5.js：浏览器机器学习接口

`index.html` 从 CDN 加载 ml5.js：

```html
<script src="https://unpkg.com/ml5@0.12.2/dist/ml5.min.js"></script>
```

加载完成后，浏览器中会出现 `window.ml5`。`app.js` 使用：

```javascript
ml5.imageClassifier("DoodleNet", callback)
```

建立分类器，不需要 Python 服务器进行推理。

### DoodleNet：预训练分类模型

DoodleNet 学习的是 Quick, Draw! 风格的简笔画。它输出类别名称和置信度。项目取置信度最高的三个结果：

```javascript
results.slice(0, 3)
```

模型只能输出其训练类别。题库中不能随意添加不受支持的目标词。

### localStorage：本机排行榜

排行榜保存在浏览器中：

```javascript
localStorage.setItem("dkuFoolScores", JSON.stringify(scores));
```

它不会上传到服务器。同一网址、同一浏览器会保留成绩；清除浏览器数据或换电脑后不会保留。

## 3. 完整数据流

```text
Pointer Event
   ↓
drawingCanvas 记录笔画
   ↓
preprocess.js 检测非白色像素边界
   ↓
裁剪空白、保持长宽比、居中
   ↓
modelCanvas 生成 280×280 图像
   ↓
ml5.js 调用 DoodleNet
   ↓
Top-3 类别与 confidence
   ↓
界面更新 + 游戏判定 + 分数
```

## 4. 在 Windows 上启动

### 方法 A：双击脚本

电脑已经安装 Python 时，双击：

```text
start_windows.bat
```

脚本会打开浏览器并在本机 `8000` 端口启动静态服务器。不要关闭黑色终端窗口；关闭它就会停止网页服务。

### 方法 B：手动启动

1. 在源码文件夹空白处按住 Shift 并单击鼠标右键；
2. 选择“在终端中打开”；
3. 运行：

```powershell
py -m http.server 8000
```

4. 浏览器打开：

```text
http://localhost:8000
```

如果 `py` 不存在，尝试：

```powershell
python -m http.server 8000
```

## 5. macOS/Linux 启动

在源码目录运行：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 6. 如何自己调试

### 第一步：打开开发者工具

在 Chrome 或 Edge 中按 `F12`，重点使用三个面板：

- **Console**：查看 JavaScript 日志和报错；
- **Network**：检查 ml5.js、模型 JSON 和权重是否下载成功；
- **Sources**：设置断点，逐行运行代码。

### 第二步：确认真实模型已经启动

右侧必须显示：

```text
NEURAL NET READY
```

如果显示 `DEMO ENGINE`，说明当前不是神经网络输出。打开 Console 查看详细错误，常见原因是：

- 无法访问 `unpkg.com`；
- 模型资源被校园网络、VPN 或插件拦截；
- 加载超过 12 秒；
- 直接使用 `file://` 打开导致某些浏览器的资源限制。

使用 `http://localhost:8000` 调试通常比双击 HTML 更稳定。

### 第三步：使用内置调试面板

`js/config.js` 中：

```javascript
debug: true
```

页面会显示：

- 当前模式是 DoodleNet 还是备用引擎；
- 检测到的墨迹 bounding box；
- 图像缩放比例；
- 单次推理耗时；
- 最近一次错误。

部署前可以改成 `false` 隐藏调试面板。

### 第四步：观察 AI INPUT

右侧 72×72 小图必须满足：

- 背景为白色；
- 涂鸦完整，没有被裁掉；
- 涂鸦位于正中央；
- 涂鸦没有横向或纵向拉伸；
- 图案占据大部分区域，但没有贴边。

如果图案太小，增大 `modelDrawingSize`；如果太贴边，减小它。建议范围为 200–235。

### 第五步：查看模型原始输出

每次推理后，`app.js` 会执行：

```javascript
console.table(state.predictions);
```

Console 中能看到模型原始 Top-3 类别与置信度。这样可以区分“模型预测不准”和“界面显示错误”。

### 第六步：设置断点

在开发者工具 Sources 中打开 `js/app.js`，建议在以下位置点击行号设置断点：

- `predict()`：检查送入模型前后的状态；
- `classifyWithMl5()`：检查模型回调；
- `finishRound()`：检查成功条件和分数；
- `saveScore()`：检查排行榜数据。

在 Scope 区域查看 `state` 和 `config` 的实时值。

### 第七步：清空排行榜

在 Console 执行：

```javascript
localStorage.removeItem("dkuFoolScores");
location.reload();
```

## 7. 修改游戏

### 修改题库

编辑 `js/config.js`：

```javascript
challenges: [
  ["cat", "dog"],
  ["tree", "broccoli"]
]
```

数组第一个词是“要求观众画什么”，第二个词是“希望 AI 错认成什么”。

### 修改时间、回合和画笔

```javascript
roundSeconds: 30,
totalRounds: 3,
brushWidth: 22,
```

### 修改 Logo

用新 PNG 覆盖：

```text
assets/dku-ai-club-logo.png
```

保持文件名不变，无需改代码。

### 修改颜色

编辑 `css/styles.css` 顶部的颜色变量。

## 8. 自己部署到 GitHub Pages

这是纯静态项目，GitHub Pages 是最简单的公开部署方式之一。

### 网页操作方式

1. 注册并登录 GitHub；
2. 点击右上角 `+` → **New repository**；
3. 仓库名称填写 `dku-ai-club-game`；
4. 选择 **Public**，然后创建仓库；
5. 点击 **Add file → Upload files**；
6. 上传本项目内部的所有文件和文件夹；
7. 确认 `index.html` 位于仓库最外层，而不是又套了一层文件夹；
8. 打开 **Settings → Pages**；
9. 在 **Build and deployment** 中选择 **Deploy from a branch**；
10. Branch 选择 `main`，文件夹选择 `/(root)`，然后保存；
11. 等待部署完成，然后打开：

```text
https://你的GitHub用户名.github.io/dku-ai-club-game/
```

更新网站时，只需再次上传并提交修改后的文件。GitHub Pages 可能需要几分钟才显示最新版本。

GitHub 官方教程：

- https://docs.github.com/en/pages/quickstart
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## 9. 部署前检查清单

- `index.html` 位于网站根目录；
- Logo 能正常显示；
- Console 没有红色错误；
- 状态显示 `NEURAL NET READY`；
- AI INPUT 正确居中；
- 鼠标和触摸屏都可以绘画；
- Clear、Undo、New mission、Lock in answer 都能工作；
- 完成五回合后排行榜更新；
- 把 `debug` 改成 `false`；
- 用手机热点测试一次，排除校园网络限制。

## 10. 这个项目目前的限制

- 第一次加载依赖网络获取 ml5.js 和 DoodleNet；
- 排行榜只保存在当前浏览器，不在不同设备之间同步；
- DoodleNet 是通用简笔画模型，预测并不保证正确；
- 如果要完全离线运行，需要把 ml5.js、模型结构和权重一起放到项目中；
- 如果要多台设备共享排行榜，需要增加后端数据库。
