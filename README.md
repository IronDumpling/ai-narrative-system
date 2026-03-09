## AI Narrative Engine

三层分离的叙事引擎 MVP，实现了：

- **Project / Context DB / Storyline** 三层模型
- **本地 JSON 存储**：无需 MongoDB，数据存于 `backend/data/`，便于查看与调试
- **版本管理**：设计保留，后续实现
- **Context Router + Agents (Bridger / Validator)**：构造给 LLM 的 JSON payload，接入 OpenAI GPT-4o-mini
- **API + 测试体系**：REST 接口 + Jest 单元/集成测试

---

## 目录结构概览

- `backend/`：叙事引擎后端（Node.js + TypeScript + Express + 本地 JSON 存储）
  - `src/config/`：环境变量
  - `src/storage/`：本地 JSON 存储层（`jsonStore.ts`、`types.ts`）
  - `src/services/`：业务服务（Context Router 等）
  - `src/agents/`：Bridger / Validator 的 LLM 调用适配层（OpenAI API）
  - `src/routes/engineRoutes.ts`：所有 `/api` 路由
  - `src/app.ts`：Express 应用构建
  - `src/server.ts`：HTTP server 启动入口
- `tests/`：根级 Jest 测试
  - `helpers/testStorage.ts`：基于临时目录的 JSON 存储测试
  - `unit/`：单元测试（storage schema、Context Router 等）
  - `integration/`：集成测试（CRUD + Agents Orchestrator）
- root：
  - `package.json`：测试与工具依赖（Jest、ts-jest、supertest 等）
  - `jest.config.cjs`：Jest 配置
  - `tsconfig.json`：测试 TypeScript 配置

---

## 环境准备

### 1. Node.js 与包管理

- Node.js：建议 18+ 或 20+
- 使用内置 `npm`

### 2. 数据存储

后端使用 **本地 JSON 文件存储**（`backend/data/`），无需 Docker 或 MongoDB。数据可直接打开查看、备份。

- 可选环境变量：`DATA_DIR` 指定数据目录，默认 `backend/data`。

---

## 后端（backend）配置与运行

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

在 `backend/` 目录下新建 `.env`（参考 `backend/.env.example`，已在 `.gitignore` 中忽略）：

```bash
PORT=4000
OPENAI_API_KEY=sk-your-key-here
```

- **PORT**：服务端口，默认 4000
- **OPENAI_API_KEY**：OpenAI API 密钥，用于 Bridger 与 Validator 的 LLM 调用。若未配置，将使用 mock 实现（固定返回），便于本地测试与 CI

### 3. 启动开发服务器

```bash
cd backend
npm run dev
```

- 默认监听 `http://localhost:4000`
- 健康检查：`GET http://localhost:4000/health` → `{ "status": "ok" }`

### 4. 生产构建与启动

```bash
cd backend
npm run build    # tsc 编译到 dist/
npm start        # node dist/server.js
```

---

## 后端 API 一览（MVP）

所有路径前缀均为 `/api`，例如 `http://localhost:4000/api/projects`。

### 1. Project

- `GET /projects`  
列出所有项目（含 `dbVersion`）。
- `POST /projects`  
Body：
  ```json
  {
    "projectId": "demo",
    "name": "Demo Project",
    "description": "optional"
  }
  ```
  创建新项目，默认 `dbVersion = 1`。

### 2. Context DB（Characters / WorldRules / Events）

#### Characters

- `GET /projects/:projectId/characters`
- `POST /projects/:projectId/characters`
- `PUT /projects/:projectId/characters/:characterId`
- `DELETE /projects/:projectId/characters/:characterId`

任意写操作（POST/PUT/DELETE）都会：

- 递增对应 `Project.dbVersion`
- 写入一条 `DbChangeLog`
- 调用版本级联逻辑，对相关 `StorylineNode` 标记 `needs_revision`

#### World Rules

- `GET /projects/:projectId/world-rules`
- `POST /projects/:projectId/world-rules`
- `PUT /projects/:projectId/world-rules/:ruleId`
- `DELETE /projects/:projectId/world-rules/:ruleId`

WorldRule 的变更会影响 **项目内所有节点** 的 `needs_revision` 标记（因其是全局规则）。

#### Events

- `GET /projects/:projectId/events`
- `POST /projects/:projectId/events`
- `PUT /projects/:projectId/events/:eventId`
- `DELETE /projects/:projectId/events/:eventId`

事件的变更只影响绑定该 `eventId` 的 Storyline 节点。

### 3. StorylineNodes

- `GET /projects/:projectId/storyline-nodes`  
可用 `?status=needs_revision` 过滤需要修订的节点。
- `POST /projects/:projectId/storyline-nodes`  
Body 示例：
  ```json
  {
    "nodeId": "story_1",
    "characterId": "char_001",
    "eventId": "evt_001",
    "content": "Initial draft"
  }
  ```
- `PUT /projects/:projectId/storyline-nodes/:nodeId`

### 4. Agents：Bridger & Validator

#### Bridger（生成桥接/补全文本）

- `POST /projects/:projectId/bridger`

Body 两种用法：

1. 基于事件范围：
  ```json
   {
     "characterId": "char_001",
     "startEventId": "evt_001",
     "endEventId": "evt_002"
   }
  ```
2. 基于现有 Storyline 节点：
  ```json
   {
     "nodeId": "story_1"
   }
  ```

返回：

```json
{
  "bridging_steps": [
    { "step": 1, "action": "..." },
    { "step": 2, "action": "..." }
  ]
}
```

若传 `nodeId` 且 `bridging_steps` 非空，会将生成内容写回对应 StorylineNode 的 `content`，并设置 `status: "draft"`。

#### Validator（验证 OOC / 规则违背）

- `POST /projects/:projectId/validator`

Body：

```json
{
  "characterId": "char_001",
  "worldRuleIds": ["rule_001"],
  "textToVerify": "Some text",
  "nodeId": "story_1"
}
```

- `characterId`：必填
- `textToVerify` 与 `nodeId` 至少二选一（传 `nodeId` 时默认验证对应节点的 `content`）

行为：

- 构造 `ValidatorPayload`，调用 `callValidator`（接入 OpenAI，或未配置 API Key 时使用 mock）
- 若携带 `nodeId`：更新该 StorylineNode：
  - `status = "stable"` 或 `needs_revision`
  - `lastCheckResult = { pass, violations, checkedAt }`

返回：

```json
{
  "pass": true,
  "violations": []
}
```

---

## 测试体系（Jest）

### 1. 安装根依赖

在项目根目录：

```bash
npm install
```

这会安装：

- `jest`, `ts-jest`, `@types/jest`
- `mongodb-memory-server`
- `supertest`
- `typescript`

### 2. 运行全部测试

```bash
npm test
```

### 3. 单元测试

```bash
npm run test:unit
```

主要文件：

- `tests/unit/models-schemas.test.ts`  
  - JSON 存储：`projectId` 唯一性、StorylineNode `status` 默认值
- `tests/unit/contextRouter.test.ts`  
  - `buildBridgerPayloadForEvents` / `buildBridgerPayloadForNode` / `buildValidatorPayload` 的 payload 结构
- `tests/unit/versioningService.test.ts`：版本管理（**预留**，当前跳过）

### 4. 集成测试

```bash
npm run test:integration
```

主要文件：

- `tests/integration/context-db-api.test.ts`  
  - `POST/GET /api/projects`  
  - Characters / WorldRules / Events CRUD  
  - StorylineNode CRUD + `status` 过滤
- `tests/integration/versioning-flow.test.ts`：版本工作流（**预留**，当前跳过）
- `tests/integration/agents-orchestrator.test.ts`  
  - `POST /projects/:projectId/bridger`：返回 `bridging_steps`  
  - `POST /projects/:projectId/validator`：更新 StorylineNode `status` 和 `lastCheckResult`

> 测试使用临时目录作为 JSON 存储，无需 MongoDB。

### 5. 按文件运行测试（调试用）

示例：

```bash
# 单个单元测试文件
npm run test:unit -- --runTestsByPath tests/unit/versioningService.test.ts

# 单个集成测试文件
npm run test:integration -- --runTestsByPath tests/integration/versioning-flow.test.ts
```

---

## 典型开发流程建议

1. **启动后端开发服务器**：`cd backend && npm run dev`（无需启动 MongoDB）。
2. **手工调用 API**（Postman / curl）：
  - 创建 Project / Character / WorldRule / Event / StorylineNode
  - 调整 Context DB，数据存于 `backend/data/`，可直接查看 JSON
  - 调用 `/bridger` 与 `/validator`，体验 Orchestrator 流程
3. **运行测试**：
  - `npm run test:unit` 验证服务层逻辑  
  - `npm run test:integration` 验证端到端行为
4. **迭代开发**：Bridger / Validator 已接入 OpenAI，配置 `OPENAI_API_KEY` 即可使用真实 LLM；或增加前端控制台。

