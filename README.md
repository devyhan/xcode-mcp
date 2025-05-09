# xcode-mcp

An MCP (Model Context Protocol) server that provides tools for Xcode-related operations, making it easier to work with Xcode projects from MCP clients like Claude Desktop. The server offers various utilities for Xcode project management, building, testing, archiving, code signing, and related iOS development tools.

## Features

- Xcode project information retrieval and scheme listing
- Enhanced build capabilities with clean and custom output options
- Comprehensive test execution with granular control
- App archiving and IPA export for distribution
- Code signing and provisioning profile management
- Swift Package Manager integration
- iOS Simulator management via simctl
- **NEW: Real Device App Deployment and Launch** with automatic Xcode installation detection and improved device management
- Intelligent handling of app installation failures with auto-retry
- Smart caching of device and Xcode information for better performance


## Installation

```bash
npm install @devyhan/xcode-mcp
```

## Usage

### Using with Claude Desktop

1. Open Claude Desktop config file:
   ```bash
   # macOS
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. Add or modify the following configuration:
   ```json
   {
     "mcpServers": {
       "xcode-mcp": {
         "command": "npx",
         "args": [
           "@devyhan/xcode-mcp",
           "-y"
         ]
       }
     }
   }
   ```

3. Restart Claude Desktop.

### Available Tools

#### 1. xcode-project-info

Retrieves detailed information about an Xcode project or workspace, including targets, configurations, and schemes.

**Parameters**:
- `projectPath` (required): Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
```

**Sample Output**:
```json
{
  "project": {
    "name": "MyApp",
    "targets": ["MyApp", "MyAppTests", "MyAppUITests"],
    "configurations": ["Debug", "Release"],
    "schemes": ["MyApp"]
  }
}
```

#### 2. xcode-list-schemes

Provides a comprehensive list of all available schemes, targets, and configurations in an Xcode project or workspace.

**Parameters**:
- `projectPath` (required): Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
```

**Sample Output**:
```
Information about project "MyApp":
    Targets:
        MyApp
        MyAppTests
        MyAppUITests

    Build Configurations:
        Debug
        Release

    Schemes:
        MyApp
        MyAppTests
```

#### 3. xcode-build

Builds an Xcode project or workspace with enhanced options. Supports both workspace and project builds, clean builds, and custom output directories.

**Parameters**:
- `projectPath` (required): Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)
- `scheme` (required): The scheme to build
- `configuration` (optional): Build configuration (e.g., Debug, Release)
- `destination` (optional): Build destination (e.g., 'platform=iOS Simulator,name=iPhone 14')
- `extraArgs` (optional): Additional xcodebuild arguments as array of strings
- `outputDir` (optional): Custom build output directory (SYMROOT)
- `clean` (optional): Whether to perform clean build (default: false)

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
Scheme: MyAppScheme
Configuration: Debug
Destination: platform=iOS Simulator,name=iPhone 14
Clean: true
OutputDir: /Users/username/Desktop/build
```

**Command Generated**:
```
xcodebuild -project "/Users/username/Projects/MyApp/MyApp.xcodeproj" -scheme "MyAppScheme" clean build -configuration "Debug" -destination "platform=iOS Simulator,name=iPhone 14" SYMROOT="/Users/username/Desktop/build"
```

#### 4. xcode-test

Runs tests for an Xcode project or workspace with extensive options. Provides fine-grained control over test execution, including running specific tests, test plans, and various testing modes.

**Parameters**:
- `projectPath` (required): Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)
- `scheme` (required): The scheme to test
- `destination` (required): Test destination (e.g., 'platform=iOS Simulator,name=iPhone 14')
- `testPlan` (optional): Name of the test plan to use
- `onlyTesting` (optional): Array of specific test identifiers to run
- `skipTesting` (optional): Array of test identifiers to skip
- `resultBundlePath` (optional): Path to save test result bundle
- `buildForTesting` (optional): Build for testing only without running tests
- `testWithoutBuilding` (optional): Run tests without building

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
Scheme: MyAppScheme
Destination: platform=iOS Simulator,name=iPhone 14
OnlyTesting: ["MyAppTests/LoginTests"]
ResultBundlePath: /Users/username/Desktop/TestResults
```

**Command Generated**:
```
xcodebuild -project "/Users/username/Projects/MyApp/MyApp.xcodeproj" -scheme "MyAppScheme" -destination "platform=iOS Simulator,name=iPhone 14" test -only-testing:"MyAppTests/LoginTests" -resultBundlePath "/Users/username/Desktop/TestResults"
```

#### 5. xcode-archive

Creates an archive (.xcarchive) of an Xcode project and optionally exports it to an IPA file for distribution. Supports App Store, ad-hoc, and enterprise distribution methods through export options plist.

**Parameters**:
- `projectPath` (required): Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)
- `scheme` (required): The scheme to archive
- `configuration` (optional): Build configuration (e.g., Release)
- `archivePath` (required): Path to save the .xcarchive file
- `exportPath` (optional): Path to export the archive (e.g., IPA file)
- `exportOptionsPlist` (optional): Path to the exportOptions.plist file

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
Scheme: MyAppScheme
Configuration: Release
ArchivePath: /Users/username/Desktop/MyApp.xcarchive
ExportPath: /Users/username/Desktop/Export
ExportOptionsPlist: /Users/username/Projects/MyApp/exportOptions.plist
```

**Commands Generated**:
```
# Archive command
xcodebuild -project "/Users/username/Projects/MyApp/MyApp.xcodeproj" -scheme "MyAppScheme" -configuration "Release" archive -archivePath "/Users/username/Desktop/MyApp.xcarchive"

# Export command (if exportPath and exportOptionsPlist are provided)
xcodebuild -exportArchive -archivePath "/Users/username/Desktop/MyApp.xcarchive" -exportPath "/Users/username/Desktop/Export" -exportOptionsPlist "/Users/username/Projects/MyApp/exportOptions.plist"
```

#### 6. xcode-codesign-info

Retrieves comprehensive code signing and provisioning profile information for an Xcode project. Shows installed code signing identities, project code signing settings, and provisioning profiles on the system.

**Parameters**:
- `projectPath` (required): Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)
- `target` (optional): Specific target name

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
Target: MyAppTarget
```

**Sample Output**:
```
코드 서명 인증서 목록:
  1) 01AB2345CD6789EF0123456789ABCDEF01234567 "Apple Development: John Doe (ABC12DEF34)"
  2) 9876543210FEDCBA98765432109876543210FEDC "Apple Distribution: Example Corp (XYZ12ABC3)"

프로젝트 코드 서명 설정:
    CODE_SIGN_IDENTITY = Apple Development
    CODE_SIGN_STYLE = Automatic
    DEVELOPMENT_TEAM = ABC123DEF4
    PROVISIONING_PROFILE_SPECIFIER = 

설치된 프로비저닝 프로파일:
-rw-r--r--  1 username  staff  12345 Feb  1 12:34 01234567-89ab-cdef-0123-456789abcdef.mobileprovision
-rw-r--r--  1 username  staff  23456 Mar 15 09:12 fedcba98-7654-3210-fedc-ba9876543210.mobileprovision
```

#### 7. swift-package-manager

Provides access to Swift Package Manager (SPM) functionality for managing Swift packages. Supports common SPM commands like init, update, resolve, reset, and clean.

**Parameters**:
- `command` (required): SPM command to execute ("init", "update", "resolve", "reset", "clean")
- `packageDir` (required): Directory path of the Swift Package
- `extraArgs` (optional): Additional SPM arguments as array of strings

**Example**:
```
Command: update
PackageDir: /Users/username/Projects/MySwiftPackage
ExtraArgs: ["--enable-pubgrub-resolver"]
```

**Command Generated**:
```
cd "/Users/username/Projects/MySwiftPackage" && swift package update --enable-pubgrub-resolver
```

**Sample Output**:
```
Resolving dependencies...
Fetching https://github.com/example/example-package.git
Checking out https://github.com/example/example-package.git at 1.2.3
```

#### 8. simctl-manager

Provides access to iOS Simulator management capabilities via the `simctl` command-line tool. Supports listing, creating, booting, installing apps, and managing simulator devices.

**Parameters**:
- `command` (required): SimCtl command ("list", "create", "boot", "shutdown", "erase", "install", "launch", "delete")
- `extraArgs` (optional): Additional simctl arguments as array of strings

**Example**:
```
Command: list
ExtraArgs: ["devices", "--json"]
```

**Command Generated**:
```
xcrun simctl list devices --json
```

**Sample Output (abbreviated)**:
```json
{
  "devices": {
    "com.apple.CoreSimulator.SimRuntime.iOS-17-0": [
      {
        "name": "iPhone 14",
        "udid": "12345678-1234-1234-1234-123456789ABC",
        "state": "Booted",
        "isAvailable": true
      }
    ]
  }
}
```

#### 9. run-on-device

Builds, installs, and runs an app on a physical iOS device. Supports device name (including Korean names) or UUID for device selection, environment variables, and log streaming. **Now with direct bundleId specification, skip build option, and additional launch arguments**.

**Parameters**:
- `projectPath` (required): Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)
- `scheme` (required): The scheme to build and run
- `device` (required): Device identifier or name (supports Korean names)
- `configuration` (optional): Build configuration (e.g., Debug, Release)
- `streamLogs` (optional): Whether to stream device logs after launching
- `startStopped` (optional): Whether to start the app in a paused state for debugger attachment
- `environmentVars` (optional): Environment variables to pass to the app (key1=value1,key2=value2 format)
- `xcodePath` (optional): Xcode application path (default: "/Applications/Xcode-16.2.0.app")
- `listDevices` (optional): Display all detected devices with their IDs before running
- `skipBuild` (optional): Skip the build and install step for already installed apps
- `extraLaunchArgs` (optional): Additional arguments to pass to the devicectl launch command
- `directBundleId` (optional): Directly specify the bundle ID instead of extracting from project

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
Scheme: MyAppScheme
Device: "Your-iPhone"
Configuration: Debug
StreamLogs: true
EnvironmentVars: "DEBUG_MODE=1,API_URL=https://test-api.example.com"
```

**Process**:
1. The tool identifies both Xcode UDID and CoreDevice UUID for the specified device
2. It uses the Xcode UDID for building and installing the app
3. It uses the CoreDevice UUID for launching the app with `devicectl`
4. It retrieves the app's bundle identifier
5. If requested, it streams the device logs

**Key Improvements in v0.4.0**:
- Ability to specify bundleId directly without needing a project
- Skip build and install step for already installed apps
- Support for additional devicectl launch command arguments
- Better device model and OS version information display
- Improved path handling and logging for devicectl commands

**Sample Output**:
```
// Standard output with build and install
앱 실행 결과:
Launched application with com.example.myapp bundle identifier.
로그 스트리밍이 시작되었습니다. 로그는 터미널에서 확인할 수 있습니다.

// Direct bundle ID usage with skip build
기기 모델: iPhone14,7
기기 OS 버전: 17.0
사용자 지정 번들 ID 사용: com.example.myapp
빌드 및 설치 과정 건너뛰기
앱 실행 결과:
Launched application with com.example.myapp bundle identifier.
```

### Example Scenario: Using with LLMs

Below is an example of how you might prompt an LLM like Claude to use these tools in sequence:

**User Prompt to Claude:**
```
I need to inspect my Xcode project, run some tests, and then archive it for distribution.

1. First, use the xcode-list-schemes tool to get all available schemes for my project at /Users/username/Projects/MyApp/MyApp.xcodeproj
2. After you see the schemes, run tests for the first available scheme on the iPhone 14 simulator.
3. Then archive the app for distribution using the Release configuration.
```

**Expected Workflow:**
1. Claude will execute the `xcode-list-schemes` tool to retrieve all schemes:
   ```
   Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
   ```

2. Claude will execute the `xcode-test` tool with the identified scheme:
   ```
   Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
   Scheme: [First scheme from output]
   Destination: platform=iOS Simulator,name=iPhone 14
   ```

3. Claude will then use the `xcode-archive` tool to create an archive:
   ```
   Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
   Scheme: [First scheme from output]
   Configuration: Release
   ArchivePath: /Users/username/Desktop/MyApp.xcarchive
   ```

This workflow demonstrates how to chain multiple tools together, using the output from one tool to inform the parameters for another.

### Example: Running on a Real Device

**User Prompt to Claude:**
```
I need to test my app on a real device:

1. Get the list of available devices (including connected physical devices)
2. Run my app on my connected iPhone 
```

**Expected Workflow:**
1. Claude will first get the list of devices:
   ```
   listDevices: true
   ```

2. Claude will identify your physical device and run the app on it:
   ```
   Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
   Scheme: MyApp
   Device: "Your iPhone" (or the device UUID)
   StreamLogs: true
   ```
   
3. For quick re-launch without rebuilding:
   ```
   Device: "Your iPhone"
   DirectBundleId: "com.example.myapp"
   SkipBuild: true
   ```

## Security Considerations

This tool can execute Xcode-related commands, which poses security risks. Please note:

- Only use with trusted Xcode projects.
- Be cautious with projects from unknown sources.
- Do not include sensitive information in build parameters.

## Development

### Requirements

- Node.js 16 or higher
- npm 6 or higher
- Xcode 14 or higher (for all features)
- Xcode 16 or higher (required for `devicectl` and real device features)

### Local Development and Testing

```bash
# Clone the repository
git clone https://github.com/devyhan/xcode-mcp.git
cd xcode-mcp

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Test
npm test
```

## License

MIT
