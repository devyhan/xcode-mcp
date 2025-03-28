#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { executeCommand, findDeviceIdentifier, getBundleIdentifier, buildAndInstallApp, launchAppOnDevice, startDeviceLogStream } from './device-runner.js';

// 명령어 실행을 위한 promisify
const execPromise = promisify(exec);

// 내부 유틸리티: 명령어 실행 함수 (LLM에 노출되지 않음) - 이전 버전 호환성 유지
async function _executeCommand(command: string, workingDir?: string, timeout: number = 60000) {
  return executeCommand(command, workingDir, timeout);
}

/**
 * Shell 명령어를 실행하는 MCP 서버
 */
async function main() {
  const server = new McpServer({
    name: "xcode-mcp",
    version: "0.3.0",
    description: "MCP Server for executing shell commands, particularly useful for Xcode-related operations"
  });

  console.error("xcode-mcp 서버 초기화...");

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
        try {
          const { stdout } = await executeCommand(command);
          
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
          throw error;
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
        try {
          const { stdout, stderr } = await executeCommand(command);
          
          let resultText = "빌드 결과:\n";
          if (stdout) resultText += `${stdout}\n`;
          if (stderr) resultText += `STDERR:\n${stderr}\n`;

          return {
            content: [{ type: "text", text: resultText }]
          };
        } catch (error: any) {
          throw error;
        }
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
        
        try {
          const { stdout, stderr } = await executeCommand(command);
          
          let resultText = "Xcode 스킴 및 타겟 목록:\n";
          if (stdout) resultText += `${stdout}\n`;
          if (stderr) resultText += `${stderr}\n`;

          return {
            content: [{ type: "text", text: resultText }]
          };
        } catch (error: any) {
          throw error;
        }
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
        try {
          const { stdout, stderr } = await executeCommand(command);
          
          let resultText = "테스트 결과:\n";
          if (stdout) resultText += `${stdout}\n`;
          if (stderr) resultText += `STDERR:\n${stderr}\n`;

          return {
            content: [{ type: "text", text: resultText }]
          };
        } catch (error: any) {
          throw error;
        }
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
        try {
          const { stdout: archiveStdout, stderr: archiveStderr } = await executeCommand(archiveCommand);
          
          let resultText = "아카이브 결과:\n";
          if (archiveStdout) resultText += `${archiveStdout}\n`;
          if (archiveStderr) resultText += `STDERR:\n${archiveStderr}\n`;
          
          // 익스포트 실행 (옵션이 제공된 경우)
          if (exportPath && exportOptionsPlist) {
            console.error(`Xcode 아카이브 익스포트: ${archivePath} -> ${exportPath}`);
            
            let exportCommand = `xcodebuild -exportArchive -archivePath "${archivePath}" -exportPath "${exportPath}" -exportOptionsPlist "${exportOptionsPlist}"`;
            
            console.error(`실행할 익스포트 명령어: ${exportCommand}`);
            
            // 익스포트 명령어 실행
            const { stdout: exportStdout, stderr: exportStderr } = await executeCommand(exportCommand);
            
            resultText += "\n익스포트 결과:\n";
            if (exportStdout) resultText += `${exportStdout}\n`;
            if (exportStderr) resultText += `STDERR:\n${exportStderr}\n`;
          }

          return {
            content: [{ type: "text", text: resultText }]
          };
        } catch (error: any) {
          throw error;
        }
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
        try {
          const { stdout: profilesStdout, stderr: profilesStderr } = await executeCommand(profilesCommand);
          
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
            const { stdout: settingsStdout, stderr: settingsStderr } = await executeCommand(buildSettingsCommand);
            
            resultText += "\n프로젝트 코드 서명 설정:\n";
            if (settingsStdout) resultText += `${settingsStdout}\n`;
            if (settingsStderr) resultText += `${settingsStderr}\n`;
          } catch (settingsError: any) {
            // grep 결과가 없어도 오류가 발생할 수 있으므로 무시
            resultText += "\n프로젝트 코드 서명 설정을 찾을 수 없습니다.\n";
          }
          
          // 프로비저닝 프로파일 목록 (~/Library/MobileDevice/Provisioning Profiles/)
          try {
            const profileListCommand = `ls -la ~/Library/MobileDevice/Provisioning\\ Profiles/ 2>/dev/null || echo "프로비저닝 프로파일 디렉토리를 찾을 수 없습니다."`;
            const { stdout: profileListStdout } = await executeCommand(profileListCommand);
            
            resultText += "\n설치된 프로비저닝 프로파일:\n";
            resultText += `${profileListStdout}\n`;
          } catch (profileError) {
            resultText += "\n프로비저닝 프로파일 정보를 가져올 수 없습니다.\n";
          }

          return {
            content: [{ type: "text", text: resultText }]
          };
        } catch (error: any) {
          throw error;
        }
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
        try {
          const { stdout, stderr } = await executeCommand(spmCommand);
          
          let resultText = "Swift Package Manager 결과:\n";
          if (stdout) resultText += `${stdout}\n`;
          if (stderr) resultText += `${stderr}\n`;

          return {
            content: [{ type: "text", text: resultText }]
          };
        } catch (error: any) {
          throw error;
        }
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
        try {
          const { stdout, stderr } = await executeCommand(simctlCommand);
          
          let resultText = "SimCtl 결과:\n";
          if (stdout) resultText += `${stdout}\n`;
          if (stderr) resultText += `${stderr}\n`;

          return {
            content: [{ type: "text", text: resultText }]
          };
        } catch (error: any) {
          throw error;
        }
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

  // 10. 실제 기기에서 앱 실행 도구 (NEW)
  server.tool(
    "run-on-device",
    {
      projectPath: z.string().describe("Xcode 프로젝트 또는 워크스페이스 경로"),
      scheme: z.string().describe("빌드 및 실행할 스킴"),
      device: z.string().describe("기기 식별자 또는 이름 (한글 이름 지원)"),
      configuration: z.string().optional().describe("빌드 구성 (Debug/Release)"),
      streamLogs: z.boolean().optional().describe("앱 실행 후 로그 스트리밍 여부"),
      startStopped: z.boolean().optional().describe("디버거 연결을 위한 일시 중지 상태로 시작"),
      environmentVars: z.string().optional().describe("앱에 전달할 환경 변수 (key1=value1,key2=value2 형식)"),
      xcodePath: z.string().optional().describe("Xcode 애플리케이션 경로")
    },
    async ({ projectPath, scheme, device, configuration = "Debug", streamLogs = false, startStopped = false, environmentVars = "", xcodePath = "/Applications/Xcode-16.2.0.app" }) => {
      try {
        console.error(`실제 기기에서 앱 실행 준비: ${projectPath}, 스킴: ${scheme}, 기기: ${device}`);
        
        // 1. 기기 식별자 찾기
        const deviceId = await findDeviceIdentifier(device);
        console.error(`기기 식별자: ${deviceId}`);
        
        // 2. 앱 빌드 및 설치
        console.error(`앱 빌드 및 설치 시작...`);
        await buildAndInstallApp(projectPath, scheme, deviceId, configuration);
        console.error(`앱 빌드 및 설치 완료`);
        
        // 3. 번들 ID 가져오기
        console.error(`번들 ID 조회 중...`);
        const bundleId = await getBundleIdentifier(projectPath, scheme);
        console.error(`번들 ID: ${bundleId}`);
        
        // 4. 환경 변수 파싱
        let envVars: Record<string, string> = {};
        if (environmentVars) {
          environmentVars.split(',').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
              envVars[key] = value;
            }
          });
        }
        
        // 5. 앱 실행
        console.error(`앱 실행 시작...`);
        const launchResult = await launchAppOnDevice(deviceId, bundleId, xcodePath, envVars, startStopped);
        
        let resultText = `앱 실행 결과:\n${launchResult}\n`;
        
        // 6. 로그 스트리밍 (옵션이 활성화된 경우)
        if (streamLogs) {
          resultText += "\n로그 스트리밍이 시작되었습니다. 로그는 터미널에서 확인할 수 있습니다.\n";
          // 비동기적으로 로그 스트리밍 시작
          startDeviceLogStream(deviceId, bundleId, xcodePath);
        }

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error: any) {
        console.error(`실제 기기에서 앱 실행 오류: ${error.message}`);
        
        return {
          content: [{ 
            type: "text", 
            text: `실제 기기에서 앱 실행 중 오류가 발생했습니다:\n${error.message}\n${error.stderr || ''}`
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