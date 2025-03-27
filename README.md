# xcode-mcp

MCP(Model Context Protocol) 서버로, MCP 클라이언트에서 Shell 명령어를 실행할 수 있게 해주는 도구입니다. 특히 Xcode 관련 작업을 위한 도구들을 제공합니다.

## 설치

```bash
npm install -g xcode-mcp
```

## 사용 방법

### Claude Desktop에서 사용하기

1. Claude Desktop의 설정 파일을 엽니다:
   ```bash
   # macOS
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. 다음 내용을 추가하거나 수정합니다:
   ```json
   {
     "mcpServers": [
       {
         "name": "xcode-mcp",
         "command": "xcode-mcp"
       }
     ]
   }
   ```

3. Claude Desktop를 재시작합니다.

### 제공하는 도구

#### 1. execute-shell

Shell 명령어를 실행하고 결과를 반환합니다.

**매개변수**:
- `command` (필수): 실행할 shell 명령어
- `workingDir` (선택): 명령어를 실행할 작업 디렉토리
- `timeout` (선택): 명령어 실행 타임아웃(ms), 기본값: 60000ms

**예시**:
```
명령어: ls -la
```

#### 2. xcode-project-info

Xcode 프로젝트 정보를 가져옵니다.

**매개변수**:
- `projectPath` (필수): Xcode 프로젝트 또는 워크스페이스 경로

**예시**:
```
프로젝트 경로: /Users/username/Projects/MyApp/MyApp.xcodeproj
```

#### 3. xcode-build

Xcode 프로젝트를 빌드합니다.

**매개변수**:
- `projectPath` (필수): Xcode 프로젝트 또는 워크스페이스 경로
- `scheme` (필수): 빌드할 스킴
- `configuration` (선택): 빌드 구성 (예: Debug, Release)
- `destination` (선택): 빌드 대상 (예: 'platform=iOS Simulator,name=iPhone 14')

**예시**:
```
프로젝트 경로: /Users/username/Projects/MyApp/MyApp.xcodeproj
스킴: MyAppScheme
구성: Debug
대상: platform=iOS Simulator,name=iPhone 14
```

## 보안 고려사항

이 도구는 Shell 명령어를 실행할 수 있기 때문에 보안 위험이 있습니다. 다음 사항에 주의하세요:

- 신뢰할 수 있는 명령어만 실행하세요.
- 시스템을 손상시킬 수 있는 명령어(`rm -rf /`, `mkfs` 등)는 보안상의 이유로 차단됩니다.
- 민감한 정보가 포함된 명령어를 실행하지 마세요.

## 개발

### 필수 요구사항

- Node.js 16 이상
- npm 6 이상

### 로컬에서 개발 및 테스트

```bash
# 저장소 복제
git clone https://github.com/username/xcode-mcp.git
cd xcode-mcp

# 의존성 설치
npm install

# 개발 모드로 실행
npm run dev

# 빌드
npm run build

# 테스트
npm test
```

## 라이선스

ISC
