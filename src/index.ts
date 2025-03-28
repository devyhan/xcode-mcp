#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { executeCommand, findDeviceIdentifier, getBundleIdentifier, buildAndInstallApp, launchAppOnDevice, startDeviceLogStream, findDeviceInfo, getAllDevices, findXcodeInstallations, getDeviceCtlPath } from './device-runner.js';

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
    version: "0.4.0",
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

  // 10. 실제 기기에서 앱 실행 도구
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
      xcodePath: z.string().optional().describe("Xcode 애플리케이션 경로"),
      listDevices: z.boolean().optional().describe("실행 전 감지된 모든 디바이스 목록 표시"),
      skipBuild: z.boolean().optional().describe("이미 설치된 앱을 재실행할 때 빌드 및 설치 건너뛰기"),
      extraLaunchArgs: z.array(z.string()).optional().describe("devicectl launch 명령어에 전달할 추가 인자"),
      directBundleId: z.string().optional().describe("직접 지정할 번들 ID (프로젝트에서 추출하지 않음)")
    },
    async ({ projectPath, scheme, device, configuration = "Debug", streamLogs = false, startStopped = false, environmentVars = "", xcodePath, listDevices = false, skipBuild = false, extraLaunchArgs = [], directBundleId }) => {
      try {
        console.error(`실제 기기에서 앱 실행 준비: ${projectPath}, 스킴: ${scheme}, 기기: ${device}`);
        
        // 0. 디바이스 목록 표시 (요청된 경우)
        if (listDevices) {
          // 캩0싱 무시하고 강제로 최신 디바이스 목록 가져오기
          const allDevices = await getAllDevices(true);
          let deviceListText = "감지된 디바이스 목록:\n";
          allDevices.forEach(d => {
            deviceListText += `- ${d.name}\n`;
            if (d.xcodeId) deviceListText += `  Xcode ID: ${d.xcodeId}\n`;
            if (d.deviceCtlId) deviceListText += `  DeviceCtl ID: ${d.deviceCtlId}\n`;
            deviceListText += `  상태: ${d.isAvailable ? '사용 가능' : '사용 불가'}\n`;
            if (d.model) deviceListText += `  모델: ${d.model}\n`;
            if (d.osVersion) deviceListText += `  OS 버전: ${d.osVersion}\n`;
            deviceListText += "\n";
          });
          
          return {
            content: [{ type: "text", text: deviceListText }]
          };
        }
        
        // 1. 자동으로 Xcode 경로 찾기 (xcodePathw가 지정되지 않은 경우)
        if (!xcodePath) {
          const installations = await findXcodeInstallations();
          if (installations.length > 0) {
            xcodePath = installations[0].path;
            console.error(`자동 감지된 Xcode 경로 사용: ${xcodePath}`);
          }
        }
        
        // 2. 디바이스 정보 찾기
        const deviceInfo = await findDeviceInfo(device);
        console.error(`디바이스 정보: ${JSON.stringify(deviceInfo)}`);
        
        if (!deviceInfo.xcodeId) {
          return {
            content: [{ 
              type: "text", 
              text: `디바이스 '${deviceInfo.name}'의 Xcode 식별자(UDID)를 찾을 수 없습니다. 디바이스가 올바르게 연결되어 있는지 확인하세요.`
            }],
            isError: true
          };
        }
        
        if (!deviceInfo.deviceCtlId) {
          return {
            content: [{ 
              type: "text", 
              text: `디바이스 '${deviceInfo.name}'의 CoreDevice 식별자(UUID)를 찾을 수 없습니다. 디바이스가 올바르게 연결되어 있는지 확인하세요.`
            }],
            isError: true
          };
        }
        
        const xcodeDeviceId = deviceInfo.xcodeId;
        const deviceCtlId = deviceInfo.deviceCtlId;
        
        console.error(`Xcode 식별자: ${xcodeDeviceId}`);
        console.error(`DeviceCtl 식별자: ${deviceCtlId}`);
        
        // 기기 추가 정보 표시
        if (deviceInfo.model) {
          console.error(`기기 모델: ${deviceInfo.model}`);
        }
        if (deviceInfo.osVersion) {
          console.error(`기기 OS 버전: ${deviceInfo.osVersion}`);
        }
        
        // 3. 번들 ID 가져오기
        let bundleId: string;
        if (directBundleId) {
          console.error(`사용자 지정 번들 ID 사용: ${directBundleId}`);
          bundleId = directBundleId;
        } else {
          console.error(`번들 ID 조회 중...`);
          bundleId = await getBundleIdentifier(projectPath, scheme);
          console.error(`번들 ID: ${bundleId}`);
        }
        
        // 4. devicectl 경로 찾기
        const deviceCtlPath = await getDeviceCtlPath(xcodePath);
        console.error(`devicectl 경로: ${deviceCtlPath}`);
        
        // 5. 앱 출력 경로 추정 (skipBuild = false만 사용)
        let appPath: string | undefined;
        if (!skipBuild && !directBundleId) {
          try {
            // 빌드 서적으로부터 앱 경로 추정
            const derivedDataCmd = `xcodebuild -project "${projectPath}" -scheme "${scheme}" -showBuildSettings | grep CONFIGURATION_BUILD_DIR`;
            const { stdout: derivedDataOutput } = await executeCommand(derivedDataCmd);
            const match = derivedDataOutput.match(/CONFIGURATION_BUILD_DIR = (.*)/);
            
            if (match && match[1]) {
              const buildDir = match[1].trim();
              appPath = `${buildDir}/${scheme}.app`;
              console.error(`추정된 앱 경로: ${appPath}`);
            }
          } catch (pathError) {
            console.error(`앱 경로 추정 실패, 자동 재설치 기능을 사용할 수 없습니다: ${pathError}`);
          }
        }
        
        // 6. 빌드 및 설치 (선택적)
        if (!skipBuild && !directBundleId) {
          console.error(`앱 빌드 및 설치 시작...`);
          await buildAndInstallApp(projectPath, scheme, xcodeDeviceId, configuration);
          console.error(`앱 빌드 및 설치 완료`);
        } else {
          console.error(`빌드 및 설치 과정 건너뛰기`);
        }
        
        // 7. 환경 변수 파싱
        let envVars: Record<string, string> = {};
        if (environmentVars) {
          environmentVars.split(',').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
              envVars[key] = value;
            }
          });
        }
        
        // 8. 앱 실행 - 개선된 launchAppOnDevice 함수 사용
        console.error(`앱 실행 시작...`);
        try {
          const launchResult = await launchAppOnDevice(
            deviceCtlId, 
            bundleId, 
            xcodePath, 
            envVars, 
            startStopped,
            extraLaunchArgs,
            appPath // 자동 재설치를 위한 앱 경로 (필요한 경우)
          );
          
          let resultText = `앱 실행 결과:\n${launchResult}\n`;
          
          // 9. 로그 스트리밍 (옵션이 활성화된 경우)
          if (streamLogs) {
            resultText += "\n로그 스트리밍이 시작되었습니다. 로그는 터미널에서 확인할 수 있습니다.\n";
            // 비동기적으로 로그 스트리밍 시작
            startDeviceLogStream(deviceCtlId, bundleId, xcodePath);
          }

          return {
            content: [{ type: "text", text: resultText }]
          };
        } catch (launchError: any) {
          // 실행 오류인 경우, 메시지 체크
          if (launchError.message.includes('is not installed') && appPath) {
            try {
              // 앱이 설치되지 않은 경우 수동 설치 시도
              console.error(`앱이 설치되지 않았습니다. 수동 설치 시도 중...`);
              
              // devicectl을 사용해 수동 설치
              const installCmd = `"${deviceCtlPath}" device install app --device ${deviceCtlId} "${appPath}"`;
              console.error(`실행할 설치 명령어: ${installCmd}`);
              
              const { stdout: installOutput } = await executeCommand(installCmd);
              console.error(`설치 결과: ${installOutput}`);
              
              // 설치 후 다시 실행 시도
              let retryLaunchCmd = `"${deviceCtlPath}" device process launch --device ${deviceCtlId}`;
              
              // 환경 변수 추가
              if (Object.keys(envVars).length > 0) {
                const envString = Object.entries(envVars)
                  .map(([key, value]) => `${key}=${value}`)
                  .join(",");
                retryLaunchCmd += ` --environment-variables "${envString}"`;
              }
              
              // 중단 모드로 시작 (디버깅용)
              if (startStopped) {
                retryLaunchCmd += " --start-stopped";
              }
              
              // 추가 인자 적용
              if (extraLaunchArgs.length > 0) {
                retryLaunchCmd += " " + extraLaunchArgs.join(" ");
              }
              
              // 번들 ID 추가
              retryLaunchCmd += ` ${bundleId}`;
              
              console.error(`재시도 명령어: ${retryLaunchCmd}`);
              const { stdout: retryOutput } = await executeCommand(retryLaunchCmd);
              
              let resultText = `앱 설치 및 실행 결과:\n설치: ${installOutput}\n실행: ${retryOutput}\n`;
              
              // 로그 스트리밍 (옵션이 활성화된 경우)
              if (streamLogs) {
                resultText += "\n로그 스트리밍이 시작되었습니다. 로그는 터미널에서 확인할 수 있습니다.\n";
                startDeviceLogStream(deviceCtlId, bundleId, xcodePath);
              }
              
              return {
                content: [{ type: "text", text: resultText }]
              };
            } catch (installError: any) {
              console.error(`수동 설치 실패: ${installError.message}`);
              return {
                content: [{ 
                  type: "text", 
                  text: `앱이 설치되지 않았고, 수동 설치도 실패했습니다:\n${installError.message}\n${installError.stderr || ''}`
                }],
                isError: true
              };
            }
          } else {
            // 다른 오류인 경우
            return {
              content: [{ 
                type: "text", 
                text: `실제 기기에서 앱 실행 중 오류가 발생했습니다:\n${launchError.message}\n${launchError.stderr || ''}`
              }],
              isError: true
            };
          }
        }
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