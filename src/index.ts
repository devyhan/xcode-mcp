#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec, spawn } from "child_process";
import { promisify } from "util";

// 명령어 실행을 위한 promisify
const execPromise = promisify(exec);

/**
 * Shell 명령어를 실행하는 MCP 서버
 */
async function main() {
  const server = new McpServer({
    name: "xcode-mcp",
    version: "0.2.1",
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

  // 3. Xcode 빌드 도구 (개선된 버전)
  server.tool(
    "xcode-build",
    {
      projectPath: z.string().describe("Xcode 프로젝트 또는 워크스페이스 경로"),
      scheme: z.string().describe("빌드할 스킴"),
      configuration: z.string().optional().describe("빌드 구성 (예: Debug, Release)"),
      destination: z.string().optional().describe("빌드 대상 (예: 'platform=iOS Simulator,name=iPhone 14')"),
      extraArgs: z.array(z.string()).optional().describe("추가 xcodebuild 인자들"),
      outputDir: z.string().optional().describe("빌드 결과물 저장 경로 (SYMROOT)"),
      clean: z.boolean().optional().describe("빌드 전 clean 실행 여부")
    },
    async ({ projectPath, scheme, configuration, destination, extraArgs = [], outputDir, clean = false }) => {
      try {
        console.error(`Xcode 프로젝트 빌드: ${projectPath}, Scheme: ${scheme}`);
        
        let command = `xcodebuild`;
        
        // 워크스페이스인지 프로젝트인지 확인
        if (projectPath.endsWith(".xcworkspace")) {
          command += ` -workspace "${projectPath}"`;
        } else {
          command += ` -project "${projectPath}"`;
        }
        
        command += ` -scheme "${scheme}"`;
        
        if (clean) {
          command += ` clean`;
        }
        
        command += ` build`; // 명시적으로 build 액션 지정
        
        if (configuration) {
          command += ` -configuration "${configuration}"`;
        }
        
        if (destination) {
          command += ` -destination "${destination}"`;
        }
        
        if (outputDir) {
          command += ` SYMROOT="${outputDir}"`;
        }
        
        // 추가 인자 추가
        if (extraArgs.length > 0) {
          command += " " + extraArgs.join(" ");
        }
        
        console.error(`실행할 빌드 명령어: ${command}`);
        
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

  // 4. 프로젝트 스킴 및 타겟 목록 조회 도구
  server.tool(
    "xcode-list-schemes",
    {
      projectPath: z.string().describe("Xcode 프로젝트 또는 워크스페이스 경로")
    },
    async ({ projectPath }) => {
      try {
        console.error(`Xcode 스킴 목록 조회: ${projectPath}`);
        
        // 워크스페이스인지 프로젝트인지 확인
        let command;
        if (projectPath.endsWith(".xcworkspace")) {
          command = `xcodebuild -list -workspace "${projectPath}"`;
        } else {
          command = `xcodebuild -list -project "${projectPath}"`;
        }
        
        const { stdout, stderr } = await execPromise(command);
        
        let resultText = "Xcode 스킴 및 타겟 목록:\n";
        if (stdout) resultText += `${stdout}\n`;
        if (stderr) resultText += `${stderr}\n`;

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`스킴 목록 조회 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `스킴 목록을 조회하는 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
          }],
          isError: true
        };
      }
    }
  );

  // 5. Xcode 테스트 실행 도구
  server.tool(
    "xcode-test",
    {
      projectPath: z.string().describe("Xcode 프로젝트 또는 워크스페이스 경로"),
      scheme: z.string().describe("테스트할 스킴"),
      destination: z.string().describe("테스트 대상 (예: 'platform=iOS Simulator,name=iPhone 14')"),
      testPlan: z.string().optional().describe("사용할 테스트 플랜 이름"),
      onlyTesting: z.array(z.string()).optional().describe("실행할 특정 테스트 식별자들 (예: ['ModuleTests/ClassTests/testMethod'])"),
      skipTesting: z.array(z.string()).optional().describe("건너뛸 테스트 식별자들"),
      resultBundlePath: z.string().optional().describe("테스트 결과 번들 저장 경로"),
      buildForTesting: z.boolean().optional().describe("테스트용 빌드만 수행할지 여부"),
      testWithoutBuilding: z.boolean().optional().describe("빌드 없이 테스트만 수행할지 여부")
    },
    async ({ projectPath, scheme, destination, testPlan, onlyTesting = [], skipTesting = [], resultBundlePath, buildForTesting = false, testWithoutBuilding = false }) => {
      try {
        console.error(`Xcode 테스트 실행: ${projectPath}, Scheme: ${scheme}`);
        
        let command = `xcodebuild`;
        
        // 워크스페이스인지 프로젝트인지 확인
        if (projectPath.endsWith(".xcworkspace")) {
          command += ` -workspace "${projectPath}"`;
        } else {
          command += ` -project "${projectPath}"`;
        }
        
        command += ` -scheme "${scheme}"`;
        command += ` -destination "${destination}"`;
        
        // 테스트 모드 설정
        if (buildForTesting) {
          command += ` build-for-testing`;
        } else if (testWithoutBuilding) {
          command += ` test-without-building`;
        } else {
          command += ` test`; // 기본 모드: 빌드 후 테스트
        }
        
        // 테스트 플랜 설정
        if (testPlan) {
          command += ` -testPlan "${testPlan}"`;
        }
        
        // 특정 테스트만 실행
        if (onlyTesting.length > 0) {
          for (const test of onlyTesting) {
            command += ` -only-testing:"${test}"`;
          }
        }
        
        // 특정 테스트 건너뛰기
        if (skipTesting.length > 0) {
          for (const test of skipTesting) {
            command += ` -skip-testing:"${test}"`;
          }
        }
        
        // 결과 번들 경로 설정
        if (resultBundlePath) {
          command += ` -resultBundlePath "${resultBundlePath}"`;
        }
        
        console.error(`실행할 테스트 명령어: ${command}`);
        
        // 테스트 명령어 실행
        const { stdout, stderr } = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 });
        
        let resultText = "테스트 결과:\n";
        if (stdout) resultText += `${stdout}\n`;
        if (stderr) resultText += `STDERR:\n${stderr}\n`;

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`Xcode 테스트 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `Xcode 테스트 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
          }],
          isError: true
        };
      }
    }
  );

  // 6. 앱 아카이브 및 익스포트 도구
  server.tool(
    "xcode-archive",
    {
      projectPath: z.string().describe("Xcode 프로젝트 또는 워크스페이스 경로"),
      scheme: z.string().describe("아카이브할 스킴"),
      configuration: z.string().optional().describe("빌드 구성 (예: Release)"),
      archivePath: z.string().describe("아카이브 파일(.xcarchive) 저장 경로"),
      exportPath: z.string().optional().describe("익스포트 경로 (IPA 파일 등)"),
      exportOptionsPlist: z.string().optional().describe("익스포트 옵션 plist 파일 경로")
    },
    async ({ projectPath, scheme, configuration = "Release", archivePath, exportPath, exportOptionsPlist }) => {
      try {
        console.error(`Xcode 아카이브 생성: ${projectPath}, Scheme: ${scheme}`);
        
        let archiveCommand = `xcodebuild`;
        
        // 워크스페이스인지 프로젝트인지 확인
        if (projectPath.endsWith(".xcworkspace")) {
          archiveCommand += ` -workspace "${projectPath}"`;
        } else {
          archiveCommand += ` -project "${projectPath}"`;
        }
        
        archiveCommand += ` -scheme "${scheme}" -configuration "${configuration}" archive -archivePath "${archivePath}"`;
        
        console.error(`실행할 아카이브 명령어: ${archiveCommand}`);
        
        // 아카이브 명령어 실행
        const { stdout: archiveStdout, stderr: archiveStderr } = await execPromise(archiveCommand, { maxBuffer: 1024 * 1024 * 10 });
        
        let resultText = "아카이브 결과:\n";
        if (archiveStdout) resultText += `${archiveStdout}\n`;
        if (archiveStderr) resultText += `STDERR:\n${archiveStderr}\n`;
        
        // 익스포트 실행 (옵션이 제공된 경우)
        if (exportPath && exportOptionsPlist) {
          console.error(`Xcode 아카이브 익스포트: ${archivePath} -> ${exportPath}`);
          
          let exportCommand = `xcodebuild -exportArchive -archivePath "${archivePath}" -exportPath "${exportPath}" -exportOptionsPlist "${exportOptionsPlist}"`;
          
          console.error(`실행할 익스포트 명령어: ${exportCommand}`);
          
          // 익스포트 명령어 실행
          const { stdout: exportStdout, stderr: exportStderr } = await execPromise(exportCommand, { maxBuffer: 1024 * 1024 * 10 });
          
          resultText += "\n익스포트 결과:\n";
          if (exportStdout) resultText += `${exportStdout}\n`;
          if (exportStderr) resultText += `STDERR:\n${exportStderr}\n`;
        }

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`Xcode 아카이브/익스포트 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `Xcode 아카이브/익스포트 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
          }],
          isError: true
        };
      }
    }
  );

  // 7. Xcode 서명 및 프로비저닝 프로파일 관리 도구
  server.tool(
    "xcode-codesign-info",
    {
      projectPath: z.string().describe("Xcode 프로젝트 또는 워크스페이스 경로"),
      target: z.string().optional().describe("특정 타겟 이름 (선택사항)")
    },
    async ({ projectPath, target }) => {
      try {
        console.error(`Xcode 코드 서명 정보 조회: ${projectPath}`);
        
        // 먼저 프로비저닝 프로파일 목록 조회
        const profilesCommand = `security find-identity -v -p codesigning`;
        const { stdout: profilesStdout, stderr: profilesStderr } = await execPromise(profilesCommand);
        
        let resultText = "코드 서명 인증서 목록:\n";
        if (profilesStdout) resultText += `${profilesStdout}\n`;
        if (profilesStderr) resultText += `${profilesStderr}\n`;
        
        // 프로젝트 빌드 설정에서 서명 관련 정보 추출
        let buildSettingsCommand = `xcodebuild`;
        
        // 워크스페이스인지 프로젝트인지 확인
        if (projectPath.endsWith(".xcworkspace")) {
          buildSettingsCommand += ` -workspace "${projectPath}"`;
        } else {
          buildSettingsCommand += ` -project "${projectPath}"`;
        }
        
        // 타겟이 지정된 경우 추가
        if (target) {
          buildSettingsCommand += ` -target "${target}"`;
        }
        
        buildSettingsCommand += ` -showBuildSettings | grep -E 'CODE_SIGN|PROVISIONING_PROFILE|DEVELOPMENT_TEAM'`;
        
        try {
          const { stdout: settingsStdout, stderr: settingsStderr } = await execPromise(buildSettingsCommand);
          
          resultText += "\n프로젝트 코드 서명 설정:\n";
          if (settingsStdout) resultText += `${settingsStdout}\n`;
          if (settingsStderr) resultText += `${settingsStderr}\n`;
        } catch (settingsError: any) {
          // grep 결과가 없어도 오류가 발생할 수 있으므로 무시
          resultText += "\n프로젝트 코드 서명 설정을 찾을 수 없습니다.\n";
        }
        
        // 프로비저닝 프로파일 목록 (~/Library/MobileDevice/Provisioning Profiles/)
        try {
          const profileListCommand = `ls -la ~/Library/MobileDevice/Provisioning\ Profiles/ 2>/dev/null || echo "프로비저닝 프로파일 디렉토리를 찾을 수 없습니다."`;
          const { stdout: profileListStdout } = await execPromise(profileListCommand);
          
          resultText += "\n설치된 프로비저닝 프로파일:\n";
          resultText += `${profileListStdout}\n`;
        } catch (profileError) {
          resultText += "\n프로비저닝 프로파일 정보를 가져올 수 없습니다.\n";
        }

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`코드 서명 정보 조회 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `코드 서명 정보를 조회하는 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
          }],
          isError: true
        };
      }
    }
  );
  
  // 8. Swift Package 관리 도구
  server.tool(
    "swift-package-manager",
    {
      command: z.enum(["init", "update", "resolve", "reset", "clean"]).describe("SPM 명령어 (init, update, resolve, reset, clean)"),
      packageDir: z.string().describe("Swift Package 디렉토리 경로"),
      extraArgs: z.array(z.string()).optional().describe("추가 SPM 인자들")
    },
    async ({ command, packageDir, extraArgs = [] }) => {
      try {
        console.error(`Swift Package Manager 명령 실행: ${command} in ${packageDir}`);
        
        let spmCommand = `cd "${packageDir}" && swift package ${command}`;
        
        // 추가 인자 추가
        if (extraArgs.length > 0) {
          spmCommand += " " + extraArgs.join(" ");
        }
        
        console.error(`실행할 SPM 명령어: ${spmCommand}`);
        
        // 명령어 실행
        const { stdout, stderr } = await execPromise(spmCommand);
        
        let resultText = "Swift Package Manager 결과:\n";
        if (stdout) resultText += `${stdout}\n`;
        if (stderr) resultText += `${stderr}\n`;

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`Swift Package Manager 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `Swift Package Manager 명령 실행 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
          }],
          isError: true
        };
      }
    }
  );
  
  // 9. SimCtl (시뮬레이터 관리) 도구
  server.tool(
    "simctl-manager",
    {
      command: z.enum(["list", "create", "boot", "shutdown", "erase", "install", "launch", "delete"]).describe("SimCtl 명령어"),
      extraArgs: z.array(z.string()).optional().describe("추가 simctl 인자들")
    },
    async ({ command, extraArgs = [] }) => {
      try {
        console.error(`SimCtl 명령 실행: ${command}`);
        
        let simctlCommand = `xcrun simctl ${command}`;
        
        // 추가 인자 추가
        if (extraArgs.length > 0) {
          simctlCommand += " " + extraArgs.join(" ");
        }
        
        console.error(`실행할 SimCtl 명령어: ${simctlCommand}`);
        
        // 명령어 실행
        const { stdout, stderr } = await execPromise(simctlCommand);
        
        let resultText = "SimCtl 결과:\n";
        if (stdout) resultText += `${stdout}\n`;
        if (stderr) resultText += `${stderr}\n`;

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`SimCtl 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `SimCtl 명령 실행 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
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
