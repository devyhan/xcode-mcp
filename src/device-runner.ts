import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// 내부 유틸리티: 명령어 실행 함수
export async function executeCommand(command: string, workingDir?: string, timeout: number = 60000) {
  try {
    console.error(`명령어 실행: ${command} in ${workingDir || 'current directory'}`);
    
    // 보안 상의 이유로 위험한 명령어 필터링
    if (/rm\s+-rf\s+\//.test(command) || /mkfs/.test(command) || /dd\s+if/.test(command)) {
      throw new Error("보안상의 이유로 이 명령어를 실행할 수 없습니다.");
    }

    const options = {
      cwd: workingDir,
      timeout: timeout,
      // 버퍼 제한 제거
      maxBuffer: Infinity
    };

    const { stdout, stderr } = await execPromise(command, options);
    return { stdout, stderr };
  } catch (error: any) {
    console.error(`명령어 실행 오류: ${error.message}`);
    throw error;
  }
}

// 기기 이름을 UUID로 변환하는 함수
export async function findDeviceIdentifier(nameOrId: string): Promise<string> {
  // 이미 UUID 형식인 경우 그대로 반환
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(nameOrId)) {
    return nameOrId;
  }

  try {
    // xcrun xctrace list devices 명령으로 기기 목록 가져오기
    const { stdout } = await executeCommand('xcrun xctrace list devices');
    const lines = stdout.split('\n');

    // 이름이 포함된 줄 찾기 (한글 이름 포함)
    for (const line of lines) {
      if (line.includes(nameOrId)) {
        // UUID 추출 (괄호 안의 형식: 00008110-001E68812609401E)
        const match = line.match(/\(([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})\)/i);
        if (match && match[1]) {
          return match[1];
        }
      }
    }

    throw new Error(`기기를 찾을 수 없습니다: ${nameOrId}`);
  } catch (error: any) {
    console.error(`기기 식별자 검색 오류: ${error.message}`);
    throw error;
  }
}

// 번들 ID 가져오기
export async function getBundleIdentifier(projectPath: string, scheme: string): Promise<string> {
  try {
    // 프로젝트 정보에서 번들 ID 추출
    let command = 'xcodebuild -showBuildSettings';
    
    if (projectPath.endsWith(".xcworkspace")) {
      command += ` -workspace "${projectPath}"`;
    } else {
      command += ` -project "${projectPath}"`;
    }
    
    command += ` -scheme "${scheme}" | grep -m 1 "PRODUCT_BUNDLE_IDENTIFIER"`;
    
    const { stdout } = await executeCommand(command);
    const match = stdout.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*(.+)$/);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    throw new Error("번들 식별자를 찾을 수 없습니다.");
  } catch (error: any) {
    console.error(`번들 ID 검색 오류: ${error.message}`);
    throw error;
  }
}

// 앱 빌드 및 설치 함수
export async function buildAndInstallApp(projectPath: string, scheme: string, deviceId: string, configuration: string = "Debug"): Promise<void> {
  try {
    console.error(`앱 빌드 및 설치: ${projectPath}, 스킴: ${scheme}, 기기: ${deviceId}`);
    
    let command = `xcodebuild`;
    
    // 워크스페이스인지 프로젝트인지 확인
    if (projectPath.endsWith(".xcworkspace")) {
      command += ` -workspace "${projectPath}"`;
    } else {
      command += ` -project "${projectPath}"`;
    }
    
    command += ` -scheme "${scheme}" -configuration "${configuration}" -destination "platform=iOS,id=${deviceId}" build install`;
    
    await executeCommand(command);
    console.error("앱 빌드 및 설치 완료");
  } catch (error: any) {
    console.error(`앱 빌드 및 설치 오류: ${error.message}`);
    throw error;
  }
}

// 실제 기기에서 앱 실행 함수
export async function launchAppOnDevice(deviceId: string, bundleId: string, xcodePath: string = "/Applications/Xcode-16.2.0.app", environmentVars: Record<string, string> = {}, startStopped: boolean = false): Promise<string> {
  try {
    console.error(`실제 기기에서 앱 실행: 기기 ${deviceId}, 번들 ID: ${bundleId}`);
    
    // devicectl 명령 구성
    let command = `${xcodePath}/Contents/Developer/usr/bin/devicectl device process launch --device ${deviceId}`;
    
    // 환경 변수 추가
    if (Object.keys(environmentVars).length > 0) {
      const envString = Object.entries(environmentVars)
        .map(([key, value]) => `${key}=${value}`)
        .join(",");
      command += ` --environment-variables "${envString}"`;
    }
    
    // 중단 모드로 시작 (디버깅용)
    if (startStopped) {
      command += " --start-stopped";
    }
    
    // 번들 ID 추가
    command += ` ${bundleId}`;
    
    const { stdout, stderr } = await executeCommand(command);
    console.error("앱 실행 명령 완료", stdout);
    
    return stdout;
  } catch (error: any) {
    console.error(`앱 실행 오류: ${error.message}`);
    throw error;
  }
}

// 기기 로그 스트리밍 시작
export async function startDeviceLogStream(deviceId: string, bundleId: string, xcodePath: string = "/Applications/Xcode-16.2.0.app"): Promise<void> {
  try {
    console.error(`기기 로그 스트리밍 시작: 기기 ${deviceId}, 번들 ID: ${bundleId}`);
    
    // 비동기로 로그 스트리밍 실행
    const command = `${xcodePath}/Contents/Developer/usr/bin/devicectl device process view --device ${deviceId} --console ${bundleId}`;
    
    const { stdout, stderr } = await executeCommand(command);
    console.error("로그 스트리밍 명령 완료");
    
    return;
  } catch (error: any) {
    console.error(`로그 스트리밍 오류: ${error.message}`);
    // 로깅만 하고 오류는 전파하지 않음 (비필수 기능)
  }
}