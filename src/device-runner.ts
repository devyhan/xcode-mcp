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

// 디바이스 정보를 저장하는 인터페이스
interface DeviceInfo {
  name: string;
  xcodeId?: string; // xcrun/xcodebuild에서 사용하는 식별자 (UDID)
  deviceCtlId?: string; // devicectl에서 사용하는 식별자 (CoreDevice UUID)
  isAvailable: boolean;
}

// 모든 디바이스 목록 가져오기
export async function getAllDevices(): Promise<DeviceInfo[]> {
  try {
    const devices: DeviceInfo[] = [];
    
    // 1. xctrace에서 디바이스 목록 가져오기 (UDID)
    try {
      const { stdout: xctraceOutput } = await executeCommand('xcrun xctrace list devices');
      const xctraceLines = xctraceOutput.split('\n');
      
      for (const line of xctraceLines) {
        // 실제 기기 및 오프라인 기기만 찾기 (시뮬레이터 제외)
        if (line.includes('(') && !line.includes('Simulator') && !line.includes('==')) {
          const nameMatch = line.match(/(.*?)\s+\(/);
          const idMatch = line.match(/\(([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})\)/i);
          
          if (nameMatch && idMatch) {
            const name = nameMatch[1].trim();
            const xcodeId = idMatch[1];
            
            // 이미 존재하는 디바이스가 있는지 확인
            const existingDevice = devices.find(d => d.name === name);
            if (existingDevice) {
              existingDevice.xcodeId = xcodeId;
            } else {
              devices.push({
                name,
                xcodeId,
                isAvailable: !line.includes('Offline')
              });
            }
          }
        }
      }
    } catch (xctraceError) {
      console.error('xctrace 디바이스 목록 조회 오류:', xctraceError);
    }
    
    // 2. devicectl에서 디바이스 목록 가져오기 (CoreDevice UUID)
    try {
      const { stdout: devicectlOutput } = await executeCommand('xcrun devicectl list devices');
      const devicectlLines = devicectlOutput.split('\n');
      
      let startProcessing = false;
      for (const line of devicectlLines) {
        if (line.includes('Name') && line.includes('Identifier')) {
          startProcessing = true;
          continue;
        }
        
        if (startProcessing && line.trim() !== '' && !line.startsWith('--')) {
          const columns = line.split(/\s{3,}/);
          if (columns.length >= 4) {
            const name = columns[0].trim();
            const deviceCtlId = columns[2].trim();
            const isAvailable = columns[3].includes('available') || columns[3].includes('connected');
            
            // 이미 존재하는 디바이스가 있는지 확인
            const existingDevice = devices.find(d => 
              d.name === name || 
              (d.name.includes(name) || name.includes(d.name))
            );
            
            if (existingDevice) {
              existingDevice.deviceCtlId = deviceCtlId;
              existingDevice.isAvailable = existingDevice.isAvailable || isAvailable;
            } else {
              devices.push({
                name,
                deviceCtlId,
                isAvailable
              });
            }
          }
        }
      }
    } catch (devicectlError) {
      console.error('devicectl 디바이스 목록 조회 오류:', devicectlError);
    }
    
    return devices;
  } catch (error) {
    console.error('디바이스 목록 조회 오류:', error);
    return [];
  }
}

// 디바이스 정보 가져오기
export async function findDeviceInfo(nameOrId: string): Promise<DeviceInfo> {
  const devices = await getAllDevices();
  
  // 먼저 정확한 ID로 검색
  let device = devices.find(d => 
    d.xcodeId === nameOrId || 
    d.deviceCtlId === nameOrId
  );
  
  // ID로 찾지 못한 경우 이름으로 검색
  if (!device) {
    device = devices.find(d => 
      d.name === nameOrId || 
      d.name.includes(nameOrId) || 
      nameOrId.includes(d.name)
    );
  }
  
  if (!device) {
    throw new Error(`기기를 찾을 수 없습니다: ${nameOrId}`);
  }
  
  return device;
}

// 기기 이름을 UUID로 변환하는 함수 (빌드용 - xcodebuild/xcrun 식별자)
export async function findDeviceIdentifier(nameOrId: string): Promise<string> {
  const device = await findDeviceInfo(nameOrId);
  
  if (!device.xcodeId) {
    throw new Error(`${device.name}의 Xcode 식별자를 찾을 수 없습니다.`);
  }
  
  return device.xcodeId;
}

// devicectl용 식별자 가져오기
export async function findDeviceCtlIdentifier(nameOrId: string): Promise<string> {
  const device = await findDeviceInfo(nameOrId);
  
  if (!device.deviceCtlId) {
    throw new Error(`${device.name}의 devicectl 식별자를 찾을 수 없습니다.`);
  }
  
  return device.deviceCtlId;
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