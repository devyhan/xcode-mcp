#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

// 명령어 실행을 위한 promisify
const execPromise = promisify(exec);

/**
 * Shell 명령어를 실행하는 MCP 서버
 */
async function main() {
  const server = new McpServer({
    name: "xcode-mcp",
    version: "0.1.2",
    description: "MCP Server for executing shell commands, particularly useful for Xcode-related operations"
  });

  console.error("xcode-mcp 서버 초기화...");

  // 1. Shell 명령어 실행 도구
  server.tool(
    "execute-shell",
    {
      command: z.string().describe("실행할 shell 명령어"),
      workingDir: z.string().optional().describe("명령어를 실행할 작업 디렉토리 (선택사항)"),
      timeout: z.number().optional().describe("명령어 실행 타임아웃(ms) (선택사항, 기본값: 60000ms)")
    },
    async ({ command, workingDir, timeout = 60000 }) => {
      try {
        console.error(`명령어 실행: ${command} in ${workingDir || 'current directory'}`);
        
        // 보안 상의 이유로 위험한 명령어 필터링
        if (/rm\s+-rf\s+\//.test(command) || /mkfs/.test(command) || /dd\s+if/.test(command)) {
          return {
            content: [{ 
              type: "text", 
              text: "보안상의 이유로 이 명령어를 실행할 수 없습니다."
            }],
            isError: true
          };
        }

        const options = {
          cwd: workingDir,
          timeout: timeout,
          maxBuffer: 1024 * 1024 * 10 // 10MB
        };

        const { stdout, stderr } = await execPromise(command, options);
        
        let resultText = "";
        if (stdout) resultText += `OUTPUT:\n${stdout}\n`;
        if (stderr) resultText += `STDERR:\n${stderr}\n`;

        if (!resultText) resultText = "명령어가 출력 없이 성공적으로 실행되었습니다.";

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`명령어 실행 오류: ${error.message}`);
        
        let errorMessage = `명령어 실행 중 오류가 발생했습니다:\n${error.message}\n`;
        
        if (error.stdout) errorMessage += `\nOUTPUT:\n${error.stdout}\n`;
        if (error.stderr) errorMessage += `\nSTDERR:\n${error.stderr}\n`;

        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true
        };
      }
    }
  );

  // 2. Xcode 프로젝트 정보 도구
  server.tool(
    "xcode-project-info",
    {
      projectPath: z.string().describe("Xcode 프로젝트 또는 워크스페이스 경로")
    },
    async ({ projectPath }) => {
      try {
        console.error(`Xcode 프로젝트 정보 확인: ${projectPath}`);
        
        // xcodebuild -list 명령어로 프로젝트 정보 가져오기
        const command = `xcodebuild -list -json -project "${projectPath}"`;
        const { stdout } = await execPromise(command);
        
        // JSON 파싱 시도
        try {
          const projectInfo = JSON.parse(stdout);
          return {
            content: [{ 
              type: "text", 
              text: `Xcode 프로젝트 정보:\n${JSON.stringify(projectInfo, null, 2)}`
            }]
          };
        } catch (parseError) {
          // JSON 파싱 실패 시 원본 출력 반환
          return {
            content: [{ 
              type: "text", 
              text: `Xcode 프로젝트 정보:\n${stdout}`
            }]
          };
        }
      } catch (error: any) {
        console.error(`Xcode 프로젝트 정보 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `Xcode 프로젝트 정보를 가져오는 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
          }],
          isError: true
        };
      }
    }
  );

  // 3. Xcode 빌드 도구
  server.tool(
    "xcode-build",
    {
      projectPath: z.string().describe("Xcode 프로젝트 또는 워크스페이스 경로"),
      scheme: z.string().describe("빌드할 스킴"),
      configuration: z.string().optional().describe("빌드 구성 (예: Debug, Release)"),
      destination: z.string().optional().describe("빌드 대상 (예: 'platform=iOS Simulator,name=iPhone 14')")
    },
    async ({ projectPath, scheme, configuration, destination }) => {
      try {
        console.error(`Xcode 프로젝트 빌드: ${projectPath}, Scheme: ${scheme}`);
        
        let command = `xcodebuild -project "${projectPath}" -scheme "${scheme}"`;
        
        if (configuration) {
          command += ` -configuration "${configuration}"`;
        }
        
        if (destination) {
          command += ` -destination "${destination}"`;
        }
        
        // 빌드 명령어 실행
        const { stdout, stderr } = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 });
        
        let resultText = "빌드 결과:\n";
        if (stdout) resultText += `${stdout}\n`;
        if (stderr) resultText += `STDERR:\n${stderr}\n`;

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`Xcode 빌드 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `Xcode 빌드 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
          }],
          isError: true
        };
      }
    }
  );

  // 서버 시작
  console.error("xcode-mcp 서버 시작 중...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("xcode-mcp 서버가 시작되었습니다.");
}

// 메인 실행
main().catch(error => {
  console.error("서버 실행 중 오류 발생:", error);
  process.exit(1);
});
